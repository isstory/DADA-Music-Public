import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cover, LikedArt } from '../components/Art';
import { SyncStatus } from '../components/Send';
import { ErrorBox } from '../components/States';
import { fmtTotal } from '../lib/format';
import { useCreatePlaylist, useLiked, usePlaylists } from '../lib/queries';
import { useUi } from '../lib/ui';

export function Library() {
  const playlists = usePlaylists();
  const liked = useLiked();
  const create = useCreatePlaylist();
  const { toast } = useUi();
  const nav = useNavigate();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  return (
    <div className="view">
      <div className="page-head">
        <h1 className="page-title">내 보관함</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => setCreating((v) => !v)}><Plus />새 플레이리스트</button>
      </div>

      {creating && (
        <form
          className="new-pl"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(
              { title },
              { onSuccess: (pl) => nav(`/playlist/${pl.id}`), onError: (err) => toast((err as Error).message, 'error') },
            );
          }}
        >
          <input id="lib-new-title" autoFocus placeholder="플레이리스트 이름" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary btn-sm" disabled={!title.trim() || create.isPending}><Check />만들기</button>
        </form>
      )}

      {playlists.isError && <ErrorBox error={playlists.error} onRetry={() => playlists.refetch()} />}

      <div className="lib-rows">
        <Link to="/liked" className="lib-item">
          <LikedArt />
          <span className="ti-text"><b>좋아요한 곡</b><small>플레이리스트 · {liked.data?.length ?? '…'}곡</small></span>
        </Link>
        {playlists.data?.map((pl) => (
          <Link key={pl.id} to={`/playlist/${pl.id}`} className="lib-item">
            <Cover covers={pl.covers} seed={pl.id} />
            <span className="ti-text">
              <b>{pl.title}</b>
              <small>
                플레이리스트 · {pl.count}곡{pl.totalSec ? ` · ${fmtTotal(pl.totalSec)}` : ''}
                {pl.sync && pl.sync.state !== 'none' && <SyncStatus sync={pl.sync} />}
              </small>
            </span>
          </Link>
        ))}
      </div>
      {playlists.data?.length === 0 && <p className="muted pad">아직 만든 플레이리스트가 없습니다. 위의 ‘새 플레이리스트’로 시작하세요.</p>}
    </div>
  );
}
