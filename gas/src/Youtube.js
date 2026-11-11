/**
 * YouTube Data API (고급 서비스) + 곡 캐시.
 * - 검색 결과는 search_cache 에 7일 저장 → 같은 검색어는 100 units 를 다시 쓰지 않는다.
 * - 곡 메타데이터는 tracks 시트에 전역 캐시 (사용자 구분 없음).
 * - 곡 식별 규칙은 Gate 0 PoC에서 검증한 점수 규칙을 이식.
 */
const PENALTY_WORDS = [
  'live', 'cover', 'reaction', 'karaoke', 'instrumental', '1 hour', 'lyrics', 'lyric', 'sped up', 'slowed', 'fancam', 'stage', 'concert',
  '가사', '라이브', '커버', '노래방', '교차편집', '직캠', '무대', '콘서트', '방송',
  // 음악 방송·예능 무대 (Gate 1 자가 진단에서 '스케치북' 무대가 3위로 섞여 추가)
  '스케치북', 'sketchbook', '뮤직뱅크', 'music bank', '인기가요', '음악중심', '엠카운트다운', 'm countdown', 'show champion', '쇼챔피언', 'kbs', 'mbc', 'sbs', 'mnet',
];
const SEARCH_TTL_MS = 7 * 24 * 3600 * 1000;

const Yt = {
  search(q) {
    const r = this.searchNoWrite_(q);
    if (r.fresh) {
      withLock_(function () { Yt.saveSearches_([r]); });
    }
    return r.tracks;
  },

  /**
   * 검색 (캐시 우선). 시트 쓰기는 하지 않고 결과만 돌려준다 → 여러 건을 모아 saveSearches_ 로 한 번에 저장.
   * fresh=true 면 YouTube를 실제로 호출한 결과(100+1 units).
   */
  searchNoWrite_(q, opts) {
    const norm = String(q || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!norm) return { norm: norm, tracks: [], fresh: false };
    if (norm.length > 100) throw new ApiError('bad_request', '검색어가 너무 깁니다.');

    const cached = Db.find('search_cache', function (r) { return r.query === norm; });
    if (cached && Date.now() - Date.parse(cached.cachedAt) < SEARCH_TTL_MS) {
      return { norm: norm, tracks: Tracks.getMany(cached.videoIds.split(',').filter(String)), fresh: false };
    }

    const res = Quota.call('search.list', function () {
      return YouTube.Search.list('snippet', {
        q: q, type: 'video', videoCategoryId: '10', maxResults: (opts && opts.maxResults) || 15, regionCode: 'KR',
      });
    });
    const ids = (res.items || []).map(function (it) { return it.id.videoId; }).filter(String);
    const details = this.fetchDetails_(ids);
    const scored = details
      .map(function (v) { return { v: v, score: Yt.score_(v, norm) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (x) { return x.v; });
    return { norm: norm, tracks: scored.map(this.toTrack_), fresh: true };
  },

  /** searchNoWrite_ 결과들을 한 번에 저장 (잠금 안에서 호출) */
  saveSearches_(results) {
    const fresh = results.filter(function (r) { return r.fresh; });
    if (!fresh.length) return;
    const all = [];
    fresh.forEach(function (r) { r.tracks.forEach(function (t) { all.push(t); }); });
    Tracks.upsert(all);
    const norms = {};
    fresh.forEach(function (r) { norms[r.norm] = true; });
    Db.mutate('search_cache', function (r) { return norms[r.query]; }, function () { return null; });
    Db.insert('search_cache', fresh.map(function (r) {
      return { query: r.norm, videoIds: r.tracks.map(function (t) { return t.videoId; }).join(','), cachedAt: nowIso_() };
    }));
  },

  /** 국가별 인기 뮤직비디오 (1 unit, 6시간 캐시). 공식 음원 차트가 아님을 응답에 명시. */
  chart(region) {
    region = /^[A-Z]{2}$/.test(region || '') ? region : 'KR';
    const cache = CacheService.getScriptCache();
    const key = 'chart_' + region;
    const hit = cache.get(key);
    if (hit) return JSON.parse(hit);

    const res = Quota.call('videos.list', function () {
      return YouTube.Videos.list('snippet,contentDetails,status', {
        chart: 'mostPopular', videoCategoryId: '10', regionCode: region, maxResults: 25,
      });
    });
    const tracks = (res.items || []).filter(this.playable_).map(this.toTrack_);
    withLock_(function () { Tracks.upsert(tracks); });
    const out = {
      region: region,
      source: 'YouTube 인기 뮤직비디오',
      note: '공식 음원 차트가 아닙니다.',
      fetchedAt: nowIso_(),
      videoIds: tracks.map(function (t) { return t.videoId; }),
    };
    cache.put(key, JSON.stringify(out), 6 * 3600);
    return out;
  },

  /** videos.list 로 메타데이터 일괄 조회 (50개당 1 unit). 재생 불가 영상은 제외 */
  fetchDetails_(ids) {
    const out = [];
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const res = Quota.call('videos.list', function () {
        return YouTube.Videos.list('snippet,contentDetails,status', { id: chunk.join(','), maxResults: 50 });
      });
      (res.items || []).filter(this.playable_).forEach(function (v) { out.push(v); });
    }
    const order = {};
    ids.forEach(function (id, i) { order[id] = i; });
    return out.sort(function (a, b) { return order[a.id] - order[b.id]; });
  },

  playable_(v) {
    const st = v.status || {};
    if (st.privacyStatus === 'private' || st.uploadStatus === 'rejected' || st.uploadStatus === 'deleted') return false;
    const rr = (v.contentDetails && v.contentDetails.regionRestriction) || {};
    if (rr.blocked && rr.blocked.indexOf('KR') >= 0) return false;
    if (rr.allowed && rr.allowed.indexOf('KR') < 0) return false;
    return true;
  },

  score_(v, query) {
    const title = v.snippet.title.toLowerCase();
    const channel = v.snippet.channelTitle || '';
    let s = 0;
    if (/ - Topic$/.test(channel)) s += 100;
    if (/vevo|official|공식/i.test(channel)) s += 40;
    if (/official (music )?video|m\/v|\bmv\b/i.test(title)) s += 20;
    PENALTY_WORDS.forEach(function (w) { if (title.indexOf(w) >= 0 && query.indexOf(w) < 0) s -= 150; });
    if (/performance ver|dance practice|ver\.\s*\d|special clip|teaser|\bver\.\)/i.test(title)) s -= 30;
    return s;
  },

  toTrack_(v) {
    const sn = v.snippet;
    const channel = sn.channelTitle || '';
    const parsed = parseTitle_(sn.title, channel);
    const th = sn.thumbnails || {};
    const thumb = (th.high || th.medium || th.default || {}).url || '';
    return {
      videoId: v.id,
      title: parsed.title,
      artist: parsed.artist,
      channel: channel,
      kind: / - Topic$/.test(channel) ? 'art_track' : 'video',
      thumbnail: thumb,
      durationSec: String(isoDuration_(v.contentDetails && v.contentDetails.duration)),
      cachedAt: nowIso_(),
    };
  },

  mapError(err) {
    const msg = String((err && err.message) || err);
    if (/quota/i.test(msg)) return new ApiError('quota_exceeded', '오늘 YouTube 사용량을 모두 썼습니다. 한국 시간 오후 4~5시에 초기화됩니다.');
    if (/youtubeSignupRequired/i.test(msg)) return new ApiError('youtube_signup_required', '연결된 Google 계정에 YouTube 채널이 없습니다.');
    if (/Service invoked too many times|Exceeded maximum execution time/i.test(msg)) return new ApiError('busy', 'Google 서버가 바쁩니다. 잠시 후 다시 시도하세요.');
    return new ApiError('internal', '서버 오류가 발생했습니다. 잠시 후 다시 시도하세요.');
  },
};

/** 곡 캐시 (tracks 시트) */
const Tracks = {
  getMany(ids) {
    const map = {};
    Db.all('tracks').forEach(function (t) { map[t.videoId] = t; });
    return ids.map(function (id) { return map[id]; }).filter(Boolean).map(Tracks.normalize_);
  },

  upsert(tracks) {
    const have = {};
    Db.all('tracks').forEach(function (t) { have[t.videoId] = true; });
    const fresh = [];
    tracks.forEach(function (t) {
      if (!have[t.videoId]) { have[t.videoId] = true; fresh.push(t); }
    });
    Db.insert('tracks', fresh);
  },

  /** 캐시에 없는 곡만 YouTube에서 조회해 저장. 존재/재생 가능한 videoId 목록 반환 */
  ensure(ids) {
    ids = ids.filter(function (id) { return /^[\w-]{11}$/.test(id); });
    const have = {};
    Db.all('tracks').forEach(function (t) { have[t.videoId] = true; });
    const missing = ids.filter(function (id) { return !have[id]; });
    if (missing.length) {
      const tracks = Yt.fetchDetails_(missing).map(Yt.toTrack_);
      Tracks.upsert(tracks);
      tracks.forEach(function (t) { have[t.videoId] = true; });
    }
    return ids.filter(function (id) { return have[id]; });
  },

  normalize_(t) {
    return {
      videoId: t.videoId, title: t.title, artist: t.artist, channel: t.channel,
      kind: t.kind, thumbnail: t.thumbnail, durationSec: Number(t.durationSec) || 0,
    };
  },
};

function decodeHtml_(s) {
  return String(s).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

/** 영상 제목에서 아티스트/곡명 추출. 실패하면 채널명을 아티스트로 */
function parseTitle_(rawTitle, channel) {
  let title = decodeHtml_(rawTitle).trim();
  let artist = '';
  if (/ - Topic$/.test(channel)) {
    artist = channel.replace(/ - Topic$/, '');
  } else {
    // "[MV] 아이유 _ 블루밍" 같은 K-POP 채널 형식: 앞쪽 [태그] 제거, " _ " 도 구분자로 인정
    title = title.replace(/^\s*[\[【][^\]】]*[\]】]\s*/, '');
    let m = title.match(/^(.+?)\s+[-–—_]\s+(.+)$/);
    if (m) { artist = m[1]; title = m[2]; }
    else {
      m = title.match(/^(.+?)\s*['‘"“「『](.+?)['’"”」』]/);
      if (m) { artist = m[1]; title = m[2]; }
    }
    if (!artist) artist = channel.replace(/VEVO$/i, '').replace(/\s*(official|공식).*$/i, '').trim() || channel;
  }
  title = title
    .replace(/\s*[(\[](?:[^)\]]*?)(official|m\/?v|music video|video|audio|lyric|visualizer|가사|remaster(?:ed)?)[^)\]]*[)\]]/gi, '')
    .replace(/\s+(official\s+)?(music\s+)?(video|m\/?v|mv)\s*$/i, '')
    .trim();
  artist = artist.replace(/\s*\([^)]*\)\s*$/, '').trim();
  // "AKMU - '제목' M/V" 처럼 남는 앞뒤 따옴표 제거
  title = title.replace(/^[\s'‘’"“”]+|[\s'‘’"“”]+$/g, '').trim();
  return { title: title || decodeHtml_(rawTitle), artist: artist };
}

function isoDuration_(iso) {
  const m = String(iso || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}
