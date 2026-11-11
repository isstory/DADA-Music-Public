/**
 * API 핸들러. 모든 함수는 (user, payload) → data.
 * 접근 제어 원칙: 플레이리스트는 ownerKey === user.key 인 경우에만 읽기/쓰기.
 */
const MAX_PLAYLIST_ITEMS = 200;

const Api = {
  me(user) {
    withLock_(function () {
      const row = { key: user.key, email: user.email, name: user.name, picture: user.picture, lastSeenAt: nowIso_() };
      const n = Db.mutate('users', function (r) { return r.key === user.key; }, function () { return row; });
      if (!n) Db.insert('users', [row]);
    });
    return { user: user };
  },

  search(user, p) {
    return withReactions_(user, Yt.search(p.q));
  },

  chart(user, p) {
    const c = Yt.chart(p.region);
    return Object.assign({}, c, { tracks: withReactions_(user, Tracks.getMany(c.videoIds)) });
  },

  /** reaction: 'like' | 'dislike' | null(해제) */
  setReaction(user, p) {
    const reaction = p.reaction === 'like' || p.reaction === 'dislike' ? p.reaction : null;
    return withLock_(function () {
      if (!Tracks.ensure([p.videoId]).length) throw new ApiError('not_found', '재생할 수 없는 곡입니다.');
      const match = function (r) { return r.userKey === user.key && r.videoId === p.videoId; };
      const n = Db.mutate('reactions', match, function (r) {
        if (!reaction) return null;
        r.reaction = reaction; r.updatedAt = nowIso_(); return r;
      });
      if (!n && reaction) Db.insert('reactions', [{ userKey: user.key, videoId: p.videoId, reaction: reaction, updatedAt: nowIso_() }]);
      return { videoId: p.videoId, reaction: reaction };
    });
  },

  listReactions(user, p) {
    const want = p.reaction === 'dislike' ? 'dislike' : 'like';
    const rows = Db.filter('reactions', function (r) { return r.userKey === user.key && r.reaction === want; })
      .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    return { tracks: withReactions_(user, Tracks.getMany(rows.map(function (r) { return r.videoId; }))) };
  },

  listPlaylists(user) {
    const items = Db.all('playlist_items');
    const tracks = {};
    Db.all('tracks').forEach(function (t) { tracks[t.videoId] = t; });
    return {
      playlists: Db.filter('playlists', function (pl) { return pl.ownerKey === user.key; })
        .sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); })
        .map(function (pl) {
          const mine = items.filter(function (i) { return i.playlistId === pl.id; })
            .sort(function (a, b) { return Number(a.position) - Number(b.position); });
          return Object.assign(summarize_(pl, mine, tracks), {
            sync: Sync.statusFor(pl.id, mine.map(function (i) { return i.videoId; })),
          });
        }),
    };
  },

  getPlaylist(user, p) {
    const pl = ownPlaylist_(user, p.id);
    const items = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id; })
      .sort(function (a, b) { return Number(a.position) - Number(b.position); });
    const list = withReactions_(user, Tracks.getMany(items.map(function (i) { return i.videoId; })));
    // AI 라디오 목록이면 곡마다 추천 이유를 붙인다
    if (pl.kind === 'radio') {
      const why = {};
      Db.filter('radio_reasons', function (r) { return r.playlistId === pl.id; }).forEach(function (r) { why[r.videoId] = r.reason; });
      list.forEach(function (t) { t.reason = why[t.videoId] || ''; });
    }
    const totalSec = list.reduce(function (s, t) { return s + t.durationSec; }, 0);
    return {
      playlist: Object.assign(publicPlaylist_(pl, list.length, totalSec), {
        sync: Sync.statusFor(pl.id, items.map(function (i) { return i.videoId; })),
      }),
      tracks: list,
    };
  },

  createPlaylist(user, p) {
    const title = cleanTitle_(p.title);
    return withLock_(function () {
      const now = nowIso_();
      const pl = { id: Utilities.getUuid(), ownerKey: user.key, title: title, kind: 'manual', createdAt: now, updatedAt: now };
      Db.insert('playlists', [pl]);
      let added = 0;
      if (p.videoIds && p.videoIds.length) added = appendTracks_(pl, p.videoIds).added;
      return { playlist: publicPlaylist_(pl, added, 0) };
    });
  },

  updatePlaylist(user, p) {
    const title = cleanTitle_(p.title);
    return withLock_(function () {
      ownPlaylist_(user, p.id);
      Db.mutate('playlists', function (r) { return r.id === p.id; }, function (r) { r.title = title; r.updatedAt = nowIso_(); return r; });
      return { id: p.id, title: title };
    });
  },

  deletePlaylist(user, p) {
    return withLock_(function () {
      ownPlaylist_(user, p.id);
      Sync.removeFor(p.id); // YouTube 쪽 사본도 정리
      Db.mutate('playlist_items', function (r) { return r.playlistId === p.id; }, function () { return null; });
      Db.mutate('playlists', function (r) { return r.id === p.id; }, function () { return null; });
      return { id: p.id, deleted: true };
    });
  },

  /** 중복 곡은 건너뛴다 (재생목록 중복 방지 정책) */
  addTracks(user, p) {
    return withLock_(function () {
      const pl = ownPlaylist_(user, p.id);
      return appendTracks_(pl, p.videoIds || []);
    });
  },

  removeTracks(user, p) {
    const drop = {};
    (p.videoIds || []).forEach(function (id) { drop[id] = true; });
    return withLock_(function () {
      const pl = ownPlaylist_(user, p.id);
      const rest = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id && !drop[i.videoId]; })
        .sort(function (a, b) { return Number(a.position) - Number(b.position); });
      writeItems_(pl.id, rest.map(function (i) { return i.videoId; }), rest);
      return { removed: Object.keys(drop).length };
    });
  },

  /** videoIds 는 현재 목록과 같은 곡 집합이어야 한다 (순서만 변경) */
  reorderPlaylist(user, p) {
    return withLock_(function () {
      const pl = ownPlaylist_(user, p.id);
      const cur = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id; });
      const next = p.videoIds || [];
      const a = cur.map(function (i) { return i.videoId; }).sort().join(',');
      const b = next.slice().sort().join(',');
      if (a !== b) throw new ApiError('conflict', '목록이 다른 곳에서 바뀌었습니다. 새로고침 후 다시 시도하세요.');
      writeItems_(pl.id, next, cur);
      return { id: pl.id, count: next.length };
    });
  },
};

// ---------- 내부 헬퍼 ----------
function ownPlaylist_(user, id) {
  const pl = Db.find('playlists', function (r) { return r.id === id; });
  // 존재 여부를 숨기기 위해 남의 목록도 not_found 로 응답
  if (!pl || pl.ownerKey !== user.key) throw new ApiError('not_found', '플레이리스트를 찾을 수 없습니다.');
  return pl;
}

function appendTracks_(pl, videoIds) {
  const existing = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id; });
  const have = {};
  existing.forEach(function (i) { have[i.videoId] = true; });
  const uniq = [];
  let duplicates = 0;
  videoIds.forEach(function (id) {
    if (have[id]) { duplicates++; return; }
    have[id] = true; uniq.push(id);
  });
  if (existing.length + uniq.length > MAX_PLAYLIST_ITEMS) throw new ApiError('bad_request', '플레이리스트에는 최대 ' + MAX_PLAYLIST_ITEMS + '곡까지 담을 수 있습니다.');
  const valid = Tracks.ensure(uniq);
  const start = existing.length;
  const now = nowIso_();
  Db.insert('playlist_items', valid.map(function (id, i) { return { playlistId: pl.id, videoId: id, position: String(start + i), addedAt: now }; }));
  touch_(pl.id);
  return { added: valid.length, duplicates: duplicates, unavailable: uniq.length - valid.length };
}

function writeItems_(playlistId, orderedIds, prevItems) {
  const addedAt = {};
  prevItems.forEach(function (i) { addedAt[i.videoId] = i.addedAt; });
  const others = Db.filter('playlist_items', function (i) { return i.playlistId !== playlistId; });
  const mine = orderedIds.map(function (id, n) { return { playlistId: playlistId, videoId: id, position: String(n), addedAt: addedAt[id] || nowIso_() }; });
  Db.rewrite('playlist_items', others.concat(mine));
  touch_(playlistId);
}

function touch_(id) {
  Db.mutate('playlists', function (r) { return r.id === id; }, function (r) { r.updatedAt = nowIso_(); return r; });
}

function cleanTitle_(t) {
  const s = String(t || '').trim().replace(/\s+/g, ' ');
  if (!s) throw new ApiError('bad_request', '플레이리스트 이름을 입력하세요.');
  if (s.length > 80) throw new ApiError('bad_request', '이름은 80자 이내로 입력하세요.');
  return s;
}

function publicPlaylist_(pl, count, totalSec) {
  return { id: pl.id, title: pl.title, kind: pl.kind, createdAt: pl.createdAt, updatedAt: pl.updatedAt, count: count, totalSec: totalSec };
}

function summarize_(pl, items, trackMap) {
  const covers = items.slice(0, 4).map(function (i) { return (trackMap[i.videoId] || {}).thumbnail || ''; }).filter(String);
  const totalSec = items.reduce(function (s, i) { return s + (Number((trackMap[i.videoId] || {}).durationSec) || 0); }, 0);
  return Object.assign(publicPlaylist_(pl, items.length, totalSec), { covers: covers });
}

function withReactions_(user, tracks) {
  const mine = {};
  Db.filter('reactions', function (r) { return r.userKey === user.key; }).forEach(function (r) { mine[r.videoId] = r.reaction; });
  return tracks.map(function (t) { return Object.assign({}, t, { reaction: mine[t.videoId] || null }); });
}
