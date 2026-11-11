import { mockCall } from './mock';
import type { Quota } from './types';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

/** VITE_API_URL 이 없으면 데모 모드: 가짜 데이터로 화면만 동작 */
export const DEMO = !API_URL;

export class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// ---------- 세션 공급자 (AuthProvider 가 등록) — 30일 자체 세션 토큰 ----------
let tokenProvider: () => Promise<string | null> = async () => null;
let onUnauthenticated: () => void = () => {};
export function configureAuth(provider: typeof tokenProvider, onUnauth: () => void) {
  tokenProvider = provider;
  onUnauthenticated = onUnauth;
}

// ---------- 할당량 스토어 (useSyncExternalStore 용) ----------
let quota: Quota | null = null;
const listeners = new Set<() => void>();
export const quotaStore = {
  get: () => quota,
  set(q: Quota) {
    quota = q;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * GAS 웹앱 호출. GAS는 CORS preflight 를 처리하지 못하므로
 * 커스텀 헤더 없이 text/plain POST(단순 요청)로 보내고 토큰은 본문에 담는다.
 */
export async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (DEMO) return mockCall<T>(action, payload);

  const sessionToken = await tokenProvider();
  if (!sessionToken) {
    onUnauthenticated();
    throw new ApiError('unauthenticated', '로그인이 필요합니다.');
  }

  let res: Response;
  try {
    res = await fetch(API_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload, sessionToken }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('network', '네트워크에 연결할 수 없습니다. 연결을 확인하고 다시 시도하세요.');
  }
  if (!res.ok) throw new ApiError('network', `서버가 응답하지 않습니다 (${res.status}).`);

  const body = await res.json();
  if (body.quota) quotaStore.set(body.quota);
  if (!body.ok) {
    if (body.error?.code === 'unauthenticated') onUnauthenticated();
    throw new ApiError(body.error?.code ?? 'internal', body.error?.message ?? '알 수 없는 오류');
  }
  return body.data as T;
}

/** 로그인 직후 1회: Google ID 토큰 → 서버 세션(30일) 교환 */
export async function exchangeIdToken(idToken: string): Promise<{ sessionToken: string }> {
  const res = await fetch(API_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'auth.session', idToken }),
    redirect: 'follow',
  }).catch(() => {
    throw new ApiError('network', '네트워크에 연결할 수 없습니다.');
  });
  const body = await res.json();
  if (!body.ok) throw new ApiError(body.error?.code ?? 'internal', body.error?.message ?? '로그인에 실패했습니다.');
  return body.data;
}

/** 로그아웃: 서버 세션 삭제 (실패해도 무시) */
export function endSession(sessionToken: string) {
  if (DEMO || !sessionToken) return;
  fetch(API_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'auth.logout', sessionToken }),
  }).catch(() => {});
}
