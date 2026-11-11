import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { resetDemo } from '../lib/mock';
import { useQuota } from '../lib/queries';

export function Settings() {
  const { user, signOut } = useAuth();
  const quota = useQuota();
  return (
    <div className="view settings">
      <h1 className="page-title">설정</h1>

      <section className="set-card">
        <h2>계정</h2>
        <div className="row-between">
          <div className="ti-text"><b>{user?.name || '이름 없음'}</b><small>{user?.email}</small></div>
          {!DEMO && <button className="btn btn-ghost btn-sm" onClick={signOut}><LogOut />로그아웃</button>}
        </div>
      </section>

      <section className="set-card">
        <h2>데이터</h2>
        <dl className="kv">
          <dt>모드</dt>
          <dd>{DEMO ? '데모 — 가짜 데이터, 이 브라우저에만 저장' : '실제 — Google 시트 DB'}</dd>
          <dt>YouTube 사용량 (오늘)</dt>
          <dd className="num">{quota ? `${quota.used.toLocaleString()} / ${quota.limit.toLocaleString()} (태평양 시간 ${quota.day})` : '아직 호출 없음'}</dd>
          <dt>재생</dt>
          <dd>YouTube Music 앱에서 이루어집니다. 화면을 끈 재생은 YouTube Premium이 필요합니다.</dd>
        </dl>
        {DEMO && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              resetDemo();
              location.reload();
            }}
          >
            데모 데이터 초기화
          </button>
        )}
      </section>

      <p className="src">DADA Music 0.1 · Gate 1</p>
    </div>
  );
}

export function Login() {
  const { signIn, error, status } = useAuth();
  return (
    <div className="login">
      <div className="login-card">
        <div className="logo big"><i>D</i><span>DADA Music</span></div>
        <p className="lede">좋아하는 노래로 AI 라디오를 만들고, YouTube Music에서 듣습니다.</p>
        {status === 'loading' ? (
          <p className="muted">확인 중…</p>
        ) : (
          <button className="btn google-btn" onClick={signIn}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
            Google 계정으로 로그인
          </button>
        )}
        {error && <p className="state error" role="alert">{error}</p>}
        <p className="src">허용된 Google 계정만 사용할 수 있습니다.</p>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="view">
      <h1 className="page-title">페이지를 찾을 수 없습니다</h1>
      <Link to="/" className="btn btn-primary btn-sm">홈으로</Link>
    </div>
  );
}
