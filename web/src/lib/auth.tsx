/**
 * 로그인
 *  1) Google 로그인은 처음 한 번만 — 리디렉션 방식(OpenID Connect, response_type=id_token)
 *     팝업은 iOS Safari·홈 화면 앱에서 멈추므로 같은 창에서 Google → /auth 로 돌아온다.
 *  2) 돌아온 ID 토큰(1시간)을 서버에서 30일 세션으로 교환하고, 이후 API는 세션으로 호출한다.
 *     세션은 쓰는 동안 서버가 자동 연장 → 매시간 로그인이 풀리던 문제 해결.
 *  - state·nonce 로 위조 응답 차단, 서버에는 세션 해시만 저장
 * 데모 모드에서는 로그인 없이 데모 사용자로 들어간다.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { call, configureAuth, DEMO, endSession, exchangeIdToken } from './api';
import type { User } from './types';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
const SESSION_KEY = 'dada.session';
const HINT_KEY = 'dada.loginHint';
const PENDING_KEY = 'dada.authPending';
const REDIRECT_PATH = '/auth';

type Status = 'loading' | 'signedOut' | 'signedIn';
interface AuthCtx {
  status: Status;
  user: User | null;
  error: string | null;
  signIn: () => void;
  signOut: () => void;
}
const Ctx = createContext<AuthCtx | null>(null);

const store = {
  get(k: string, s: Storage = localStorage) {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string | null, s: Storage = localStorage) {
    try {
      if (v === null) s.removeItem(k);
      else s.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

function decodePayload(token: string): Record<string, any> {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function randomString() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

function startLogin() {
  const state = randomString();
  const nonce = randomString();
  const returnTo = location.pathname === REDIRECT_PATH ? '/' : location.pathname + location.search;
  store.set(PENDING_KEY, JSON.stringify({ state, nonce, returnTo }), sessionStorage);
  const p = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: location.origin + REDIRECT_PATH,
    response_type: 'id_token',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  const hint = store.get(HINT_KEY);
  if (hint) p.set('login_hint', hint);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString());
}

/** /auth#id_token=... 처리 */
function consumeRedirect(): { idToken?: string; error?: string } | null {
  if (location.pathname !== REDIRECT_PATH) return null;
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  let pending: { state: string; nonce: string; returnTo: string } | null = null;
  try {
    pending = JSON.parse(store.get(PENDING_KEY, sessionStorage) || 'null');
  } catch {
    pending = null;
  }
  store.set(PENDING_KEY, null, sessionStorage);
  history.replaceState(null, '', pending?.returnTo || '/');

  if (!pending || params.get('state') !== pending.state) return { error: '로그인 확인 정보가 맞지 않습니다. 다시 로그인하세요.' };
  const err = params.get('error');
  if (err) return { error: err === 'access_denied' ? '로그인을 취소했습니다.' : `Google 로그인 오류: ${err}` };
  const idToken = params.get('id_token');
  if (!idToken || decodePayload(idToken).nonce !== pending.nonce) return { error: '로그인 응답이 올바르지 않습니다. 다시 로그인하세요.' };
  return { idToken };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOutLocal = useCallback(() => {
    store.set(SESSION_KEY, null);
    setUser(null);
    setStatus('signedOut');
  }, []);

  const finishSignIn = useCallback(async () => {
    try {
      const { user } = await call<{ user: User }>('me');
      setUser(user);
      setError(null);
      setStatus('signedIn');
      store.set(HINT_KEY, user.email);
    } catch (e) {
      setError((e as Error).message);
      setStatus('signedOut');
    }
  }, []);

  useEffect(() => {
    if (DEMO) {
      void finishSignIn();
      return;
    }
    if (!CLIENT_ID) {
      setError('VITE_GOOGLE_CLIENT_ID 가 설정되지 않았습니다. web/.env.local 을 확인하세요.');
      setStatus('signedOut');
      return;
    }

    configureAuth(async () => store.get(SESSION_KEY), signOutLocal);

    const r = consumeRedirect();
    if (r?.idToken) {
      exchangeIdToken(r.idToken)
        .then(({ sessionToken }) => {
          store.set(SESSION_KEY, sessionToken);
          return finishSignIn();
        })
        .catch((e) => {
          setError((e as Error).message);
          setStatus('signedOut');
        });
      return;
    }
    if (r?.error) setError(r.error);

    if (store.get(SESSION_KEY)) void finishSignIn();
    else setStatus('signedOut');
  }, [finishSignIn, signOutLocal]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      error,
      signIn: () => {
        if (!DEMO) startLogin();
      },
      signOut: () => {
        endSession(store.get(SESSION_KEY) ?? '');
        store.set(HINT_KEY, null);
        signOutLocal();
      },
    }),
    [status, user, error, signOutLocal],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('AuthProvider 밖에서 useAuth 사용');
  return c;
}
