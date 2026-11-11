import { ArrowUpDown, Check, Pencil, Trash, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Cover } from '../components/Art';
import { SendActions, SyncStatus } from '../components/Send';
import { Empty, ErrorBox, RowsSkeleton } from '../components/States';
import { TrackList } from '../components/TrackList';
import { useAuth } from '../lib/auth';
import { fmtTotal, hueOf } from '../lib/format';
import { usePlaylist, usePlaylistMutations, useSync } from '../lib/queries';
import type { Track } from '../lib/types';
import { useUi } from '../lib/ui';

export function Playlist() {
  const { id = '' } = useParams();
  const q = usePlaylist(id);
  const m = usePlaylistMutations(id);
  const { user } = useAuth();
  const { toast, selectedPlaylistId, selectPlaylist } = useUi();
  const syncPending = useSync(id).pending;
  const nav = useNavigate();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Track[]>([]);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setEditing(false);
    setRenaming(false);
    setConfirmDelete(false);
  }, [id]);

  if (q.isLoading) return <div className="view"><RowsSkeleton /></div>;
  if (q.isError) return <div className="view"><ErrorBox error={q.error} onRetry={() => q.refetch()} /></div>;
  if (!q.data) return null;

  const { playlist, tracks } = q.data;
  const covers = tracks.slice(0, 4).map((t) => t.thumbnail).filter(Boolean);
  const isSelected = selectedPlaylistId === playlist.id;
  const fail = (e: unknown) => toast((e as Error).message, 'error');

  const startEdit = () => {
    setDraft(tracks);
    setEditing(true);
  };
  const saveEdit = async () => {
    const keep = new Set(draft.map((t) => t.videoId));
    const removed = tracks.filter((t) => !keep.has(t.videoId)).map((t) => t.videoId);
    const orderChanged = draft.some((t, i) => t.videoId !== tracks.filter((x) => keep.has(x.videoId))[i]?.videoId);
    try {
      if (removed.length) await m.removeTracks.mutateAsync(removed);
      if (orderChanged) await m.reorder.mutateAsync(draft.map((t) => t.videoId));
      setEditing(false);
      if (removed.length || orderChanged) toast('변경 사항을 저장했습니다');
    } catch (e) {
      fail(e);
    }
  };
  const move = (from: number, to: number) =>
    setDraft((d) => {
      const next = [...d];
      const [x] = next.splice(from, 1);
      next.splice(to, 0, x);
      return next;
    });

  return (
    <div className="view detail" style={{ '--tint': `${hueOf(playlist.id)} 30% 28%` } as React.CSSProperties}>
      <header className="pl-head">
        <Cover covers={covers} seed={playlist.id} className="pl-cover" />
        <div className="pl-meta">
          <span className="kind">플레이리스트</span>
          {renaming ? (
            <form
              className="rename"
              onSubmit={(e) => {
                e.preventDefault();
                m.rename.mutate(title, { onSuccess: () => setRenaming(false), onError: fail });
              }}
            >
              <input id="pl-rename" autoFocus maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="플레이리스트 이름" />
              <button className="icon-btn" aria-label="저장" disabled={!title.trim() || m.rename.isPending}><Check /></button>
              <button type="button" className="icon-btn" aria-label="취소" onClick={() => setRenaming(false)}><X /></button>
            </form>
          ) : (
            <h1>{playlist.title}</h1>
          )}
          <span className="facts">{user?.name || user?.email} · {playlist.count}곡{playlist.totalSec ? `, ${fmtTotal(playlist.totalSec)}` : ''}</span>
          <SyncStatus sync={playlist.sync} pending={syncPending} count={playlist.count} />
        </div>
      </header>

      <div className="pl-actions">
        {editing ? (
          <>
            <button className="btn btn-primary" onClick={saveEdit} disabled={m.removeTracks.isPending || m.reorder.isPending}><Check />저장</button>
            <button className="btn btn-ghost" onClick={() => setEditing(false)}>취소</button>
          </>
        ) : (
          <>
            <SendActions playlist={playlist} />
            <button className="icon-btn lg" aria-label="순서 편집·곡 빼기" title="순서 편집·곡 빼기" onClick={startEdit} disabled={!tracks.length}><ArrowUpDown /></button>
            <button className="icon-btn lg" aria-label="이름 바꾸기" title="이름 바꾸기" onClick={() => { setTitle(playlist.title); setRenaming(true); }}><Pencil /></button>
            <button className="icon-btn lg" aria-label="삭제" onClick={() => setConfirmDelete(true)}><Trash /></button>
          </>
        )}
      </div>

      {confirmDelete && (
        <div className="confirm" role="alertdialog" aria-label="삭제 확인">
          <p>
            ‘{playlist.title}’을 삭제할까요? 담긴 {playlist.count}곡의 목록이 사라집니다. 곡 자체와 좋아요는 그대로 남습니다.
            {playlist.sync?.ytPlaylistId && ' YouTube Music에 보낸 목록도 함께 삭제됩니다.'}
          </p>
          <div className="row">
            <button
              className="btn btn-danger btn-sm"
              disabled={m.remove.isPending}
              onClick={() =>
                m.remove.mutate(undefined, {
                  onSuccess: () => {
                    if (isSelected) selectPlaylist(null);
                    toast('플레이리스트를 삭제했습니다');
                    nav('/library');
                  },
                  onError: fail,
                })
              }
            >
              삭제
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>취소</button>
          </div>
        </div>
      )}

      <div className="pl-body">
        {tracks.length === 0 ? (
          <Empty title="아직 곡이 없습니다" action={<Link to="/search" className="btn btn-primary btn-sm">곡 검색하기</Link>}>
            탐색에서 곡 옆의 + 를 눌러 이 목록에 담으세요.
          </Empty>
        ) : editing ? (
          <TrackList tracks={draft} edit={{ onMove: move, onRemove: (vid) => setDraft((d) => d.filter((t) => t.videoId !== vid)) }} />
        ) : (
          <TrackList tracks={tracks} playlistId={playlist.id} />
        )}
      </div>
    </div>
  );
}
