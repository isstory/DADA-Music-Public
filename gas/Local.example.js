/**
 * 서버 설정 견본 — 이 파일을 gas/src/Local.js 로 복사한 뒤 값을 채우세요.
 *
 *   복사: gas/Local.example.js  →  gas/src/Local.js
 *
 * gas/src/Local.js 는 .gitignore 로 커밋되지 않고, `npm run push`/`npm run deploy` 때
 * Google Apps Script 에만 올라갑니다. 이 견본 파일 자체는 src/ 밖에 있어 업로드되지 않습니다.
 * 키를 다른 사람에게 보내거나 채팅·문서에 붙여넣지 마세요.
 */
const LOCAL_CONFIG = {
  // Google Cloud > 사용자 인증 정보 > OAuth 클라이언트 ID (유형: 웹 애플리케이션)
  // web/.env.local 의 VITE_GOOGLE_CLIENT_ID 와 같은 값
  GOOGLE_CLIENT_ID: '여기에_클라이언트_ID.apps.googleusercontent.com',

  // 로그인을 허용할 Google 계정과 내부 키 (영문 소문자 한 글자면 충분)
  // 첫 번째 계정은 이 Apps Script 를 만든(=YouTube 재생목록이 생기는) 계정으로 하세요.
  USERS: {
    'me@gmail.com': 'a',
    // 'friend@gmail.com': 'b',
  },

  // https://aistudio.google.com/apikey 에서 발급
  GEMINI_API_KEY: '여기에_Gemini_API_키',
  GEMINI_MODEL: 'gemini-2.5-flash',

  // 서버 자가 진단용 비밀 키 (무작위 문자열 24자 이상). 예: PowerShell 에서
  //   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_})
  SELFTEST_KEY: '여기에_무작위_문자열',
};
