/**
 * 설정 읽기 순서: ① 스크립트 속성 → ② src/Local.js 의 LOCAL_CONFIG (gitignore, GAS에만 업로드)
 *
 *   GOOGLE_CLIENT_ID  웹 OAuth 클라이언트 ID (프론트 로그인용, aud 검증)
 *   USERS             {"a계정@gmail.com":"a","b계정@gmail.com":"b"}  허용 사용자와 내부 키
 *   SPREADSHEET_ID    최초 접속 시 자동 생성·저장 (스크립트 속성)
 */
const Config = {
  get(key) {
    const v = PropertiesService.getScriptProperties().getProperty(key) || this.local_(key);
    if (!v) throw new ApiError('config', '서버 설정 누락: ' + key + ' (docs/gate1/SETUP.md 참고)');
    return v;
  },
  local_(key) {
    // Local.js 가 없으면 LOCAL_CONFIG 미정의 → typeof 로 안전하게 확인
    if (typeof LOCAL_CONFIG === 'undefined' || LOCAL_CONFIG[key] === undefined) return '';
    const v = LOCAL_CONFIG[key];
    return typeof v === 'string' ? v : JSON.stringify(v);
  },
  users() {
    const raw = JSON.parse(this.get('USERS'));
    const out = {};
    Object.keys(raw).forEach(function (email) {
      out[email.trim().toLowerCase()] = String(raw[email]);
    });
    return out;
  },
};
