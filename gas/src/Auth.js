/**
 * Google ID 토큰 검증 + 허용 사용자(USERS) 확인.
 * tokeninfo 결과는 토큰 만료 시각까지 캐시해 매 요청마다 외부 호출하지 않는다.
 */
const Auth = {
  verify(idToken) {
    if (!idToken) throw new ApiError('unauthenticated', '로그인이 필요합니다.');
    // JWT 형식이 아니면 Google 확인 요청을 보내지 않는다 (UrlFetch 일일 한도 고갈 공격 방지)
    if (typeof idToken !== 'string' || idToken.length > 4096 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(idToken)) {
      throw new ApiError('unauthenticated', '로그인 정보가 올바르지 않습니다. 다시 로그인하세요.');
    }

    const cache = CacheService.getScriptCache();
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken);
    const cacheKey = 'tok_' + Utilities.base64EncodeWebSafe(digest).slice(0, 43);
    let info = null;
    const hit = cache.get(cacheKey);
    if (hit) info = JSON.parse(hit);

    if (!info) {
      const res = UrlFetchApp.fetch(
        'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
        { muteHttpExceptions: true }
      );
      if (res.getResponseCode() !== 200) {
        throw new ApiError('unauthenticated', '로그인이 만료되었습니다. 다시 로그인하세요.');
      }
      const t = JSON.parse(res.getContentText());
      info = {
        email: String(t.email || '').toLowerCase(),
        emailVerified: String(t.email_verified) === 'true',
        aud: t.aud,
        exp: Number(t.exp),
        name: t.name || '',
        picture: t.picture || '',
      };
      const ttl = Math.min(21600, info.exp - Math.floor(Date.now() / 1000) - 30);
      if (ttl > 0) cache.put(cacheKey, JSON.stringify(info), ttl);
    }

    if (info.exp * 1000 < Date.now()) throw new ApiError('unauthenticated', '로그인이 만료되었습니다. 다시 로그인하세요.');
    if (info.aud !== Config.get('GOOGLE_CLIENT_ID')) throw new ApiError('unauthenticated', '이 앱에서 발급된 로그인이 아닙니다.');
    if (!info.emailVerified) throw new ApiError('forbidden', '이메일 인증이 완료되지 않은 Google 계정입니다.');

    const key = Config.users()[info.email];
    if (!key) throw new ApiError('forbidden', info.email + ' 계정은 DADA Music 사용 권한이 없습니다.');

    return { key: key, email: info.email, name: info.name, picture: info.picture };
  },

  /**
   * Google ID 토큰(1시간)을 자체 세션(30일, 사용 시 자동 연장)으로 교환.
   * 세션 원문은 클라이언트에만 있고, 서버(스크립트 속성)에는 SHA-256 해시만 저장한다.
   */
  createSession(idToken) {
    const user = Auth.verify(idToken);
    const raw = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
    const props = PropertiesService.getScriptProperties();
    props.setProperty(SESSION_PREFIX + sessionHash_(raw), JSON.stringify({ user: user, exp: Date.now() + SESSION_TTL_MS }));
    cleanupSessions_(props);
    return { sessionToken: raw, user: user };
  },

  verifySession(raw) {
    if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/.test(raw)) throw new ApiError('unauthenticated', '로그인이 필요합니다.');
    const props = PropertiesService.getScriptProperties();
    const key = SESSION_PREFIX + sessionHash_(raw);
    const v = props.getProperty(key);
    if (!v) throw new ApiError('unauthenticated', '로그인이 만료되었습니다. 다시 로그인하세요.');
    const s = JSON.parse(v);
    if (s.exp < Date.now()) {
      props.deleteProperty(key);
      throw new ApiError('unauthenticated', '로그인이 만료되었습니다. 다시 로그인하세요.');
    }
    // 허용 목록에서 빠진 사용자는 기존 세션도 즉시 거부
    if (Config.users()[s.user.email] !== s.user.key) {
      props.deleteProperty(key);
      throw new ApiError('forbidden', s.user.email + ' 계정은 DADA Music 사용 권한이 없습니다.');
    }
    // 사용 중이면 연장 (쓰기 횟수를 줄이려고 남은 기간이 20일 미만일 때만)
    if (s.exp - Date.now() < SESSION_TTL_MS - 10 * 24 * 3600 * 1000) {
      s.exp = Date.now() + SESSION_TTL_MS;
      props.setProperty(key, JSON.stringify(s));
    }
    return s.user;
  },

  endSession(raw) {
    if (typeof raw === 'string' && /^[0-9a-f]{64}$/.test(raw)) PropertiesService.getScriptProperties().deleteProperty(SESSION_PREFIX + sessionHash_(raw));
    return { ok: true };
  },
};

const SESSION_PREFIX = 'sess_';
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

function sessionHash_(raw) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw)).replace(/=+$/, '');
}

function cleanupSessions_(props) {
  const all = props.getProperties();
  const now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf(SESSION_PREFIX) !== 0) return;
    try { if (JSON.parse(all[k]).exp < now) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}
