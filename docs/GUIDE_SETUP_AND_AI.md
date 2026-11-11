# DADA Music 설치 · AI 활용 가이드

이 가이드는 이 프로젝트를 받은 분이 **본인 PC와 본인 Google 계정**으로 DADA Music을 띄우고, AI 코딩 도구(Claude Code)로 원하는 대로 고쳐 쓰는 방법을 처음부터 설명합니다. 프로그래밍을 잘 몰라도 순서대로 따라 하면 됩니다.

- 무엇을 만드는 앱인지는 [PROJECT_BRIEF.md](PROJECT_BRIEF.md)(기획서)를 먼저 읽어 보세요.
- 원래 주인이 AI에게 어떻게 요청해서 만들었는지는 [PROMPTS.md](PROMPTS.md)(프롬프트 모음)에 있습니다.
- 이 프로젝트에는 **원래 주인의 키나 계정 정보가 들어 있지 않습니다.** 실제로 쓰려면 아래 3장에서 본인 계정으로 키를 만들어야 합니다.

| 단계 | 내용 | 시간 | 필요한 것 |
|---|---|---|---|
| 1 | PC 준비 | 15분 | Node.js, Git, VS Code |
| 2 | **데모 모드로 실행** (설정 없이 화면 확인) | 5분 | — |
| 3 | 본인 계정으로 실제 연동 | 40분 | Google 계정, YouTube 채널 |
| 4 | 휴대폰에서 쓰기 | 15분 | Firebase (무료) |
| 5 | **AI로 고쳐 쓰기** | 원하는 만큼 | Claude Code |

> 3·4단계의 클릭 작업이 부담스러우면, 1~2단계 후 바로 5장으로 가서 **"가이드 3장을 같이 진행하자"**라고 AI에게 부탁해도 됩니다. 브라우저 로그인과 클릭은 직접 해야 하지만, 나머지는 AI가 안내하고 대신 실행해 줍니다.

---

## 1. PC 준비

| 프로그램 | 받는 곳 | 확인 방법 (터미널) |
|---|---|---|
| **Node.js 20 이상** (LTS) | https://nodejs.org | `node -v` → `v20` 이상 |
| **Git** | https://git-scm.com | `git --version` |
| **VS Code** | https://code.visualstudio.com | — |

설치 후 **VS Code를 다시 시작**하세요. Windows에서는 VS Code 메뉴 **터미널 → 새 터미널**을 쓰면 됩니다.

### 프로젝트 받기 (GitHub)
1. 받을 위치에서 터미널을 열고 실행합니다. 경로에 한글이나 공백이 없는 곳을 권장합니다.
   ```
   cd C:\Workspace
   git clone https://github.com/isstory/DADA-Music-Public.git
   ```
   - 처음 Git을 쓰면 이름과 이메일을 물을 수 있습니다. 이때는 `git config --global user.name "내이름"`과 `git config --global user.email "내메일"`을 먼저 실행하세요.
2. VS Code → **파일 → 폴더 열기** → `DADA-Music-Public` 폴더를 선택합니다.
3. Git 이력이 함께 받아지므로, AI가 고친 내용이 마음에 들지 않으면 언제든 되돌릴 수 있습니다.
   - 내 GitHub에 따로 보관하고 싶으면 GitHub에서 **Fork**하거나, 새 저장소를 만들어 `git remote set-url origin <내 저장소 주소>`로 바꾸면 됩니다.
   - 압축 파일로 받았다면 원하는 곳에 풀고 `git init` → `git add -A` → `git commit -m "처음 받은 상태"`를 한 번 실행해 두세요.

---

## 2. 데모 모드로 실행 (설정 없이 5분)

```
cd web
npm install
npm run dev
```

브라우저에서 **http://localhost:5173** 을 엽니다.
- 오른쪽 위에 **DEMO** 표시가 있으면 데모 모드입니다. 로그인 없이 가짜 데이터로 화면과 동작을 모두 볼 수 있습니다.
- AI 라디오도 눌러 볼 수 있지만, 데모에서는 AI 대신 무작위로 곡을 고르고 YouTube에도 실제로 보내지 않습니다.
- 끄려면 터미널에서 `Ctrl + C`를 누릅니다.

**화면을 고치고 싶을 뿐이라면 여기까지로 충분합니다.** 바로 5장으로 가세요.

---

## 3. 본인 계정으로 실제 연동

### 3.0 미리 정할 것: "계정 A"
YouTube 재생목록이 만들어지고 서버가 실행될 Google 계정 하나를 정합니다. 이 가이드에서는 **계정 A**라고 부릅니다.
- 계정 A에 **YouTube 채널**이 있어야 합니다. 없으면 youtube.com → 프로필 → **채널 만들기**
- 화면을 끈 재생은 휴대폰 YouTube Music 앱에 **YouTube Premium** 계정이 로그인되어 있어야 합니다.
- 아래 작업은 모두 **계정 A로 로그인한 브라우저**에서 하세요. 다른 계정이 섞이면 "권한 없음"이 납니다.

### 3.1 Google Cloud: 로그인용 OAuth 클라이언트
1. https://console.cloud.google.com → 위쪽 **프로젝트 선택 → 새 프로젝트** → 이름 `dada-music` → 만들기
2. 왼쪽 메뉴 **API 및 서비스 → OAuth 동의 화면**(또는 **Google 인증 플랫폼**) → **시작하기**
   - 앱 이름: `DADA Music`, 지원 이메일: 본인
   - 대상: **외부(External)**
   - **대상 → 테스트 사용자**에 **로그인할 모든 Gmail**을 추가합니다(계정 A, 같이 쓸 사람).
3. **사용자 인증 정보 → + 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - **승인된 JavaScript 원본**: `http://localhost:5173`
   - **승인된 리디렉션 URI**: `http://localhost:5173/auth` ← 끝에 `/auth`가 꼭 있어야 합니다
   - **만들기** → 나오는 **클라이언트 ID**(`…apps.googleusercontent.com`)를 메모합니다. 보안 비밀번호는 필요 없습니다.

### 3.2 Gemini API 키
1. https://aistudio.google.com/apikey (계정 A) → **API 키 만들기**
2. 키를 메모합니다. **채팅이나 문서에 붙여넣지 마세요.** 다음 단계에서 파일에 바로 넣습니다.

### 3.3 서버(Google Apps Script) 올리기
1. https://script.google.com/home/usersettings → **Google Apps Script API: 사용**
2. 터미널에서 실행합니다.
   ```
   cd gas
   npm install
   npm run login      # 브라우저가 열리면 계정 A 선택 → 허용
   npm run create     # 새 Apps Script 프로젝트 생성 (gas/.clasp.json 생김)
   ```
   - 다른 PC에서 받은 `gas/.clasp.json`이 있다면 지우고 실행하세요.
3. **설정 파일 만들기:** `gas/Local.example.js`를 복사해 `gas/src/Local.js`로 저장하고 값을 채웁니다.
   - `GOOGLE_CLIENT_ID`: 3.1에서 메모한 클라이언트 ID
   - `USERS`: `{ '계정A@gmail.com': 'a' }`. 같이 쓸 사람은 `'친구@gmail.com': 'b'`처럼 한 줄씩 추가
   - `GEMINI_API_KEY`: 3.2의 키
   - `SELFTEST_KEY`: 아무도 모르는 무작위 문자열 24자 이상
   - 이 파일은 깃에서 자동 제외되어 커밋되지 않습니다.
4. 코드를 올리고 권한을 승인합니다.
   ```
   npm run push
   npm run open       # Apps Script 편집기가 열림
   ```
   편집기 위쪽 함수 목록에서 **`setup`** 선택 → **▶ 실행**
   - 권한 요청 → 계정 A → "Google에서 확인하지 않은 앱" → **고급 → 이동** → **허용**
   - 실행 로그에 `DB 준비 완료: https://docs.google.com/...`가 나오면 성공입니다. 계정 A의 드라이브에 `DADA Music DB` 시트가 생깁니다.
   - 같은 방법으로 **`checkYoutube`**를 실행해 `YouTube 연결 OK`가 나오는지 확인합니다.
5. 웹앱으로 배포합니다.
   ```
   npm run deploy
   ```
   마지막에 나오는 `https://script.google.com/macros/s/…/exec` 주소를 메모합니다. 이것이 서버 주소입니다.
   - 이후 서버 코드를 고치면 `npm run deploy` 한 번이면 **같은 주소**로 다시 배포됩니다.
6. 확인: 브라우저에서 아래 주소를 열어 `"config":"OK"`가 보이면 성공입니다.
   ```
   <서버 주소>?selftest=<SELFTEST_KEY>&suite=status
   ```

### 3.4 화면 연결
1. `web/.env.example`을 복사해 `web/.env.local`로 저장하고 채웁니다.
   ```
   VITE_API_URL=<3.3의 서버 주소>
   VITE_GOOGLE_CLIENT_ID=<3.1의 클라이언트 ID>
   ```
2. 실행합니다.
   ```
   cd web
   npm run dev
   ```
3. http://localhost:5173 → **Google 계정으로 로그인** → 계정 A → 홈 화면이 나오면 성공입니다.
4. **AI 라디오** 탭 → 좋아하는 노래 3곡 이상 추가 → **AI 라디오 만들고 듣기** → 1~2분 뒤 **YouTube Music에서 듣기**

### 3.5 (선택) 서버 전체 점검
아래 주소를 브라우저에서 열면 서버가 스스로 기능을 시험하고 결과를 보여 줍니다. 시험용 데이터는 끝나면 지워집니다.

| 주소 끝에 붙일 것 | 내용 | YouTube 사용량 |
|---|---|---|
| `?selftest=<키>` | 검색·좋아요·플레이리스트·데이터 분리 (9개) | 약 200 |
| `?selftest=<키>&suite=sync` | YouTube Music 보내기 (7개) | 약 650 |
| `?selftest=<키>&suite=radio` | AI 라디오 (5개) | 약 2,000 |

---

## 4. 휴대폰에서 쓰기 (Firebase Hosting)

Google 로그인은 PC의 `localhost` 외에는 **HTTPS 주소**에서만 동작하므로, 화면을 무료 HTTPS 호스팅에 올립니다.

1. https://console.firebase.google.com (계정 A) → 약관 동의 → **프로젝트 만들기** → 이름 예 `dada-music-app` (애널리틱스는 꺼도 됨)
   - 만들어진 **프로젝트 ID**(예: `dada-music-app-1a2b3`)를 메모합니다.
2. 터미널에서 실행합니다.
   ```
   cd web
   npx firebase login             # 계정 A
   npx firebase use --add         # 1의 프로젝트 선택, 별칭은 default
   npx vite build
   npx firebase deploy --only hosting
   ```
   - `web/.firebaserc`에는 자리 표시(또는 다른 사람의 프로젝트 ID)가 들어 있습니다. `firebase use --add`가 본인 것으로 바꿔 줍니다.
   - 마지막에 `Hosting URL: https://<프로젝트ID>.web.app`이 나옵니다.
3. 3.1의 **웹 클라이언트**에 주소를 추가하고 **저장**합니다(반영까지 최대 5분).
   - 승인된 JavaScript 원본: `https://<프로젝트ID>.web.app`
   - 승인된 리디렉션 URI: `https://<프로젝트ID>.web.app/auth`
4. 휴대폰에서 그 주소를 **Safari(아이폰) / Chrome(안드로이드)**로 열고 로그인합니다.
   - 카카오톡 등 앱 안의 브라우저에서는 Google이 로그인을 막습니다.
5. 홈 화면에 추가합니다.
   - 아이폰: 공유 버튼(□↑) → **홈 화면에 추가**
   - 안드로이드: ⋮ → **앱 설치**
   - 로그인은 30일간 유지됩니다.

화면 코드를 고친 뒤에는 `npx vite build && npx firebase deploy --only hosting`으로 다시 올립니다. 휴대폰 앱은 다음에 열 때 자동으로 새 버전이 됩니다.

---

## 5. AI로 고쳐 쓰기 (Claude Code)

이 프로젝트는 AI 코딩 도구와 함께 만들었고, 같은 방식으로 고쳐 쓰기 좋게 정리되어 있습니다. 루트의 **`CLAUDE.md`**에 구조·명령어·지켜야 할 규칙이 적혀 있어서, AI가 작업을 시작할 때 자동으로 읽습니다.

### 5.1 설치
1. VS Code 왼쪽 **확장(Extensions)** → **"Claude Code"** 검색 → 설치합니다. 터미널용 CLI도 있습니다.
2. 처음 실행할 때 Anthropic 계정으로 로그인합니다. Claude 유료 구독(Pro/Max) 또는 API 사용 설정이 필요합니다.
   - 설치·요금은 바뀔 수 있으니 Claude Code 공식 안내를 확인하세요.
3. **이 프로젝트 폴더를 연 상태**에서 Claude Code를 시작합니다.

### 5.2 이렇게 말해 보세요
| 하고 싶은 것 | 예시 요청 |
|---|---|
| 처음 파악 | `이 프로젝트 구조랑 동작 방식을 쉽게 설명해줘` |
| 설치 도움 | `docs/GUIDE_SETUP_AND_AI.md 3장을 나랑 같이 진행하자. 내가 클릭해야 하는 건 하나씩 알려줘` |
| 데모 실행 | `데모 모드로 실행해서 화면이 잘 나오는지 확인해줘` |
| 디자인 | `포인트 색을 샴페인 대신 민트 계열로 바꾸고, 바뀐 화면을 보여줘` |
| 기능 추가 | `AI 라디오에 '장르' 선택(발라드, 힙합, 록…)을 추가해줘. 서버 입력 허용 목록도 같이 고쳐줘` |
| 작은 수정 | `라디오 곡 수에 40곡 옵션을 추가해줘` |
| 사용자 추가 | `친구 계정을 사용자로 추가하려면 뭘 해야 하는지 알려주고 서버 설정을 고쳐줘` |
| 점검 | `서버 자가 진단을 돌리고 결과를 정리해줘` |
| 오류 해결 | `휴대폰에서 로그인하면 '액세스 차단됨'이 떠. 원인을 찾아줘` + 화면 캡처 첨부 |

### 5.3 잘 쓰는 요령
- **큰 변경은 먼저 계획을 받으세요.** `바로 고치지 말고 어떻게 바꿀지 먼저 설명해줘`라고 하면 방향을 확인하고 진행할 수 있습니다.
- **고친 뒤에는 화면으로 확인하세요.** 데모 모드(`npm run dev`)에서 직접 눌러 보는 것이 가장 확실합니다.
- **자주 저장하세요.** 잘 동작할 때마다 `지금 상태 커밋해줘`라고 하면 나중에 되돌릴 수 있습니다.
- **키는 채팅에 붙여넣지 마세요.** `gas/src/Local.js`나 `web/.env.local`에 직접 넣고 "넣었어"라고만 말하면 됩니다.
- **브라우저 로그인은 직접 해야 합니다.** `npm run login`, `npx firebase login`, Google·Firebase 콘솔의 클릭 작업은 AI가 대신할 수 없습니다. AI가 어디를 누르면 되는지 안내합니다.
- **서버 코드를 고친 뒤에는 `npm run deploy`(gas 폴더)를 해야 반영됩니다.** 화면 코드는 개발 서버에 바로 반영되고, 휴대폰용은 Firebase에 다시 올려야 합니다.
- **YouTube 사용량에 주의하세요.** 하루 10,000이고, 검색 1회가 100, 라디오 1회가 약 3,200입니다. AI에게 "검색을 반복 실행하는 테스트"를 시키면 금방 소진됩니다.

---

## 6. 문제 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 화면에 `VITE_GOOGLE_CLIENT_ID 가 설정되지 않았습니다` | `web/.env.local` 없음 또는 비어 있음 | 3.4 확인 후 `npm run dev` 다시 시작 |
| Google 로그인에서 **액세스 차단됨** / `redirect_uri_mismatch` | 리디렉션 URI 미등록 | 웹 클라이언트의 **승인된 리디렉션 URI**에 `…/auth` 추가·저장, 5분 대기 |
| Google 콘솔에서 "추가 액세스 권한 필요" | 다른 Google 계정으로 로그인됨 | 오른쪽 위 프로필에서 계정 A로 전환 |
| 로그인 후 `○○ 계정은 사용 권한이 없습니다` | `USERS`에 그 이메일 없음 | `gas/src/Local.js` 수정 → `npm run deploy` |
| 로그인 후 `이 앱에서 발급된 로그인이 아닙니다` | 클라이언트 ID 불일치 | `Local.js`와 `.env.local`의 클라이언트 ID를 같게 |
| 로그인이 안 되고 "확인되지 않은 앱"에서 막힘 | 테스트 사용자 미등록 | OAuth 동의 화면 → 테스트 사용자에 이메일 추가 |
| 카카오톡에서 열면 로그인 안 됨 | 앱 내부 브라우저 차단 | Safari/Chrome으로 열기 |
| `서버 설정 누락: …` | `Local.js` 값 누락 | 해당 값 채우고 `npm run deploy` |
| 서버 코드를 고쳤는데 그대로 | 배포 안 함 | `cd gas && npm run deploy` (`push`만으로는 반영 안 됨) |
| `오늘 YouTube 사용량을 모두 썼습니다` | 하루 할당량 소진 | 한국 시간 오후 4~5시 초기화. 또는 Google에 증설 신청 |
| YouTube Music에서 "문제가 발생했습니다" | 휴대폰 YouTube Music 앱 계정 문제 또는 오래된 링크 | DADA 앱을 닫았다 열고 다시 **듣기**. 앱 계정 확인 |
| 화면을 끄면 음악이 멈춤 | YouTube Premium 아님 | 휴대폰 YouTube Music에 Premium 계정 로그인 |
| `npm run create`에서 Apps Script API 오류 | API 미사용 | 3.3-1 설정 켜기 |
| `npx firebase login`이 브라우저를 안 엶 | 터미널 환경 문제 | 화면에 나온 주소를 직접 열고 코드를 붙여넣기 |

---

## 7. 보안 수칙
- **비밀 파일:** `gas/src/Local.js`, `web/.env.local`, `.secrets/`, `gas/.clasp.json`, `gas/.deployment.json`은 깃에서 자동 제외됩니다. 다른 사람에게 압축해 줄 때도 빼 주세요.
  - 이 프로젝트를 다시 공유할 때는 `git archive -o 공유.zip HEAD`를 쓰면 커밋된 파일만 담겨 안전합니다.
- **키가 노출됐다면:** 그 키를 즉시 폐기하고 새로 발급하세요. Gemini 키는 AI Studio, OAuth는 Google Cloud 사용자 인증 정보에서 할 수 있습니다.
- **로그인 허용 범위:** `USERS`에 넣은 계정만 로그인됩니다. 모르는 계정은 넣지 마세요.
- **GitHub에 올린다면** 비공개 저장소를 권장합니다.
- 자세한 보안 구조는 [SECURITY.md](SECURITY.md)를 참고하세요.

### 참고: 기존 문서
`docs/gate0~3`은 처음 만들 때의 검증 기록입니다. 특히 `docs/gate1/SETUP.md`는 이전 방식(스크립트 속성 입력 등)이라 **설치는 이 가이드를 따르세요.**
