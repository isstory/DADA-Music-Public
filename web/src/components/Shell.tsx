import { ChevronLeft, ChevronRight, ExternalLink, House, Library, Plus, Radio, Search, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { DEMO } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtTotal } from '../lib/format';
import { useCreatePlaylist, usePlaylist, usePlaylists, useQuota } from '../lib/queries';
import { useUi } from '../lib/ui';
import { Cover, LikedArt } from './Art';
import { SyncStatus, useSendAction } from './Send';
import { TrackSheet } from './TrackSheet';

export function Shell({ children }: { children: ReactNode }) {
  const { toasts } = useUi();
  return (
    <div className="app">
      <Sidebar />
      <main className="main panel" id="main">
        <TopBar />
        {children}
      </main>
      <RightPanel />
      <SendBar />
      <MobileDock />
      <TrackSheet />
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>
        ))}
      </div>
    </div>
  );
}

function Avatar() {
  const { user } = useAuth();
  return (
    <Link to="/settings" className="me" aria-label="설정">
      {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : (user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
    </Link>
  );
}

function TopBar() {
  const nav = useNavigate();
  return (
    <div className="topbar">
      <button className="circle desk-only" aria-label="뒤로" onClick={() => nav(-1)}><ChevronLeft /></button>
      <button className="circle desk-only" aria-label="앞으로" onClick={() => nav(1)}><ChevronRight /></button>
      <Link to="/search" className="top-search desk-only"><Search />곡, 아티스트 검색</Link>
      {DEMO && <span className="demo-flag" title="VITE_API_URL 이 없어 가짜 데이터로 동작 중">DEMO</span>}
      <Avatar />
    </div>
  );
}

function Sidebar() {
  const playlists = usePlaylists();
  const create = useCreatePlaylist();
  const { toast } = useUi();
  const nav = useNavigate();

  const newPlaylist = () =>
    create.mutate(
      { title: `내 플레이리스트 #${(playlists.data?.length ?? 0) + 1}` },
      { onSuccess: (pl) => nav(`/playlist/${pl.id}`), onError: (e) => toast((e as Error).message, 'error') },
    );

  return (
    <aside className="side">
      <nav className="panel side-nav" aria-label="주 메뉴">
        <Link to="/" className="logo"><i>D</i><span>DADA Music</span></Link>
        <NavLink to="/" end className="nav-item"><House /><span>홈</span></NavLink>
        <NavLink to="/search" className="nav-item"><Search /><span>탐색</span></NavLink>
        <NavLink to="/radio" className="nav-item"><Radio /><span>AI 라디오</span></NavLink>
      </nav>
      <div className="panel side-lib">
        <div className="side-lib-h">
          <NavLink to="/library" className="nav-item"><Library /><span>내 보관함</span></NavLink>
          <button className="icon-btn hide-collapsed" aria-label="새 플레이리스트" onClick={newPlaylist} disabled={create.isPending}><Plus /></button>
        </div>
        <div className="lib-list">
          <NavLink to="/liked" className="lib-item">
            <LikedArt />
            <span className="ti-text"><b>좋아요한 곡</b><small>플레이리스트</small></span>
          </NavLink>
          {playlists.data?.map((pl) => (
            <NavLink key={pl.id} to={`/playlist/${pl.id}`} className="lib-item">
              <Cover covers={pl.covers} seed={pl.id} />
              <span className="ti-text">
                <b>{pl.title}</b>
                <small>
                  {pl.sync && pl.sync.state !== 'none' && <i className={`dot ${pl.sync.state}`} aria-hidden="true" />}
                  플레이리스트 · {pl.count}곡
                </small>
              </span>
            </NavLink>
          ))}
        </div>
      </div>
    </aside>
  );
}

/** 보낼 목록 (마지막으로 보내거나 선택한 플레이리스트) */
function useSelected() {
  const { selectedPlaylistId } = useUi();
  const list = usePlaylists();
  const exists = list.data?.some((p) => p.id === selectedPlaylistId);
  const detail = usePlaylist(exists ? selectedPlaylistId : null);
  return exists ? detail.data : undefined;
}

function RightPanel() {
  const sel = useSelected();
  return (
    <aside className="panel right">
      <div className="right-head"><b>보낼 목록</b></div>
      {sel ? (
        <>
          <Cover covers={sel.tracks.slice(0, 4).map((t) => t.thumbnail).filter(Boolean)} seed={sel.playlist.id} className="right-cover" />
          <div>
            <h4>{sel.playlist.title}</h4>
            <p className="muted">{sel.playlist.count}곡 · {fmtTotal(sel.playlist.totalSec)}</p>
          </div>
          <div className="box">
            <b>YouTube Music 재생 순서</b>
            <div className="queue">
              {sel.tracks.slice(0, 6).map((t, i) => (
                <div key={t.videoId}><span className="num muted">{i + 1}</span><span className="ti-text"><b>{t.title}</b><small>{t.artist}</small></span></div>
              ))}
              {sel.tracks.length > 6 && <p className="muted small">외 {sel.tracks.length - 6}곡</p>}
            </div>
          </div>
        </>
      ) : (
        <div className="box">
          <b>아직 고른 목록이 없습니다</b>
          <p>플레이리스트 화면에서 <strong>YouTube Music으로 보내기</strong>를 누르면 여기에 표시됩니다.</p>
        </div>
      )}
      <div className="box">
        <b>재생은 YouTube Music에서</b>
        <p>DADA는 목록을 만들고 보냅니다. 재생, 다음 곡, 화면을 끈 재생은 YouTube Music 앱이 맡습니다. 목록을 다시 보내면 새 목록으로 바뀌니, 열려 있던 목록은 다시 열어 주세요.</p>
      </div>
    </aside>
  );
}

function SendBar() {
  const sel = useSelected();
  const quota = useQuota();
  const { send, pending } = useSendAction(sel?.playlist);
  const s = sel?.playlist.sync;
  return (
    <footer className="sendbar">
      <div className="now">
        {sel ? (
          <>
            <Cover covers={sel.tracks.slice(0, 4).map((t) => t.thumbnail).filter(Boolean)} seed={sel.playlist.id} />
            <Link to={`/playlist/${sel.playlist.id}`} className="ti-text"><b>{sel.playlist.title}</b><small>{sel.playlist.count}곡 · 보낼 목록</small></Link>
          </>
        ) : (
          <div className="ti-text"><b className="muted">보낼 목록 없음</b><small>플레이리스트에서 ‘YouTube Music으로 보내기’를 누르세요</small></div>
        )}
      </div>
      <div className="center">
        {sel && <SyncStatus sync={s} pending={pending} count={sel.playlist.count} />}
        <div className="row">
          <button className="btn btn-primary btn-sm" disabled={!sel || pending} onClick={send}>
            <Send />{pending ? '보내는 중…' : s?.state === 'ok' ? '다시 보내기' : 'YouTube Music으로 보내기'}
          </button>
          {s?.url && s.state !== 'none' && (
            <a className="btn btn-ghost btn-sm" href={s.url} target="_blank" rel="noopener"><ExternalLink />YouTube Music 열기</a>
          )}
        </div>
      </div>
      <div className="right-q">
        {quota && (
          <div className="quota">
            <span className="num">오늘 YouTube 사용량 {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}</span>
            <div className="bar"><i style={{ width: `${Math.min(100, (quota.used / quota.limit) * 100)}%` }} /></div>
          </div>
        )}
      </div>
    </footer>
  );
}

function MobileDock() {
  const sel = useSelected();
  const { send, pending } = useSendAction(sel?.playlist);
  const s = sel?.playlist.sync;
  const canOpen = !!s?.url && s.state === 'ok' && !pending;
  return (
    <div className="dock">
      {sel && (
        <div className="mini">
          <Cover covers={sel.tracks.slice(0, 4).map((t) => t.thumbnail).filter(Boolean)} seed={sel.playlist.id} />
          <Link to={`/playlist/${sel.playlist.id}`} className="ti-text">
            <b>{sel.playlist.title} · {sel.playlist.count}곡</b>
            <small><SyncStatus sync={s} pending={pending} count={sel.playlist.count} /></small>
          </Link>
          {canOpen ? (
            <a className="mini-open" href={s!.url} target="_blank" rel="noopener">열기<ExternalLink /></a>
          ) : (
            <button className="mini-send" onClick={send} disabled={pending} aria-label="YouTube Music으로 보내기"><Send /></button>
          )}
        </div>
      )}
      <nav className="tabs" aria-label="하단 메뉴">
        <NavLink to="/" end><House /><span>홈</span></NavLink>
        <NavLink to="/search"><Search /><span>탐색</span></NavLink>
        <NavLink to="/radio"><Radio /><span>AI 라디오</span></NavLink>
        <NavLink to="/library"><Library /><span>보관함</span></NavLink>
      </nav>
    </div>
  );
}
