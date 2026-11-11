# Gate 0 — Google Cloud 설정 가이드 (2인 사용 기준)

소요 시간: 약 15분. 계정 A(프로젝트 소유자)가 진행합니다.

## 1. Google Cloud 프로젝트 생성
1. https://console.cloud.google.com/ 접속 → 상단 프로젝트 선택 → **새 프로젝트**
2. 이름: `dada-music` → 만들기

## 2. YouTube Data API v3 사용 설정
1. **API 및 서비스 → 라이브러리** → `YouTube Data API v3` 검색 → **사용**
2. **API 및 서비스 → 할당량**에서 `Queries per day` 값 확인 (보통 10,000) → 체크리스트 A-0에 기록  

## 3. OAuth 동의 화면 + 클라이언트
1. **Google 인증 플랫폼(OAuth 동의 화면)** → 시작하기
   - 앱 이름: `DADA Music (dev)`, 사용자 지원 이메일: 본인
   - 대상: **외부(External)**
2. **대상(Audience) → 테스트 사용자**에 **두 사람의 Google 계정 이메일** 추가
   - 게시 상태는 **테스트** 그대로 둡니다 (2인 사용이라 앱 검증 불필요)
3. **데이터 액세스 → 범위 추가**: `https://www.googleapis.com/auth/youtube`
4. **클라이언트 → 클라이언트 만들기**
   - 애플리케이션 유형: **데스크톱 앱**, 이름: `gate0-poc`
   - 생성 후 **JSON 다운로드**
5. 다운로드한 파일을 **프로젝트 루트** `.secrets/` 폴더에 저장 (파일명은 원본 `client_secret_….json` 그대로 OK):
   ```
   .secrets/client_secret_<클라이언트ID>.json
   ```
   `.secrets/` 는 `.gitignore` 처리되어 있으며 **절대 커밋 금지**. 토큰(`token-*.json`)도 같은 폴더에 저장됩니다.

> ⚠ **테스트 모드 제약**: refresh token이 **7일 후 만료**됩니다. 만료되면 스크립트가 자동으로 재로그인을 띄웁니다. 정식 앱(Gate 1 이후)에서도 2인 사용이면 이 방식을 유지하고 "주 1회 재연결" UX로 처리합니다.

## 4. 사전 확인 (각 계정)
- [ ] YouTube 채널이 있는가? (없으면 youtube.com → 프로필 → 채널 만들기. 없으면 재생목록 생성 실패)
- [ ] YouTube Premium 또는 YouTube Music Premium 구독 여부 (화면 OFF 재생 조건)
- [ ] 휴대폰에 YouTube Music 앱 설치 + 같은 계정 로그인

## 5. 실행
```powershell
cd poc
npm install            # 최초 1회
node gate0.mjs auth                 # 계정 A 로그인
node gate0.mjs resolve              # 테스트 5곡 확정 (~505 units)
node gate0.mjs create               # A 전용 재생목록 생성 + 검증 (~301 units)
node gate0.mjs create --for b       # B용 목록을 A 계정에 "일부 공개"로 생성 → 링크를 B에게 전달
```
> **권장 구조 (체크리스트 A-8 PASS 시):** 계정 A만 OAuth 연결. B는 로그인 연결 없이 링크로 재생.
> B 계정도 직접 연결하려면 `node gate0.mjs auth --user b` 후 `--user b` 로 실행. 이 경우 B도 테스트 사용자로 등록해야 함.
이후 단계는 [CHECKLIST.md](CHECKLIST.md) 를 따릅니다.

테스트 곡을 바꾸려면 `poc/tracks.txt` 에 한 줄에 하나씩 `아티스트 곡명` 을 적으세요.
