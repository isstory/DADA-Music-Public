# Gate 1 — 실행 설정 (PWA + GAS)

구성: `web/` (React PWA 화면) → `gas/` (Apps Script 백엔드, 계정 A 권한으로 실행) → Google 시트(DB) / YouTube Data API

> GAS 없이 화면만 보려면 `web/` 에서 `npm run dev` — `VITE_API_URL` 이 비어 있으면 **데모 모드**(가짜 데이터, 화면 우상단 DEMO 표시)로 동작합니다.

전체 약 20분. 모두 **계정 A**로 진행합니다.

## 1. Apps Script API 켜기
https://script.google.com/home/usersettings → **Google Apps Script API: 사용**

## 2. GAS 프로젝트 만들고 올리기
```powershell
cd gas
npm install
npm run login      # 브라우저에서 계정 A 선택 → 허용
npm run create     # Apps Script 프로젝트 생성 (.clasp.json 생성, 커밋 안 됨)
npm run push       # src/ 코드 업로드
npm run open       # Apps Script 편집기 열기
```

## 3. 웹 로그인용 OAuth 클라이언트 (Gate 0의 Google Cloud 프로젝트에서)
1. Google Cloud Console → **API 및 서비스 → 사용자 인증 정보 → 클라이언트 만들기**
   - 유형: **웹 애플리케이션**, 이름: `dada-web`
   - 승인된 JavaScript 원본: `http://localhost:5173` (배포 후 호스팅 주소 추가)
   - 리디렉션 URI: 비워둠
2. 생성된 **클라이언트 ID** 복사 (`…apps.googleusercontent.com`). 클라이언트 보안 비밀번호는 필요 없습니다.
3. **OAuth 동의 화면 → 대상 → 테스트 사용자**에 **계정 B 추가** (A는 이미 등록됨)

## 4. 스크립트 속성 설정 (편집기에서)
편집기 왼쪽 ⚙ **프로젝트 설정 → 스크립트 속성 → 속성 추가**

| 속성 | 값 |
|---|---|
| `GOOGLE_CLIENT_ID` | 3단계의 클라이언트 ID |
| `USERS` | `{"계정A@gmail.com":"a","계정B@gmail.com":"b"}` |

## 5. DB 만들기 + 권한 승인
1. 편집기 상단 함수 선택에서 **`setup`** → ▶ 실행
2. 권한 요청 → 계정 A 선택 → "Google에서 확인하지 않은 앱" → **고급 → 이동** → 허용
3. 실행 로그에 `DB 준비 완료: https://docs.google.com/spreadsheets/...` 가 나오면 성공 (내 드라이브에 `DADA Music DB` 생성)
4. **`checkYoutube`** 도 한 번 실행 → `YouTube 연결 OK: Coldplay - Viva La Vida ...`

## 6. 웹앱 배포
```powershell
npm run deploy     # push + 배포. 이후에도 코드 수정 시 이 명령 하나로 같은 URL에 재배포
```
출력된 `https://script.google.com/macros/s/AKfy…/exec` 를 복사합니다.

## 7. 화면 실행
`web/.env.local` 파일 생성 (커밋 안 됨):
```
VITE_API_URL=https://script.google.com/macros/s/AKfy…/exec
VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
```
```powershell
cd web
npm install
npm run dev        # http://localhost:5173
```

## 문제 해결
| 증상 | 원인 / 해결 |
|---|---|
| `서버 설정 누락: USERS` | 4단계 스크립트 속성 확인 |
| `○○ 계정은 사용 권한이 없습니다` | `USERS` 에 그 이메일이 있는지(소문자) 확인 |
| `이 앱에서 발급된 로그인이 아닙니다` | `GOOGLE_CLIENT_ID` 와 `VITE_GOOGLE_CLIENT_ID` 가 같은지 확인 |
| Google 버튼이 안 보임 / origin 오류 | 3단계 승인된 JavaScript 원본에 현재 주소 추가 (반영까지 수 분) |
| 코드를 바꿨는데 반영 안 됨 | `npm run deploy` 로 재배포했는지 확인 (`push` 만으로는 배포 URL에 반영 안 됨) |
| 서버 로그 보기 | `npm run open` → 왼쪽 **실행** 메뉴 |

> 휴대폰에서 쓰려면 HTTPS 호스팅이 필요합니다 (Google 로그인은 `localhost` 외에는 HTTPS 주소만 허용). Gate 1 검증 후 무료 호스팅에 배포합니다.
