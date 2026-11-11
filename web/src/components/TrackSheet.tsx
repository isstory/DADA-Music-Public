import { Check, CircleMinus, ExternalLink, Heart, ListPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAddTracks, useCreatePlaylist, usePlaylists, useReact } from '../lib/queries';
import { ytmWatch } from '../lib/format';
import { useUi } from '../lib/ui';
import { Art, Cover } from './Art';

/** 곡 액션 시트: 플레이리스트에 추가, 반응, YouTube Music에서 열기 (모바일은 아래에서, PC는 가운데) */
export function TrackSheet() {
  const { sheetTrack, closeTrack, toast } = useUi();
  const playlists = usePlaylists();
  const add = useAddTracks();
  const create = useCreatePlaylist();
  const react = useReact();
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sheetTrack) return;
    setCreating(false);
    setNewTitle('');
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTrack();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetTrack, closeTrack]);

  if (!sheetTrack) return null;
  const { track } = sheetTrack;
  const busy = add.isPending || create.isPending;

  const addTo = (id: string, title: string) =>
    add.mutate(
      { id, videoIds: [track.videoId] },
      {
        onSuccess: (r) => {
          toast(r.duplicates ? `이미 ‘${title}’에 있는 곡입니다` : `‘${title}’에 추가했습니다`);
          closeTrack();
        },
        onError: (e) => toast((e as Error).message, 'error'),
      },
    );

  const createWith = () =>
    create.mutate(
      { title: newTitle, videoIds: [track.videoId] },
      {
        onSuccess: (pl) => {
          toast(`‘${pl.title}’을 만들고 곡을 추가했습니다`);
          closeTrack();
        },
        onError: (e) => toast((e as Error).message, 'error'),
      },
    );

  const setReaction = (r: 'like' | 'dislike') => {
    const next = track.reaction === r ? null : r;
    react.mutate({ track, reaction: next });
    closeTrack();
  };

  return (
    <div className="scrim" onClick={closeTrack}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`${track.title} 메뉴`} tabIndex={-1} ref={dialog} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <Art src={track.thumbnail} seed={track.videoId} />
          <div className="ti-text">
            <b>{track.title}</b>
            <small>{track.artist}</small>
          </div>
          <button className="icon-btn" aria-label="닫기" onClick={closeTrack}><X /></button>
        </div>

        <div className="sheet-actions">
          <a className="sheet-item" href={ytmWatch(track.videoId)} target="_blank" rel="noopener" onClick={closeTrack}>
            <ExternalLink />YouTube Music에서 열기
          </a>
          <button className="sheet-item" onClick={() => setReaction('like')}>
            <Heart fill={track.reaction === 'like' ? 'currentColor' : 'none'} />
            {track.reaction === 'like' ? '좋아요 취소' : '좋아요'}
          </button>
          <button className="sheet-item" onClick={() => setReaction('dislike')}>
            <CircleMinus />
            {track.reaction === 'dislike' ? '관심 없음 취소' : '관심 없음 (추천에서 제외)'}
          </button>
        </div>

        <p className="sheet-label">플레이리스트에 추가</p>
        <div className="sheet-list">
          {creating ? (
            <form
              className="new-pl"
              onSubmit={(e) => {
                e.preventDefault();
                createWith();
              }}
            >
              <input id="new-pl-title" autoFocus placeholder="새 플레이리스트 이름" maxLength={80} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={!newTitle.trim() || busy}>
                <Check />만들기
              </button>
            </form>
          ) : (
            <button className="sheet-item" onClick={() => setCreating(true)}>
              <ListPlus />새 플레이리스트
            </button>
          )}
          {playlists.isLoading && <p className="muted pad">불러오는 중…</p>}
          {playlists.data?.map((pl) => (
            <button key={pl.id} className="pl-pick" disabled={busy} onClick={() => addTo(pl.id, pl.title)}>
              <Cover covers={pl.covers} seed={pl.id} />
              <span className="ti-text">
                <b>{pl.title}</b>
                <small>{pl.count}곡</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
