# DADA Music

좋아하는 노래 몇 곡을 고르면 AI가 비슷한 곡으로 라디오를 만들어 YouTube Music 재생목록으로 보내 주는 개인용 음악 앱 (사용자 1~2명). 재생은 YouTube Music 공식 앱이 맡고, DADA Music은 추천·플레이리스트 관리·재생목록 동기화를 맡는다.

## 먼저 읽을 문서
| 문서 | 내용 |
|---|---|
| [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md) | **기획서** — 기능, 구조, 설계 이유, 제약, 다음 할 일 |
| [docs/GUIDE_SETUP_AND_AI.md](docs/GUIDE_SETUP_AND_AI.md) | **설치·AI 활용 가이드** — 내 PC·내 계정으로 띄우기, 휴대폰 설치, Claude Code로 고쳐 쓰기 |
| [docs/PROMPTS.md](docs/PROMPTS.md) | **프롬프트 모음** — AI에게 어떻게 말해서 만들었는지, 바로 쓸 수 있는 프롬프트 |
| [docs/SECURITY.md](docs/SECURITY.md) | 비밀값 관리, 인증 구조, 보안 점검 결과 |
| [CLAUDE.md](CLAUDE.md) | AI 코딩 도구용 프로젝트 안내 (구조·명령·규칙) |

## 구성
```
web/   화면 — React + TypeScript + Vite PWA (Spotify형 레이아웃, Noir Atelier 디자인)
gas/   서버 — Google Apps Script (clasp), DB는 Google 시트, AI는 Gemini
poc/   초기 기술 검증 스크립트 (참고용)
design/noir-atelier.html   디자인 시스템 시안
docs/  기획서·가이드·보안·Gate별 검증 기록
```

## 빠른 실행 (데모 모드, 설정 불필요)
```
git clone https://github.com/isstory/DADA-Music-Public.git
cd DADA-Music-Public/web
npm install
npm run dev     # http://localhost:5173 — 가짜 데이터, 화면 오른쪽 위 DEMO 표시
```
실제 연동은 [설치 가이드](docs/GUIDE_SETUP_AND_AI.md) 3장을 따른다.

## 진행 상황
| Gate | 내용 | 상태 |
|---|---|---|
| 0 | 기술 검증 (API 재생목록 → YouTube Music 재생·화면 OFF) | ✅ [결과](docs/gate0/CHECKLIST.md) |
| 1 | 로그인·DB·검색·좋아요·플레이리스트 | ✅ [검증표](docs/gate1/CHECKLIST.md) |
| 2 | AI 라디오 (Gemini 추천) | ✅ [검증표](docs/gate2/CHECKLIST.md) |
| 3 | YouTube Music 동기화 | ✅ [검증표](docs/gate3/CHECKLIST.md) |
| 보안 | 세션 로그인, 서버 강화, 보안 헤더 | ✅ [보고서](docs/SECURITY.md) |

## 비밀값
저장소에는 키가 없다. 직접 실행하려면 각자 만든다(모두 깃 제외).
- `gas/src/Local.js` — 견본 `gas/Local.example.js` 복사
- `web/.env.local` — 견본 `web/.env.example` 복사
