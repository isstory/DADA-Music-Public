#!/usr/bin/env node
/**
 * DADA Music — Gate 0 기술 PoC
 *
 * 사용법: node gate0.mjs <command> [--user <profile>]
 *   auth      OAuth 로그인(브라우저) → refresh token 저장
 *   resolve   테스트 5곡을 검색해 videoId 확정            (~505 units)
 *   create    전용 비공개 재생목록 생성 + 5곡 순차 삽입 + 검증 (~301 units)
 *   verify    YouTube 측 실제 목록·순서를 조회해 기대값과 비교 (1 unit)
 *   reorder   마지막 곡을 1번으로 이동 (position 업데이트 지원 검증) (~51 units)
 *   swap      새 목록(역순) 생성 → 검증 → 기존 목록 삭제     (~352 units)
 *   rating    YouTube 좋아요 상태 조회 (YTM 하트 연동 검증용) (1 unit)
 *   cleanup   이 PoC가 만든 재생목록 전부 삭제              (50 units/개)
 *   quota     오늘 이 PoC가 사용한 추정 units 출력
 *
 * --user 로 계정 프로필을 분리 (기본: a). 예) --user b
 * --for  로 다른 사람용 목록을 이 계정에 일부 공개로 생성. 예) --user a --for b
 *        (B는 OAuth 연결 없이 링크로 재생 — 체크리스트 A-8 PASS 시 권장 구조)
 */
import { google } from 'googleapis';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// 비밀값은 프로젝트 루트 .secrets/ 한 곳에만 둔다 (gitignore 처리됨, 절대 커밋 금지)
const SECRETS = path.join(ROOT, '..', '.secrets');
const DATA = path.join(ROOT, 'data');
const SCOPES = ['https://www.googleapis.com/auth/youtube'];
const PLAYLIST_PREFIX = 'DADA_MUSIC_POC';

// 기본 테스트 곡. poc/tracks.txt 가 있으면 그 파일(한 줄에 "아티스트 곡명")을 우선 사용.
const DEFAULT_QUERIES = [
  'IU Blueming',
  'NewJeans Hype Boy',
  'BTS Dynamite',
  'Queen Bohemian Rhapsody',
  'Coldplay Viva La Vida',
];

// 라이브/커버 등 감점 키워드 (음악 식별 품질 규칙 초안)
const PENALTY_WORDS = ['live', 'cover', 'reaction', 'karaoke', 'instrumental', '1 hour', 'lyrics', '가사', '라이브', '커버', '노래방'];

const QUOTA_COST = {
  'search.list': 100,
  'videos.list': 1,
  'videos.getRating': 1,
  'playlists.list': 1,
  'playlists.insert': 50,
  'playlists.delete': 50,
  'playlistItems.list': 1,
  'playlistItems.insert': 50,
  'playlistItems.update': 50,
  'playlistItems.delete': 50,
};

// ---------- 공통 유틸 ----------
const args = process.argv.slice(2);
const command = args[0];
const userIdx = args.indexOf('--user');
const profile = userIdx >= 0 ? args[userIdx + 1] : 'a';
if (!/^[a-z0-9_-]+$/i.test(profile ?? '')) die('--user 값은 영문/숫자만 가능합니다.');
// --for: 이 계정(profile)에 "누구를 위한" 목록을 만들지. 다른 사람용이면 일부 공개로 생성해 링크로 공유.
const forIdx = args.indexOf('--for');
const listener = forIdx >= 0 ? args[forIdx + 1] : profile;
if (!/^[a-z0-9_-]+$/i.test(listener ?? '')) die('--for 값은 영문/숫자만 가능합니다.');
const sharedMode = listener !== profile;

fs.mkdirSync(DATA, { recursive: true });
const p = {
  // Google 다운로드 원본 이름(client_secret_<id>.json) 그대로 사용 가능
  client:
    (fs.existsSync(SECRETS) &&
      fs.readdirSync(SECRETS).filter((f) => /^client_secret.*\.json$/.test(f)).map((f) => path.join(SECRETS, f))[0]) ||
    path.join(SECRETS, 'client_secret.json'),
  token: path.join(SECRETS, `token-${profile}.json`),
  tracks: path.join(DATA, `tracks-${profile}.json`),
  state: path.join(DATA, sharedMode ? `state-${profile}-for-${listener}.json` : `state-${profile}.json`),
  quota: path.join(DATA, 'quota-log.json'),
  log: path.join(DATA, `run-log-${profile}.md`),
};

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const writeJson = (f, v) => fs.writeFileSync(f, JSON.stringify(v, null, 2));
const ytmPlaylistUrl = (id) => `https://music.youtube.com/playlist?list=${id}`;
const ytPlaylistUrl = (id) => `https://www.youtube.com/playlist?list=${id}`;
const ytmWatchUrl = (videoId, listId) =>
  `https://music.youtube.com/watch?v=${videoId}${listId ? `&list=${listId}` : ''}`;

function logRun(line) {
  const stamp = new Date().toISOString();
  fs.appendFileSync(p.log, `- ${stamp} [${command}] ${line}\n`);
}

function chargeQuota(method, times = 1) {
  const log = readJson(p.quota, {});
  // YouTube 할당량은 태평양 시간 자정에 리셋됨
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
  log[day] ??= { total: 0, calls: {} };
  const cost = (QUOTA_COST[method] ?? 0) * times;
  log[day].total += cost;
  log[day].calls[method] = (log[day].calls[method] ?? 0) + times;
  writeJson(p.quota, log);
}

/** API 호출 래퍼: 할당량 기록 + 알려진 오류를 사람이 읽을 수 있게 변환 */
async function call(method, fn) {
  chargeQuota(method);
  try {
    return (await fn()).data;
  } catch (err) {
    const reason = err?.errors?.[0]?.reason ?? err?.response?.data?.error?.errors?.[0]?.reason;
    const hints = {
      quotaExceeded: '일일 할당량 초과. 태평양 시간 자정(한국 오후 4~5시)에 리셋됩니다.',
      youtubeSignupRequired: '이 Google 계정에 YouTube 채널이 없습니다. youtube.com 에서 채널을 먼저 만드세요.',
      insufficientPermissions: '권한 부족. `auth` 를 다시 실행해 YouTube 권한에 동의하세요.',
      videoNotFound: '영상을 찾을 수 없음(삭제/비공개). 해당 곡을 건너뛰어야 합니다.',
      playlistNotFound: '재생목록을 찾을 수 없음. 사용자가 YouTube에서 직접 삭제했을 수 있습니다.',
      manualSortRequired: '이 재생목록은 수동 정렬이 아니라 position 지정이 불가합니다.',
    };
    const msg = `${method} 실패${reason ? ` (${reason})` : ''}: ${hints[reason] ?? err.message}`;
    logRun(`ERROR ${msg}`);
    throw new Error(msg);
  }
}

// ---------- OAuth ----------
function loadClientConfig() {
  if (!fs.existsSync(p.client)) {
    die(`OAuth 클라이언트 파일이 없습니다: ${p.client}\n  docs/gate0/SETUP.md 의 3단계를 따라 "데스크톱 앱" 클라이언트 JSON을 저장하세요.`);
  }
  const raw = readJson(p.client);
  const c = raw.installed ?? raw.web;
  if (!c) die('client_secret.json 형식이 올바르지 않습니다 ("데스크톱 앱" 유형으로 만드세요).');
  return c;
}

function openBrowser(url) {
  const [cmd, cmdArgs] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    /* 아래 출력된 URL을 수동으로 열면 됨 */
  }
}

async function runAuthFlow() {
  const c = loadClientConfig();
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
  const oauth = new google.auth.OAuth2(c.client_id, c.client_secret, redirectUri);
  const authUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: SCOPES,
  });

  console.log(`\n[${profile}] 브라우저에서 Google 계정을 선택하고 권한을 허용하세요.`);
  console.log(`  자동으로 열리지 않으면 아래 주소를 여세요:\n  ${authUrl}\n`);
  openBrowser(authUrl);

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('5분 내 로그인이 완료되지 않았습니다.')), 5 * 60_000);
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== '/callback') return res.writeHead(404).end();
      const err = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        err
          ? `<h2>권한 거부: ${err}</h2><p>터미널로 돌아가세요.</p>`
          : '<h2>DADA Music PoC 인증 완료</h2><p>이 창을 닫고 터미널로 돌아가세요.</p>',
      );
      clearTimeout(timer);
      err ? reject(new Error(`권한 거부됨 (${err})`)) : resolve(code);
    });
  }).finally(() => server.close());

  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    console.warn('⚠ refresh_token 이 발급되지 않았습니다. Google 계정 > 보안 > 서드파티 앱 에서 접근을 해제 후 다시 실행하세요.');
  }
  fs.mkdirSync(SECRETS, { recursive: true });
  writeJson(p.token, { ...tokens, obtained_at: new Date().toISOString() });
  oauth.setCredentials(tokens);
  return oauth;
}

async function getYoutube({ interactive = false } = {}) {
  let auth;
  if (interactive || !fs.existsSync(p.token)) {
    if (!interactive) console.log(`[${profile}] 저장된 토큰이 없어 로그인을 시작합니다.`);
    auth = await runAuthFlow();
  } else {
    const c = loadClientConfig();
    auth = new google.auth.OAuth2(c.client_id, c.client_secret);
    const saved = readJson(p.token);
    auth.setCredentials(saved);
    auth.on('tokens', (t) => writeJson(p.token, { ...readJson(p.token), ...t }));
    try {
      await auth.getAccessToken();
    } catch (e) {
      // 테스트 모드 앱은 refresh token 이 7일 후 만료됨 → invalid_grant
      console.warn(`⚠ 토큰 갱신 실패(${e.message}). 테스트 모드의 7일 만료일 수 있습니다. 다시 로그인합니다.`);
      auth = await runAuthFlow();
    }
  }
  return google.youtube({ version: 'v3', auth });
}

// ---------- 도메인 로직 ----------
const decodeHtml = (s) =>
  s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function scoreCandidate(item, query) {
  const title = decodeHtml(item.snippet.title).toLowerCase();
  const channel = item.snippet.channelTitle;
  let score = 0;
  if (channel.endsWith(' - Topic')) score += 100; // YouTube Music 자동 생성 Art Track
  if (/vevo|official|공식/i.test(channel)) score += 40;
  if (/official (music )?video|m\/v|mv/i.test(title)) score += 20;
  // 감점은 Topic 가산점(+100)보다 커야 "Topic의 라이브 버전"이 원곡을 이기지 않음
  for (const w of PENALTY_WORDS) if (title.includes(w) && !query.toLowerCase().includes(w)) score -= 150;
  // 퍼포먼스/댄스 버전 등 변형은 약하게 감점 (원본 MV 우선)
  if (/performance ver|dance practice|ver\.\s*\d|special clip|teaser/i.test(title)) score -= 30;
  return score;
}

async function resolveTracks(yt) {
  const file = path.join(ROOT, 'tracks.txt');
  const queries = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
    : DEFAULT_QUERIES;

  const picked = [];
  for (const q of queries) {
    const res = await call('search.list', () =>
      yt.search.list({ part: ['snippet'], q, type: ['video'], videoCategoryId: '10', maxResults: 8, regionCode: 'KR' }),
    );
    const ranked = (res.items ?? [])
      .map((it) => ({ it, score: scoreCandidate(it, q) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked.length) {
      console.warn(`  ✖ 결과 없음: ${q}`);
      continue;
    }
    const best = ranked[0];
    picked.push({
      query: q,
      videoId: best.it.id.videoId,
      title: decodeHtml(best.it.snippet.title),
      channel: decodeHtml(best.it.snippet.channelTitle),
      kind: best.it.snippet.channelTitle.endsWith(' - Topic') ? 'art_track' : 'video',
      score: best.score,
    });
  }

  // 1 unit으로 최대 50개 일괄 검증: 존재/공개/임베드/재생시간
  const ids = picked.map((t) => t.videoId);
  const vids = await call('videos.list', () =>
    yt.videos.list({ part: ['status', 'contentDetails'], id: ids }),
  );
  const byId = new Map((vids.items ?? []).map((v) => [v.id, v]));
  for (const t of picked) {
    const v = byId.get(t.videoId);
    t.available = !!v && v.status.privacyStatus !== 'private';
    t.embeddable = v?.status.embeddable ?? false;
    t.duration = v?.contentDetails.duration ?? null;
    t.regionBlockedKR = v?.contentDetails.regionRestriction?.blocked?.includes('KR') ?? false;
  }
  writeJson(p.tracks, { resolvedAt: new Date().toISOString(), tracks: picked });

  console.log('\n확정된 트랙:');
  picked.forEach((t, i) =>
    console.log(
      `  ${i + 1}. [${t.kind === 'art_track' ? 'ART' : 'VID'}] ${t.title} — ${t.channel}  (${t.videoId})` +
        `${t.available ? '' : '  ⚠ 재생 불가'}${t.regionBlockedKR ? '  ⚠ KR 차단' : ''}`,
    ),
  );
  logRun(`resolved ${picked.length} tracks: ${ids.join(',')}`);
  return picked;
}

function loadTracks() {
  const data = readJson(p.tracks);
  if (!data) die('먼저 `resolve` 를 실행하세요.');
  return data.tracks.filter((t) => t.available && !t.regionBlockedKR);
}

async function createPlaylist(yt, label) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const res = await call('playlists.insert', () =>
    yt.playlists.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: `${PLAYLIST_PREFIX}_${listener.toUpperCase()}_${label}_${stamp}`,
          description: `DADA Music Gate 0 PoC — ${listener} 전용 자동 생성 재생목록`,
        },
        // 본인용은 비공개, 다른 사람용은 링크로 열 수 있게 일부 공개
        status: { privacyStatus: sharedMode ? 'unlisted' : 'private' },
      },
    }),
  );
  return res.id;
}

/** 순서 보장을 위해 반드시 순차 삽입 (병렬 삽입 시 순서 꼬임/409 발생) */
async function insertSequential(yt, playlistId, tracks) {
  const failed = [];
  for (const [i, t] of tracks.entries()) {
    try {
      await call('playlistItems.insert', () =>
        yt.playlistItems.insert({
          part: ['snippet'],
          requestBody: { snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId: t.videoId } } },
        }),
      );
      process.stdout.write(`  + ${i + 1}/${tracks.length} ${t.title}\n`);
    } catch (e) {
      console.warn(`  ✖ ${t.title}: ${e.message}`);
      failed.push(t.videoId);
    }
  }
  return failed;
}

async function listItems(yt, playlistId) {
  const items = [];
  let pageToken;
  do {
    const res = await call('playlistItems.list', () =>
      yt.playlistItems.list({ part: ['snippet', 'contentDetails'], playlistId, maxResults: 50, pageToken }),
    );
    items.push(...res.items);
    pageToken = res.nextPageToken;
  } while (pageToken);
  return items.sort((a, b) => a.snippet.position - b.snippet.position);
}

/**
 * 쓰기 직후 조회는 수 초간 이전 상태를 반환할 수 있음 (Gate 0 B-8에서 확인된 read-after-write 지연).
 * 불일치 시 2s → 4s → 8s 백오프로 재조회 후 최종 판정.
 */
async function verifyOrder(yt, playlistId, expectedIds, { retries = 3 } = {}) {
  let items, actual, ok;
  for (let attempt = 0; ; attempt++) {
    items = await listItems(yt, playlistId);
    actual = items.map((it) => it.contentDetails.videoId);
    ok = actual.length === expectedIds.length && actual.every((id, i) => id === expectedIds[i]);
    if (ok || attempt >= retries) break;
    const wait = 2000 * 2 ** attempt;
    console.log(`  … 아직 반영 전, ${wait / 1000}초 후 재조회 (${attempt + 1}/${retries})`);
    await new Promise((r) => setTimeout(r, wait));
  }
  console.log(`\n검증 (YouTube 실제 조회): ${ok ? 'PASS ✅ 순서·개수 일치' : 'FAIL ❌ 불일치'}`);
  if (!ok) {
    console.log('  기대:', expectedIds.join(', '));
    console.log('  실제:', actual.join(', '));
  }
  logRun(`verify ${playlistId}: ${ok ? 'PASS' : 'FAIL'} actual=${actual.join(',')}`);
  return { ok, items };
}

function printLinks(playlistId, firstVideoId) {
  console.log('\n휴대폰에서 열 링크 (Gate 0 체크리스트 B 단계):');
  console.log(`  YouTube Music 재생목록 : ${ytmPlaylistUrl(playlistId)}`);
  console.log(`  YTM 첫 곡+목록 컨텍스트 : ${ytmWatchUrl(firstVideoId, playlistId)}`);
  console.log(`  YouTube 재생목록        : ${ytPlaylistUrl(playlistId)}`);
  console.log(
    sharedMode
      ? `  → [일부 공개] 위 링크를 ${listener} 에게 보내세요. ${listener} 는 로그인 연결 없이 자기 YTM 앱에서 엽니다.\n`
      : '  → 위 링크를 본인에게 카톡/메모로 보내 휴대폰에서 탭하세요.\n',
  );
}

// ---------- 커맨드 ----------
const commands = {
  async auth() {
    const yt = await getYoutube({ interactive: true });
    const ch = await call('playlists.list', () => yt.playlists.list({ part: ['id'], mine: true, maxResults: 1 }));
    console.log(`✅ [${profile}] 인증 완료. 기존 재생목록 조회 가능 (총 ${ch.pageInfo?.totalResults ?? 0}개).`);
    logRun('auth ok');
  },

  async resolve() {
    await resolveTracks(await getYoutube());
  },

  async create() {
    const yt = await getYoutube();
    const tracks = loadTracks();
    const state = readJson(p.state, { playlists: [] });
    if (state.activePlaylistId) {
      console.log(`이미 활성 재생목록이 있습니다: ${state.activePlaylistId}\n(중복 생성 방지. 새로 만들려면 \`swap\` 또는 \`cleanup\`)`);
      return printLinks(state.activePlaylistId, tracks[0].videoId);
    }
    const id = await createPlaylist(yt, 'MAIN');
    console.log(`재생목록 생성: ${id}`);
    const failed = await insertSequential(yt, id, tracks);
    const expected = tracks.map((t) => t.videoId).filter((v) => !failed.includes(v));
    await verifyOrder(yt, id, expected);
    writeJson(p.state, {
      activePlaylistId: id,
      expectedOrder: expected,
      playlists: [...state.playlists, id],
      updatedAt: new Date().toISOString(),
    });
    printLinks(id, expected[0]);
  },

  async verify() {
    const yt = await getYoutube();
    const state = readJson(p.state);
    if (!state?.activePlaylistId) die('활성 재생목록이 없습니다. `create` 먼저.');
    const { items } = await verifyOrder(yt, state.activePlaylistId, state.expectedOrder);
    items.forEach((it) => console.log(`  ${it.snippet.position + 1}. ${it.snippet.title}`));
  },

  async reorder() {
    const yt = await getYoutube();
    const state = readJson(p.state);
    if (!state?.activePlaylistId) die('활성 재생목록이 없습니다.');
    const items = await listItems(yt, state.activePlaylistId);
    const last = items.at(-1);
    console.log(`"${last.snippet.title}" 을(를) 1번으로 이동`);
    await call('playlistItems.update', () =>
      yt.playlistItems.update({
        part: ['snippet'],
        requestBody: {
          id: last.id,
          snippet: { playlistId: state.activePlaylistId, resourceId: last.snippet.resourceId, position: 0 },
        },
      }),
    );
    const expected = [state.expectedOrder.at(-1), ...state.expectedOrder.slice(0, -1)];
    const { ok } = await verifyOrder(yt, state.activePlaylistId, expected);
    // 실제 YouTube 순서가 바뀐 경우에만 기대 순서를 갱신 (실패 시 상태 오염 방지)
    if (ok) writeJson(p.state, { ...state, expectedOrder: expected, updatedAt: new Date().toISOString() });
    else console.log('→ position 업데이트가 반영되지 않음. 재생목록 정렬 설정(수동/추가일순 등)을 확인하세요.');
    console.log('→ YouTube Music 앱에서 목록을 다시 열어 순서 반영 여부를 확인하세요 (체크리스트 B-8).');
  },

  /** 스왑 전략: 새 목록 완성·검증 후에만 포인터 교체 → 실패해도 기존 목록 유지 */
  async swap() {
    const yt = await getYoutube();
    const state = readJson(p.state);
    if (!state?.activePlaylistId) die('활성 재생목록이 없습니다.');
    const tracks = loadTracks().slice().reverse(); // 변화가 눈에 띄도록 역순
    const newId = await createPlaylist(yt, 'SWAP');
    console.log(`새 재생목록 생성: ${newId}`);
    const failed = await insertSequential(yt, newId, tracks);
    const expected = tracks.map((t) => t.videoId).filter((v) => !failed.includes(v));
    const { ok } = await verifyOrder(yt, newId, expected);
    if (!ok) {
      console.log(`검증 실패 → 기존 목록(${state.activePlaylistId}) 유지, 새 목록은 남겨둠(수동 확인용).`);
      writeJson(p.state, { ...state, playlists: [...state.playlists, newId] });
      return;
    }
    const oldId = state.activePlaylistId;
    writeJson(p.state, {
      activePlaylistId: newId,
      expectedOrder: expected,
      playlists: [...state.playlists, newId],
      updatedAt: new Date().toISOString(),
    });
    await call('playlists.delete', () => yt.playlists.delete({ id: oldId }));
    writeJson(p.state, { ...readJson(p.state), playlists: readJson(p.state).playlists.filter((x) => x !== oldId) });
    console.log(`기존 목록 삭제: ${oldId}`);
    printLinks(newId, expected[0]);
    console.log('→ 기존 목록을 재생 중이었다면 대기열이 어떻게 되는지 관찰하세요 (체크리스트 B-9).');
  },

  async rating() {
    const yt = await getYoutube();
    const tracks = loadTracks();
    const res = await call('videos.getRating', () => yt.videos.getRating({ id: tracks.map((t) => t.videoId) }));
    const title = new Map(tracks.map((t) => [t.videoId, t.title]));
    console.log('\nYouTube 좋아요 상태 (YTM 앱에서 하트 누른 뒤 다시 실행해 비교):');
    for (const r of res.items) console.log(`  ${r.rating.padEnd(8)} ${title.get(r.videoId)}`);
    logRun(`rating ${res.items.map((r) => `${r.videoId}=${r.rating}`).join(',')}`);
  },

  async cleanup() {
    const yt = await getYoutube();
    const state = readJson(p.state, { playlists: [] });
    for (const id of state.playlists) {
      try {
        await call('playlists.delete', () => yt.playlists.delete({ id }));
        console.log(`삭제: ${id}`);
      } catch (e) {
        console.warn(`  ${e.message}`);
      }
    }
    writeJson(p.state, { playlists: [] });
  },

  async quota() {
    const log = readJson(p.quota, {});
    const days = Object.keys(log).sort().slice(-7);
    if (!days.length) return console.log('기록 없음');
    for (const d of days) console.log(`${d} (PT): ${log[d].total} units  ${JSON.stringify(log[d].calls)}`);
    console.log('\n※ 이 PoC 호출만 집계한 추정치. 실제 값은 Google Cloud Console > API > 할당량에서 확인.');
  },
};

if (!commands[command]) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
  process.exit(command ? 1 : 0);
}
commands[command]().catch((e) => die(e.message));
