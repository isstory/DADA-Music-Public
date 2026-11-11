/**
 * AI 라디오: 좋아하는 노래(씨앗) + 지역(국내/해외/혼합) → Gemini 추천 → YouTube 실제 검색으로 확인 → 라디오 플레이리스트
 * - 사용자마다 라디오 플레이리스트 1개를 계속 갈아끼운다 (YouTube Music 보관함에도 1개만 유지)
 * - 추천 곡은 실제 YouTube 검색 결과와 제목이 맞을 때만 채택 (지어낸 곡 제거)
 * - 검색은 캐시 우선, 시트 쓰기는 마지막에 한 번에
 */
const RADIO_REGIONS = { kr: '국내', intl: '해외', mix: '국내+해외' };
const RADIO_SIZES = [20, 30];
const RADIO_MAX_SEEDS = 20;

const Radio = {
  get(user) {
    const prof = radioProfile_(user);
    const seeds = prof && prof.seedIds ? withReactions_(user, Tracks.getMany(prof.seedIds.split(',').filter(String))) : [];
    let radio = null;
    if (prof && prof.playlistId) {
      try { radio = Api.getPlaylist(user, { id: prof.playlistId }); } catch (e) { radio = null; }
    }
    return {
      seeds: seeds,
      region: prof && RADIO_REGIONS[prof.region] ? prof.region : 'mix',
      size: prof && RADIO_SIZES.indexOf(Number(prof.size)) >= 0 ? Number(prof.size) : 20,
      note: prof ? prof.note : '',
      generatedAt: prof ? prof.generatedAt : '',
      radio: radio,
    };
  },

  /** 씨앗·설정만 저장 */
  save(user, p) {
    const v = validate_(p);
    withLock_(function () {
      Tracks.ensure(v.seedIds);
      saveProfile_(user, { seedIds: v.seedIds.join(','), region: v.region, size: String(v.size) });
    });
    return Radio.get(user);
  },

  generate(user, p) {
    const v = validate_(p);
    if (!v.seedIds.length) throw new ApiError('bad_request', '좋아하는 노래를 한 곡 이상 등록하세요.');
    const startUnits = Quota.today().used;
    // 추천 곡 찾기(검색) + 보내기(곡당 50)까지 고려해 최소 여유 확인
    const reserveForSync = 50 * v.size + 150;
    if (Quota.today().limit - Quota.today().used < reserveForSync + 1000) {
      throw new ApiError('quota_exceeded', '오늘 남은 YouTube 사용량이 부족해 라디오를 만들 수 없습니다. 한국 시간 오후 4~5시에 초기화됩니다.');
    }

    let seeds;
    withLock_(function () { seeds = Tracks.getMany(Tracks.ensure(v.seedIds)); });
    const disliked = Tracks.getMany(
      Db.filter('reactions', function (r) { return r.userKey === user.key && r.reaction === 'dislike'; })
        .slice(-15).map(function (r) { return r.videoId; })
    );

    const ai = Ai.recommend(seeds, disliked, v.region, v.size + 8);

    // 제외: 씨앗, 싫어요
    const exclude = {};
    seeds.forEach(function (t) { exclude[t.videoId] = true; exclude[songKey_(t.artist, t.title)] = true; });
    disliked.forEach(function (t) { exclude[t.videoId] = true; });

    const picked = [];
    const unmatched = [];
    const searches = [];
    let stoppedByQuota = false;
    for (let i = 0; i < ai.songs.length && picked.length < v.size; i++) {
      const rec = ai.songs[i];
      if (exclude[songKey_(rec.artist, rec.title)]) continue;
      const q = Quota.today();
      if (q.used + 101 > q.limit - reserveForSync) { stoppedByQuota = true; break; }
      const r = Yt.searchNoWrite_(rec.artist + ' ' + rec.title, { maxResults: 5 });
      searches.push(r);
      const t = chooseMatch_(rec, r.tracks, exclude);
      if (!t) { unmatched.push(rec.artist + ' - ' + rec.title); continue; }
      exclude[t.videoId] = true;
      exclude[songKey_(rec.artist, rec.title)] = true;
      picked.push({ track: t, reason: String(rec.reason || '').slice(0, 60), origin: rec.origin });
    }
    if (!picked.length) throw new ApiError('ai_error', 'AI가 고른 곡을 YouTube에서 찾지 못했습니다. 다시 시도하거나 좋아하는 노래를 바꿔 보세요.');

    let playlistId;
    withLock_(function () {
      Yt.saveSearches_(searches);
      const prof = radioProfile_(user);
      const title = 'AI 라디오 · ' + RADIO_REGIONS[v.region];
      let pl = prof && prof.playlistId ? Db.find('playlists', function (r) { return r.id === prof.playlistId && r.ownerKey === user.key; }) : null;
      if (pl) {
        Db.mutate('playlists', function (r) { return r.id === pl.id; }, function (r) { r.title = title; r.updatedAt = nowIso_(); return r; });
      } else {
        const now = nowIso_();
        pl = { id: Utilities.getUuid(), ownerKey: user.key, title: title, kind: 'radio', createdAt: now, updatedAt: now };
        Db.insert('playlists', [pl]);
      }
      playlistId = pl.id;
      const prevItems = Db.filter('playlist_items', function (i) { return i.playlistId === pl.id; });
      writeItems_(pl.id, picked.map(function (x) { return x.track.videoId; }), prevItems);
      Db.mutate('radio_reasons', function (r) { return r.playlistId === pl.id; }, function () { return null; });
      Db.insert('radio_reasons', picked.map(function (x) { return { playlistId: pl.id, videoId: x.track.videoId, reason: x.reason }; }));
      saveProfile_(user, {
        seedIds: v.seedIds.join(','), region: v.region, size: String(v.size),
        playlistId: pl.id, note: ai.note, generatedAt: nowIso_(),
      });
    });

    return {
      playlistId: playlistId,
      count: picked.length,
      note: ai.note,
      requested: ai.songs.length,
      unmatched: unmatched,
      stoppedByQuota: stoppedByQuota,
      cachedSearches: searches.filter(function (s) { return !s.fresh; }).length,
      units: Quota.today().used - startUnits,
      model: ai.model,
    };
  },
};

// ---------- 내부 ----------
function validate_(p) {
  const seen = {};
  const seedIds = (p.seedIds || []).filter(function (id) {
    if (!/^[\w-]{11}$/.test(id) || seen[id]) return false;
    seen[id] = true;
    return true;
  });
  if (seedIds.length > RADIO_MAX_SEEDS) throw new ApiError('bad_request', '좋아하는 노래는 ' + RADIO_MAX_SEEDS + '곡까지 등록할 수 있습니다.');
  const region = RADIO_REGIONS[p.region] ? p.region : 'mix';
  const size = RADIO_SIZES.indexOf(Number(p.size)) >= 0 ? Number(p.size) : 20;
  return { seedIds: seedIds, region: region, size: size };
}

function radioProfile_(user) {
  return Db.find('radio_profiles', function (r) { return r.userKey === user.key; });
}

function saveProfile_(user, patch) {
  const prev = radioProfile_(user) || { userKey: user.key };
  const row = Object.assign({}, prev, patch, { userKey: user.key, updatedAt: nowIso_() });
  const n = Db.mutate('radio_profiles', function (r) { return r.userKey === user.key; }, function () { return row; });
  if (!n) Db.insert('radio_profiles', [row]);
}

/** 비교용 정규화: 소문자, 글자·숫자만 (한글 포함) */
function normKey_(s) {
  return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
function songKey_(artist, title) {
  return 'k:' + normKey_(artist) + '|' + normKey_(String(title || '').replace(/\(.*?\)|\[.*?\]/g, ''));
}

/** 추천(artist/title)과 실제 검색 결과가 같은 곡인지 판단 */
function chooseMatch_(rec, tracks, exclude) {
  const nt = normKey_(String(rec.title).replace(/\(.*?\)|\[.*?\]/g, ''));
  const na = normKey_(rec.artist);
  if (nt.length < 1) return null;
  const titleOk = function (t) {
    const full = normKey_(t.title);
    const bare = normKey_(String(t.title).replace(/\(.*?\)|\[.*?\]/g, ''));
    return full.indexOf(nt) >= 0 || (bare.length >= 2 && nt.indexOf(bare) >= 0);
  };
  const artistOk = function (t) {
    const ta = normKey_(t.artist) + '|' + normKey_(t.channel);
    const a = normKey_(t.artist);
    return ta.indexOf(na) >= 0 || (a.length >= 2 && na.indexOf(a) >= 0);
  };
  const pool = tracks.slice(0, 5).filter(function (t) { return !exclude[t.videoId]; });
  // 1순위: 제목·아티스트 모두 일치 / 2순위: 상위 2개 중 제목 일치 (예: '아이유' ↔ 'IU' 표기 차이)
  return pool.find(function (t) { return titleOk(t) && artistOk(t); }) ||
    pool.slice(0, 2).find(function (t) { return titleOk(t); }) || null;
}
