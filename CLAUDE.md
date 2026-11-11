# DADA Music — AI 작업 안내

좋아하는 노래로 AI 라디오를 만들어 YouTube Music 재생목록으로 보내는 개인용 웹앱. 사용자 1~2명.
전체 기획은 `docs/PROJECT_BRIEF.md`, 설치는 `docs/GUIDE_SETUP_AND_AI.md`, 보안은 `docs/SECURITY.md`.

## 구조
- `web/` — React 18 + TypeScript + Vite PWA. 화면만 담당. `VITE_API_URL` 이 비어 있으면 **데모 모드**(가짜 데이터, `src/lib/mock.ts`)로 동작
  - `src/lib/api.ts` 서버 호출, `auth.tsx` 로그인(리디렉션 → 30일 세션), `queries.ts` 데이터 훅(TanStack Query)
  - `src/pages/` 화면(Home, Search, Radio, Library, Liked, Playlist, Misc), `src/components/` 공통 부품
  - `src/styles/app.css` 디자인 토큰과 레이아웃 (Spotify형: PC ≥1280 / 태블릿 768–1279 / 모바일 ≤767)
- `gas/` — Google Apps Script 백엔드 (clasp). 모든 파일이 전역 스코프를 공유하는 일반 JS(V8), 모듈·import 없음
  - `Code.js` 진입점(doPost 라우팅, 입력 정리), `Auth.js` 로그인·세션, `Db.js` 시트 DB, `Youtube.js` 검색·곡 판별
  - `Sync.js` YouTube 재생목록 동기화, `Radio.js` + `Ai.js` AI 라디오, `Quota.js` 할당량, `Selftest.js` 자가 진단
  - `src/Local.js` 비밀 설정 (깃 제외, 견본은 `gas/Local.example.js`)
- `poc/` — 초기 기술 검증 스크립트 (참고용)

## 자주 쓰는 명령
```
cd web && npm run dev                 # http://localhost:5173
cd web && npx tsc -b && npx vite build
cd web && npx firebase deploy --only hosting
cd gas && npm run check               # GAS 문법 검사
cd gas && npm run deploy              # 코드 올리기 + 같은 URL로 재배포
```
서버 기능 확인: `GET <웹앱URL>?selftest=<SELFTEST_KEY>` (기본) / `&suite=sync` / `&suite=radio` / `&suite=status`

## 반드시 지킬 것
- **비밀값 커밋 금지:** `gas/src/Local.js`, `web/.env.local`, `.secrets/`, `gas/.clasp.json`, `gas/.deployment.json`. 키를 코드·문서·로그에 쓰지 말 것.
- **GAS 코드 규칙:** 파일 간 로드 순서가 보장되지 않으므로 최상위에서 다른 파일의 상수를 즉시 참조하지 말 것(함수 안에서 참조). 시트 쓰기는 `withLock_` 안에서. 새 시트(테이블)는 `Db.js` 의 `SCHEMA` 에 추가하면 자동 생성.
- **새 API 요청:** `Code.js` 의 `routes_()` 에 등록하고, 새 입력 필드는 `cleanPayload_()` 허용 목록에 추가해야 서버에 전달된다.
- **YouTube 할당량(하루 10,000):** 검색 100, 재생목록 쓰기 50/건. 입력할 때마다 검색하지 말 것, 캐시 우선. 재생목록 삽입은 반드시 순차로(병렬 시 순서 꼬임).
- **재생은 YouTube Music 공식 앱:** 웹앱에서 오디오만 재생하는 기능은 YouTube 정책 위반이므로 만들지 않는다.
- **디자인:** 포인트 색은 샴페인 `#C8A97E` 하나, 글꼴 Pretendard, 하단 바는 재생바가 아닌 동기화 상태 표시.
- 화면 문구는 한국어, 사용자가 이해하는 말로. 오류 문구는 무엇이 잘못됐고 어떻게 하면 되는지.
- 변경 후: `web` 은 `npx tsc -b`, `gas` 는 `npm run check` 로 확인. 서버 변경은 `npm run deploy` 해야 반영된다.
