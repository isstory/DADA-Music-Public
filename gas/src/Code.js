/**
 * DADA Music — GAS 백엔드 진입점
 *
 * 웹앱은 "나(A)로 실행 / 누구나 접근"으로 배포된다. 접근 제어는 GAS가 아니라
 * 요청 본문의 세션 토큰(Auth.verifySession)으로 한다. Google ID 토큰은 auth.session 에서만 받는다.
 *
 * CORS: GAS는 preflight(OPTIONS)를 처리하지 못하므로 프론트는 반드시
 * "단순 요청"(POST + Content-Type: text/plain, 커스텀 헤더 없음)으로 호출한다.
 * 토큰은 헤더가 아니라 본문에 담는다.
 */
const VERSION = '0.1.0';

/**
 * 상태 확인. 소유자(계정 A)가 브라우저로 이 URL을 처음 열면 권한 승인 화면이 뜨고,
 * 승인 후에는 DB가 없으면 자동 생성한다.
 */
function doGet(e) {
  const key = e && e.parameter && e.parameter.selftest;
  if (key) {
    let expected = '';
    try { expected = Config.get('SELFTEST_KEY'); } catch (err) { /* 키 미설정 시 비활성 */ }
    if (!expected || key !== expected) return json_({ ok: false, error: { code: 'forbidden', message: 'forbidden' } });
    const suites = { sync: selfTestSync_, radio: selfTestRadio_, diag: diag_, status: status_ };
    const fn = Object.prototype.hasOwnProperty.call(suites, e.parameter.suite) ? suites[e.parameter.suite] : selfTest_;
    return json_(fn());
  }
  // 공개 응답에는 DB 주소·설정 상태를 싣지 않는다 (보안 점검 2026-11-11)
  return json_({ ok: true, service: 'dada-music' });
}

/** 상세 상태 (자가 진단 키 필요). 최초 설치 시 DB 생성도 여기서 */
function status_() {
  const status = { ok: true, service: 'dada-music', version: VERSION };
  try {
    status.db = ensureDb_();
    status.config = ['GOOGLE_CLIENT_ID', 'USERS'].filter(function (k) {
      try { Config.get(k); return false; } catch (e) { return true; }
    });
    status.config = status.config.length ? '누락: ' + status.config.join(', ') : 'OK';
  } catch (err) {
    status.ok = false;
    status.error = String(err && err.message ? err.message : err);
  }
  return status;
}

function doPost(e) {
  let req;
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '';
    if (raw.length > 64 * 1024) throw new Error('too large');
    req = JSON.parse(raw);
    if (!req || typeof req !== 'object' || Array.isArray(req)) throw new Error('not object');
  } catch (err) {
    return json_({ ok: false, error: { code: 'bad_request', message: '요청 형식이 올바르지 않습니다.' } });
  }
  try {
    // 로그인: Google ID 토큰 → 30일 세션 / 로그아웃: 세션 삭제
    if (req.action === 'auth.session') return json_({ ok: true, data: Auth.createSession(req.idToken), quota: Quota.today() });
    if (req.action === 'auth.logout') return json_({ ok: true, data: Auth.endSession(req.sessionToken) });

    const user = Auth.verifySession(req.sessionToken);
    const routes = routes_();
    const action = typeof req.action === 'string' ? req.action : '';
    if (!Object.prototype.hasOwnProperty.call(routes, action)) throw new ApiError('not_found', '알 수 없는 요청입니다.');
    const data = routes[action](user, cleanPayload_(req.payload));
    return json_({ ok: true, data: data, quota: Quota.today() });
  } catch (err) {
    const known = err instanceof ApiError;
    if (!known) console.error(err && err.stack ? err.stack : err);
    const mapped = known ? err : Yt.mapError(err);
    return json_({ ok: false, error: { code: mapped.code, message: mapped.message }, quota: Quota.today() });
  }
}

/** 라우트는 호출 시점에 만든다 (GAS 파일 로드 순서와 무관하게 동작) */
function routes_() {
  return {
    me: Api.me,
    search: Api.search,
    chart: Api.chart,
    'reactions.set': Api.setReaction,
    'reactions.list': Api.listReactions,
    'playlists.list': Api.listPlaylists,
    'playlists.get': Api.getPlaylist,
    'playlists.create': Api.createPlaylist,
    'playlists.update': Api.updatePlaylist,
    'playlists.delete': Api.deletePlaylist,
    'playlists.addTracks': Api.addTracks,
    'playlists.removeTracks': Api.removeTracks,
    'playlists.reorder': Api.reorderPlaylist,
    'sync.push': Sync.push,
    'radio.get': Radio.get,
    'radio.save': Radio.save,
    'radio.generate': Radio.generate,
  };
}

/**
 * 입력 정리: 알려진 필드만 정해진 형식으로 통과시킨다.
 * 문자열 길이 제한, videoId 형식(11자) 검사, 배열 길이 제한.
 */
function cleanPayload_(p) {
  const out = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  const STR = { id: 64, title: 200, q: 200, region: 8, reaction: 16 };
  Object.keys(STR).forEach(function (k) {
    if (typeof p[k] === 'string') out[k] = p[k].slice(0, STR[k]);
  });
  if (p.reaction === null) out.reaction = null;
  ['videoIds', 'seedIds'].forEach(function (k) {
    if (Array.isArray(p[k])) {
      out[k] = p[k].filter(function (v) { return typeof v === 'string' && /^[\w-]{11}$/.test(v); }).slice(0, 300);
    }
  });
  if (typeof p.videoId === 'string' && /^[\w-]{11}$/.test(p.videoId)) out.videoId = p.videoId;
  if (typeof p.size === 'number' && isFinite(p.size)) out.size = p.size;
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
