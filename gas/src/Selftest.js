/**
 * 서버 자가 진단. GET ?selftest=<SELFTEST_KEY> 로 실행 (키는 Local.js, 깃 제외).
 * 테스트 전용 가상 사용자(__test__)로 API 핸들러를 직접 호출하고, 만든 데이터는 끝에서 지운다.
 * 검색 1회(100 units) 이상 사용.
 */
/** Gate 3 동기화 자가 진단 (?suite=sync). 일부 공개 테스트 목록을 만들고 끝에서 삭제. 약 650 units */
function selfTestSync_() {
  const user = { key: '__test__', email: 'selftest', name: 'selftest', picture: '' };
  const results = [];
  const check = function (id, name, fn) {
    const t0 = Date.now();
    try {
      results.push({ id: id, name: name, result: 'PASS', ms: Date.now() - t0, detail: fn() || '' });
    } catch (e) {
      results.push({ id: id, name: name, result: 'FAIL', ms: Date.now() - t0, detail: String(e && e.message ? e.message : e) });
    }
    results[results.length - 1].ms = Date.now() - t0;
  };
  const assert = function (cond, msg) { if (!cond) throw new Error(msg); };
  const tracks = Api.search(user, { q: '아이유 밤편지' }).slice(0, 4);
  const ids = tracks.map(function (t) { return t.videoId; });
  let plId = null;
  let r1 = null;
  let lastYt = null;
  let failed = [];
  const okFor = function (list, r) { return list.filter(function (v) { return r.failed.indexOf(v) < 0; }); };
  const track = function (r) { r.failed.forEach(function (v) { if (failed.indexOf(v) < 0) failed.push(v); }); return r; };

  check('G3-1', '첫 보내기: 새 목록 생성·순서 검증 (swap)', function () {
    plId = Api.createPlaylist(user, { title: 'SELFTEST 동기화', videoIds: ids.slice(0, 3) }).playlist.id;
    r1 = track(Sync.push(user, { id: plId }));
    assert(r1.mode === 'swap' && r1.videoIds.join() === okFor(ids.slice(0, 3), r1).join(), JSON.stringify(r1));
    assert(listYtIds_(r1.ytPlaylistId).join() === r1.videoIds.join(), 'YouTube 순서 불일치');
    lastYt = r1.ytPlaylistId;
    return r1.mode + ' · ' + r1.count + '곡 · ' + r1.units + ' units' + (r1.failed.length ? ' · 제외 ' + r1.failedReasons.join('; ') : '');
  });

  check('G3-2', '변경 없이 다시 보내기 → 생략 (skip)', function () {
    Db._cache = {};
    const r = Sync.push(user, { id: plId });
    assert(r.mode === 'skip' && r.ytPlaylistId === lastYt, JSON.stringify(r));
    return r.mode + ' · ' + r.units + ' units';
  });

  check('G3-3', '곡 추가 후 보내기 → 추가분만 삽입 (append)', function () {
    Api.addTracks(user, { id: plId, videoIds: [ids[3]] });
    Db._cache = {};
    const r = track(Sync.push(user, { id: plId }));
    assert(r.mode === 'append' && r.ytPlaylistId === lastYt && r.videoIds.join() === okFor(ids, r).join(), JSON.stringify(r));
    assert(listYtIds_(lastYt).join() === r.videoIds.join(), 'YouTube 순서 불일치');
    return r.mode + ' · ' + r.videoIds.length + '곡 · ' + r.units + ' units' + (r.failed.length ? ' · 제외 ' + r.failed.length : '');
  });

  check('G3-4', '순서 변경 후 보내기 → 새 목록 교체, 구 목록 삭제 (swap)', function () {
    const rev = ids.slice().reverse();
    Api.reorderPlaylist(user, { id: plId, videoIds: rev });
    Db._cache = {};
    const r = track(Sync.push(user, { id: plId }));
    assert(r.mode === 'swap' && r.ytPlaylistId !== lastYt, JSON.stringify(r));
    assert(r.videoIds.join() === okFor(rev, r).join() && listYtIds_(r.ytPlaylistId).join() === r.videoIds.join(), '새 목록 순서 불일치');
    assert(!ytPlaylistExists_(lastYt), '구 목록이 남아 있음');
    lastYt = r.ytPlaylistId;
    return r.mode + ' · ' + r.videoIds.length + '곡 · ' + r.units + ' units · 구 목록 삭제 확인' + (r.failed.length ? ' · 제외 ' + r.failed.length : '');
  });

  check('G3-5', '상태 표시: 동기화됨 / 변경됨', function () {
    Db._cache = {};
    const s1 = Api.getPlaylist(user, { id: plId }).playlist.sync.state;
    Api.removeTracks(user, { id: plId, videoIds: [ids[0]] });
    Db._cache = {};
    const s2 = Api.getPlaylist(user, { id: plId }).playlist.sync.state;
    assert(s1 === 'ok' && s2 === 'outdated', s1 + ' → ' + s2);
    return s1 + ' → (곡 빼기) → ' + s2;
  });

  check('G3-6', '중복 실행 방지', function () {
    CacheService.getScriptCache().put('sync_run_' + plId, '1', 30);
    let blocked = false;
    try { Sync.push(user, { id: plId }); } catch (e) { blocked = e.code === 'busy'; }
    CacheService.getScriptCache().remove('sync_run_' + plId);
    assert(blocked, '중복 실행이 막히지 않음');
    return '두 번째 요청 busy 응답';
  });

  check('G3-7', 'DADA 목록 삭제 시 YouTube 사본 삭제', function () {
    Api.deletePlaylist(user, { id: plId });
    plId = null;
    assert(!ytPlaylistExists_(lastYt), 'YouTube 목록이 남아 있음');
    return '삭제 확인';
  });

  if (plId) try { Api.deletePlaylist(user, { id: plId }); } catch (e) { /* ignore */ }
  const orphans = cleanupSelftestYt_();
  return { at: nowIso_(), quota: Quota.today(), orphansDeleted: orphans, passed: results.filter(function (r) { return r.result === 'PASS'; }).length, total: results.length, results: results };
}

/** 테스트가 중간에 실패해 남은 'DADA · SELFTEST…' YouTube 목록 정리 */
function cleanupSelftestYt_() {
  const res = Quota.call('playlists.list', function () { return YouTube.Playlists.list('snippet', { mine: true, maxResults: 50 }); });
  const stale = (res.items || []).filter(function (p) { return p.snippet.title.indexOf('DADA · SELFTEST') === 0; });
  stale.forEach(function (p) { safeDeletePlaylist_(p.id); });
  return stale.length;
}

function selfTest_() {
  const user = { key: '__test__', email: 'selftest', name: 'selftest', picture: '' };
  const results = [];
  const check = function (id, name, fn) {
    const t0 = Date.now();
    try {
      const detail = fn();
      results.push({ id: id, name: name, result: 'PASS', ms: Date.now() - t0, detail: detail || '' });
    } catch (e) {
      results.push({ id: id, name: name, result: 'FAIL', ms: Date.now() - t0, detail: String(e && e.message ? e.message : e) });
    }
  };
  const assert = function (cond, msg) { if (!cond) throw new Error(msg); };
  let tracks = [];
  let plId = null;

  check('G1-13', '검색: 실제 YouTube 결과 + 공식 음원 우선', function () {
    tracks = Api.search(user, { q: '아이유 밤편지' });
    assert(tracks.length >= 3, '결과 ' + tracks.length + '개');
    return tracks.slice(0, 3).map(function (t) { return '[' + t.kind + '] ' + t.artist + ' - ' + t.title; }).join(' | ');
  });

  check('G1-14', '같은 검색어 재검색 시 사용량 증가 없음', function () {
    const before = Quota.today().used;
    Db._cache = {};
    Api.search(user, { q: '아이유 밤편지' });
    const after = Quota.today().used;
    assert(after === before, '사용량 ' + before + ' → ' + after);
    return '사용량 그대로 ' + after;
  });

  check('G1-16', '좋아요 저장·조회·해제', function () {
    const v = tracks[0].videoId;
    Api.setReaction(user, { videoId: v, reaction: 'like' });
    Db._cache = {};
    assert(Api.listReactions(user, { reaction: 'like' }).tracks.some(function (t) { return t.videoId === v; }), '좋아요 목록에 없음');
    Api.setReaction(user, { videoId: v, reaction: 'dislike' });
    Db._cache = {};
    assert(!Api.listReactions(user, { reaction: 'like' }).tracks.length, '관심 없음 전환 실패');
    Api.setReaction(user, { videoId: v, reaction: null });
    return 'like → dislike → 해제';
  });

  check('G1-17a', '플레이리스트 생성', function () {
    plId = Api.createPlaylist(user, { title: 'SELFTEST' }).playlist.id;
    return plId;
  });

  check('G1-18', '곡 추가 + 중복 추가 차단', function () {
    const ids = tracks.slice(0, 3).map(function (t) { return t.videoId; });
    const r1 = Api.addTracks(user, { id: plId, videoIds: ids });
    assert(r1.added === 3, '추가 ' + r1.added);
    const r2 = Api.addTracks(user, { id: plId, videoIds: [ids[0]] });
    assert(r2.added === 0 && r2.duplicates === 1, '중복 처리 ' + JSON.stringify(r2));
    return '3곡 추가, 중복 1곡 건너뜀';
  });

  check('G1-19', '순서 변경 + 곡 빼기 유지', function () {
    Db._cache = {};
    const cur = Api.getPlaylist(user, { id: plId }).tracks.map(function (t) { return t.videoId; });
    const rev = cur.slice().reverse();
    Api.reorderPlaylist(user, { id: plId, videoIds: rev });
    Db._cache = {};
    const after = Api.getPlaylist(user, { id: plId }).tracks.map(function (t) { return t.videoId; });
    assert(after.join() === rev.join(), '순서 불일치');
    Api.removeTracks(user, { id: plId, videoIds: [rev[0]] });
    Db._cache = {};
    const left = Api.getPlaylist(user, { id: plId });
    assert(left.tracks.length === 2 && left.tracks[0].videoId === rev[1], '빼기 후 ' + left.tracks.length);
    return '역순 정렬 확인, 1곡 빼고 2곡 남음';
  });

  check('G1-17b', '이름 변경 + 삭제', function () {
    Api.updatePlaylist(user, { id: plId, title: 'SELFTEST 이름변경' });
    Db._cache = {};
    assert(Api.getPlaylist(user, { id: plId }).playlist.title === 'SELFTEST 이름변경', '이름 변경 실패');
    Api.deletePlaylist(user, { id: plId });
    Db._cache = {};
    let gone = false;
    try { Api.getPlaylist(user, { id: plId }); } catch (e) { gone = e.code === 'not_found'; }
    assert(gone, '삭제 후에도 조회됨');
    plId = null;
    return '변경·삭제 확인';
  });

  check('G1-11', '다른 사용자의 목록 접근 차단', function () {
    const other = { key: '__test_other__', email: '', name: '', picture: '' };
    const mine = Api.createPlaylist(user, { title: 'SELFTEST 격리' }).playlist.id;
    let blocked = false;
    try { Api.getPlaylist(other, { id: mine }); } catch (e) { blocked = e.code === 'not_found'; }
    const listed = Api.listPlaylists(other).playlists.some(function (p) { return p.id === mine; });
    Api.deletePlaylist(user, { id: mine });
    assert(blocked && !listed, '격리 실패');
    return '조회·목록 모두 차단';
  });

  check('G1-20', '국가별 인기(KR) + 출처 표기', function () {
    const c = Api.chart(user, { region: 'KR' });
    assert(c.tracks.length > 5 && c.source && c.note, '차트 ' + c.tracks.length);
    return c.tracks.length + '곡 · ' + c.source + ' · ' + c.note;
  });

  // 정리: 남은 테스트 데이터 제거
  if (plId) try { Api.deletePlaylist(user, { id: plId }); } catch (e) { /* ignore */ }
  withLock_(function () {
    Db.mutate('reactions', function (r) { return r.userKey.indexOf('__test') === 0; }, function () { return null; });
  });

  return { at: nowIso_(), quota: Quota.today(), passed: results.filter(function (r) { return r.result === 'PASS'; }).length, total: results.length, results: results };
}

/** AI 라디오 자가 진단 (?suite=radio). Gemini 1회 + 검색 최대 약 28회(캐시 제외). 만든 데이터는 끝에서 삭제 */
function selfTestRadio_() {
  const user = { key: '__test__', email: 'selftest', name: 'selftest', picture: '' };
  const results = [];
  const t0 = Date.now();
  let gen = null;
  let err = null;
  const seeds = Api.search(user, { q: '아이유 밤편지' }).slice(0, 1).concat(Api.search(user, { q: 'Coldplay Viva La Vida' }).slice(0, 1));
  try {
    gen = Radio.generate(user, { seedIds: seeds.map(function (t) { return t.videoId; }), region: 'mix', size: 20 });
  } catch (e) {
    err = String(e && e.message ? e.message : e);
  }
  const push = function (id, name, ok, detail) { results.push({ id: id, name: name, result: ok ? 'PASS' : 'FAIL', detail: detail }); };
  push('G2-1', 'Gemini 추천 → YouTube 확인 → 라디오 목록 생성', !!gen && gen.count >= 12,
    gen ? gen.count + '/' + gen.requested + '곡 채택 · 못 찾음 ' + gen.unmatched.length + ' · 캐시 ' + gen.cachedSearches + ' · ' + gen.units + ' units · ' + Math.round((Date.now() - t0) / 1000) + '초 · ' + gen.model : err);
  if (gen) {
    Db._cache = {};
    const pl = Api.getPlaylist(user, { id: gen.playlistId });
    const seedSet = {};
    seeds.forEach(function (s) { seedSet[s.videoId] = true; });
    push('G2-2', '좋아하는 노래(씨앗)는 라디오에서 제외', !pl.tracks.some(function (t) { return seedSet[t.videoId]; }), '');
    push('G2-3', '모든 곡에 추천 이유', pl.tracks.every(function (t) { return !!t.reason; }),
      pl.tracks.slice(0, 5).map(function (t) { return t.artist + ' - ' + t.title + ' (' + t.reason + ')'; }).join(' | '));
    const kr = pl.tracks.filter(function (t) { return /[가-힣]/.test(t.artist + t.title + t.channel); }).length;
    push('G2-4', '국내+해외 혼합 (한글 표기 곡 비율 참고)', kr > 0 && kr < pl.tracks.length, '한글 표기 ' + kr + '/' + pl.tracks.length);
    push('G2-5', 'AI 소개 문구', !!gen.note, gen.note);
    if (gen.unmatched.length) push('G2-i', '참고: YouTube에서 못 찾은 추천', true, gen.unmatched.join(' | '));
    Api.deletePlaylist(user, { id: gen.playlistId });
  }
  withLock_(function () {
    Db.mutate('radio_profiles', function (r) { return r.userKey.indexOf('__test') === 0; }, function () { return null; });
  });
  return { at: nowIso_(), quota: Quota.today(), passed: results.filter(function (r) { return r.result === 'PASS'; }).length, total: results.length, results: results };
}

/** 진단 (?suite=diag): 계정 A YouTube의 DADA 목록 실제 상태 vs DB 동기화 기록 */
function diag_() {
  const res = Quota.call('playlists.list', function () {
    return YouTube.Playlists.list('snippet,status,contentDetails', { mine: true, maxResults: 50 });
  });
  const yt = (res.items || [])
    .filter(function (p) { return p.snippet.title.indexOf('DADA') === 0; })
    .map(function (p) {
      return { id: p.id, title: p.snippet.title, privacy: p.status.privacyStatus, items: p.contentDetails.itemCount, published: p.snippet.publishedAt };
    });
  const records = Db.all('youtube_sync').map(function (r) {
    const pl = Db.find('playlists', function (x) { return x.id === r.playlistId; });
    return {
      dadaTitle: pl ? pl.title : '(삭제됨)', owner: r.ownerKey, ytPlaylistId: r.ytPlaylistId, status: r.status,
      error: r.error, syncedAt: r.syncedAt, requested: r.syncedIds ? r.syncedIds.split(',').length : 0,
      failed: r.failedIds ? r.failedIds.split(',').filter(String).length : 0,
      existsOnYoutube: yt.some(function (p) { return p.id === r.ytPlaylistId; }),
    };
  });
  let firstItems = null;
  if (records.length && records[records.length - 1].ytPlaylistId) {
    try { firstItems = listYtIds_(records[records.length - 1].ytPlaylistId).slice(0, 5); } catch (e) { firstItems = String(e.message); }
  }
  return { at: nowIso_(), youtube: yt, records: records, lastPlaylistFirstItems: firstItems, quota: Quota.today() };
}
