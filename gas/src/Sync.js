/**
 * Gate 3 — DADA 플레이리스트 → YouTube(Music) 재생목록 동기화
 *
 * 전략 (Gate 0 PoC 검증 결과 반영)
 *  - skip   : 지난 동기화와 곡·순서가 같고 YouTube 목록이 살아 있으면 아무것도 안 함 (≈1 unit)
 *  - append : 지난 목록 뒤에 곡만 추가된 경우, 기존 YouTube 목록에 추가분만 삽입 (50 × 추가곡)
 *  - swap   : 그 외에는 새 목록을 만들어 순서대로 삽입 → 실제 조회로 검증 → 통과 시에만 교체·구 목록 삭제
 *             실패하면 기존 목록을 그대로 두므로 사용자는 계속 이전 목록으로 들을 수 있다
 *  - 삽입은 반드시 순차 (병렬 시 순서 꼬임), 검증은 쓰기 직후 지연을 고려해 백오프 재조회
 *  - YouTube 계정 소유자(A) 본인 목록은 비공개, 다른 사용자 목록은 링크로 열 수 있게 일부 공개
 */
const SYNC_RUNNING_TTL = 360; // 초 (GAS 최대 실행 6분)

const Sync = {
  push(user, p) {
    const pl = ownPlaylist_(user, p.id);
    const ids = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id; })
      .sort(function (a, b) { return Number(a.position) - Number(b.position); })
      .map(function (i) { return i.videoId; });
    if (!ids.length) throw new ApiError('bad_request', '빈 플레이리스트는 보낼 수 없습니다. 곡을 먼저 담으세요.');

    // 이중 클릭·동시 실행 방지 (긴 작업이라 스크립트 잠금 대신 캐시 플래그)
    const cache = CacheService.getScriptCache();
    const runKey = 'sync_run_' + pl.id;
    if (cache.get(runKey)) throw new ApiError('busy', '이미 보내는 중입니다. 잠시 후 다시 확인하세요.');
    cache.put(runKey, '1', SYNC_RUNNING_TTL);

    const prev = syncRecord_(pl.id);
    const startUnits = Quota.today().used;
    try {
      const prevIds = prev && prev.syncedIds ? prev.syncedIds.split(',') : [];
      const prevFailed = prev && prev.failedIds ? prev.failedIds.split(',').filter(String) : [];
      const prevExpected = prevIds.filter(function (v) { return prevFailed.indexOf(v) < 0; });
      const alive = prev && prev.ytPlaylistId ? ytPlaylistExists_(prev.ytPlaylistId) : false;

      // 1) 변경 없음
      if (alive && prevIds.join(',') === ids.join(',')) {
        return result_('skip', prev.ytPlaylistId, prevExpected, prevFailed, startUnits);
      }

      // 2) 뒤에 곡만 추가됨 → 추가분만 삽입
      const isAppend = alive && prevIds.length && prevIds.length < ids.length &&
        ids.slice(0, prevIds.length).join(',') === prevIds.join(',');
      if (isAppend) {
        ensureQuota_(50 * (ids.length - prevIds.length) + 5);
        const tail = ids.slice(prevIds.length);
        const failed = insertAll_(prev.ytPlaylistId, tail);
        const expected = prevExpected.concat(tail.filter(function (v) { return failed.indexOf(v) < 0; }));
        const allFailed = prevFailed.concat(failed);
        if (!verify_(prev.ytPlaylistId, expected)) {
          // 기록을 비워 다음 보내기는 반드시 새 목록 교체(swap)로 → 같은 곡 중복 삽입 방지
          saveRecord_(pl, user, prev.ytPlaylistId, [], [], 'error', '확인 실패 — 다음 보내기 때 새 목록으로 교체');
          throw new ApiError('sync_verify', 'YouTube 목록 확인에 실패했습니다. 다시 보내기를 누르면 새 목록으로 교체합니다.');
        }
        saveRecord_(pl, user, prev.ytPlaylistId, ids, allFailed, 'ok', failNote_(allFailed));
        return result_('append', prev.ytPlaylistId, expected, allFailed, startUnits);
      }

      // 3) 새 목록으로 교체
      ensureQuota_(50 + 50 * ids.length + 50 + 10);
      const created = Quota.call('playlists.insert', function () {
        return YouTube.Playlists.insert({
          snippet: {
            title: ('DADA · ' + pl.title).slice(0, 150),
            description: 'DADA Music에서 보낸 목록입니다. 목록을 바꾸면 새 목록으로 교체됩니다.',
          },
          // 비공개는 휴대폰 YTM 앱 계정이 다르면 '문제가 발생했습니다'로 열리지 않음 → 링크로만 열리는 일부 공개 (사용자 승인 2026-11-09)
          status: { privacyStatus: configOr_('YT_PRIVACY', 'unlisted') },
        }, 'snippet,status');
      });
      const newId = created.id;
      const failed = insertAll_(newId, ids);
      const expected = ids.filter(function (v) { return failed.indexOf(v) < 0; });

      if (!expected.length || !verify_(newId, expected)) {
        safeDeletePlaylist_(newId); // 불완전한 새 목록 정리, 기존 목록은 유지
        saveRecord_(pl, user, prev ? prev.ytPlaylistId : '', prevIds, prevFailed, 'error', '확인 실패 — 이전 목록 유지');
        throw new ApiError('sync_verify', 'YouTube 목록 확인에 실패해 이전 목록을 그대로 두었습니다. 다시 보내기를 눌러 주세요.');
      }

      saveRecord_(pl, user, newId, ids, failed, 'ok', failNote_(failed));
      if (prev && prev.ytPlaylistId && prev.ytPlaylistId !== newId) safeDeletePlaylist_(prev.ytPlaylistId);
      return result_('swap', newId, expected, failed, startUnits);
    } catch (err) {
      if (!(err instanceof ApiError) || err.code !== 'sync_verify') {
        const mapped = err instanceof ApiError ? err : Yt.mapError(err);
        try { saveRecord_(pl, user, prev ? prev.ytPlaylistId : '', prev && prev.syncedIds ? prev.syncedIds.split(',') : [], prev && prev.failedIds ? prev.failedIds.split(',').filter(String) : [], 'error', mapped.message); } catch (e) { /* ignore */ }
        throw mapped;
      }
      throw err;
    } finally {
      cache.remove(runKey);
    }
  },

  /** 플레이리스트별 동기화 상태 (현재 곡 목록과 비교해 outdated 판정) */
  statusFor(playlistId, currentIds) {
    const r = syncRecord_(playlistId);
    if (!r || !r.ytPlaylistId) return { state: r && r.status === 'error' ? 'error' : 'none', error: r ? r.error : '' };
    const same = r.syncedIds === currentIds.join(',');
    return {
      state: r.status === 'error' ? 'error' : same ? 'ok' : 'outdated',
      ytPlaylistId: r.ytPlaylistId,
      url: ytmPlayUrl_(r.ytPlaylistId, firstOk_(r)),
      listUrl: ytmPlaylistUrl_(r.ytPlaylistId),
      syncedAt: r.syncedAt,
      note: r.error || '',
    };
  },

  /** DADA 목록 삭제 시 YouTube 사본도 정리 */
  removeFor(playlistId) {
    const r = syncRecord_(playlistId);
    if (r && r.ytPlaylistId) safeDeletePlaylist_(r.ytPlaylistId);
    Db.mutate('youtube_sync', function (x) { return x.playlistId === playlistId; }, function () { return null; });
  },
};

// ---------- 내부 ----------
function syncRecord_(playlistId) {
  return Db.find('youtube_sync', function (r) { return r.playlistId === playlistId; });
}

function saveRecord_(pl, user, ytId, ids, failedIds, status, error) {
  withLock_(function () {
    const row = {
      playlistId: pl.id, ownerKey: user.key, ytPlaylistId: ytId || '', syncedIds: ids.join(','), failedIds: (failedIds || []).join(','),
      syncedAt: nowIso_(), status: status, error: error || '',
    };
    const n = Db.mutate('youtube_sync', function (r) { return r.playlistId === pl.id; }, function () { return row; });
    if (!n) Db.insert('youtube_sync', [row]);
  });
}

function insertAll_(ytId, ids) {
  insertAll_.lastErrors = insertAll_.lastErrors || {};
  const failed = [];
  ids.forEach(function (videoId) {
    try {
      // 같은 목록에 연속 삽입 시 YouTube가 간헐적으로 409 'operation was aborted' 를 반환 → 백오프 재시도
      for (let attempt = 0; ; attempt++) {
        try {
          Quota.call('playlistItems.insert', function () {
            return YouTube.PlaylistItems.insert({
              snippet: { playlistId: ytId, resourceId: { kind: 'youtube#video', videoId: videoId } },
            }, 'snippet');
          });
          break;
        } catch (inner) {
          const transient = /aborted|409|conflict|backendError|SERVICE_UNAVAILABLE|503|500|internal error/i.test(String(inner && inner.message));
          if (!transient || attempt >= 3) throw inner;
          Utilities.sleep(1000 * Math.pow(2, attempt));
        }
      }
    } catch (e) {
      const msg = String(e && e.message);
      if (/quota/i.test(msg)) throw e; // 할당량 소진은 전체 중단
      console.warn('insert 실패 ' + videoId + ': ' + msg);
      insertAll_.lastErrors[videoId] = msg.replace(/^.*?failed with error: /, '').slice(0, 160);
      failed.push(videoId);
    }
  });
  return failed;
}

function listYtIds_(ytId) {
  const out = [];
  let pageToken;
  do {
    const res = Quota.call('playlistItems.list', function () {
      return YouTube.PlaylistItems.list('contentDetails', { playlistId: ytId, maxResults: 50, pageToken: pageToken });
    });
    (res.items || []).forEach(function (it) { out.push(it.contentDetails.videoId); });
    pageToken = res.nextPageToken;
  } while (pageToken);
  return out;
}

/** 쓰기 직후 조회 지연(Gate 0 B-8) 대비: 2s → 4s → 8s 재조회 */
function verify_(ytId, expected) {
  for (let attempt = 0; attempt <= 3; attempt++) {
    if (listYtIds_(ytId).join(',') === expected.join(',')) return true;
    if (attempt < 3) Utilities.sleep(2000 * Math.pow(2, attempt));
  }
  return false;
}

function ytPlaylistExists_(ytId) {
  try {
    const r = Quota.call('playlists.list', function () { return YouTube.Playlists.list('id', { id: ytId }); });
    return !!(r.items && r.items.length);
  } catch (e) {
    return false;
  }
}

function safeDeletePlaylist_(ytId) {
  try {
    Quota.call('playlists.delete', function () { return YouTube.Playlists.remove(ytId); });
  } catch (e) {
    console.warn('재생목록 삭제 실패(무시) ' + ytId + ': ' + (e && e.message));
  }
}

function ensureQuota_(needed) {
  const q = Quota.today();
  if (q.used + needed > q.limit) {
    throw new ApiError('quota_exceeded', '오늘 남은 YouTube 사용량(' + (q.limit - q.used) + ')이 부족합니다. 이 목록을 보내려면 약 ' + needed + '이 필요합니다. 한국 시간 오후 4~5시에 초기화됩니다.');
  }
}

function configOr_(key, fallback) {
  try { return Config.get(key); } catch (e) { return fallback; }
}

/** 첫 곡부터 목록 재생 (목록 페이지를 거치지 않음) */
function ytmPlayUrl_(ytId, firstVideoId) {
  return firstVideoId ? 'https://music.youtube.com/watch?v=' + firstVideoId + '&list=' + ytId : ytmPlaylistUrl_(ytId);
}

function firstOk_(r) {
  const failed = r.failedIds ? r.failedIds.split(',') : [];
  return (r.syncedIds || '').split(',').filter(function (v) { return v && failed.indexOf(v) < 0; })[0] || '';
}

function ytmPlaylistUrl_(ytId) {
  return 'https://music.youtube.com/playlist?list=' + ytId;
}

function failNote_(failed) {
  return failed.length ? failed.length + '곡은 YouTube 재생목록에 넣을 수 없어 제외' : '';
}

function result_(mode, ytId, ids, failed, startUnits) {
  return {
    mode: mode,
    ytPlaylistId: ytId,
    url: ytmPlayUrl_(ytId, ids[0]),
    listUrl: ytmPlaylistUrl_(ytId),
    firstVideoId: ids[0] || '',
    count: ids.length,
    videoIds: ids,
    failed: failed,
    failedReasons: failed.map(function (v) { return v + ': ' + ((insertAll_.lastErrors || {})[v] || '이전 동기화에서 제외'); }),
    units: Quota.today().used - startUnits,
  };
}
