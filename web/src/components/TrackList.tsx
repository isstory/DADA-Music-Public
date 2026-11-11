import { ArrowDown, ArrowUp, CircleMinus, Ellipsis, Heart, Plus, X } from 'lucide-react';
import { fmtDuration, ytmWatch } from '../lib/format';
import { useReact } from '../lib/queries';
import type { Track } from '../lib/types';
import { useUi } from '../lib/ui';
import { Art } from './Art';

interface Props {
  tracks: Track[];
  playlistId?: string;
  /** 편집 모드: 순서 이동·삭제 */
  edit?: { onMove: (from: number, to: number) => void; onRemove: (videoId: string) => void };
  showHeader?: boolean;
}

/** PC는 표, 모바일은 행 목록으로 같은 마크업이 CSS에서 바뀐다 */
export function TrackList({ tracks, playlistId, edit, showHeader = true }: Props) {
  const react = useReact();
  const { openTrack } = useUi();

  return (
    <div className="tracks" role="list">
      {showHeader && (
        <div className="trow thead" aria-hidden="true">
          <span className="n">#</span>
          <span>제목</span>
          <span className="col-src">{tracks.some((t) => t.reason) ? '추천 이유' : '음원'}</span>
          <span className="col-acts" />
          <span className="d">시간</span>
        </div>
      )}
      {tracks.map((t, i) => (
        <div className={`trow${t.reaction === 'dislike' ? ' dimmed' : ''}`} role="listitem" key={t.videoId}>
          <span className="n num">{i + 1}</span>
          <a className="ti" href={ytmWatch(t.videoId)} target="_blank" rel="noopener" title="YouTube Music에서 열기">
            <Art src={t.thumbnail} seed={t.videoId} />
            <span className="ti-text">
              <b>{t.title}</b>
              <small>
                {t.kind === 'art_track' && <span className="badge">음원</span>}
                {t.artist}
                {t.reason && <span className="why-m"> · {t.reason}</span>}
              </small>
            </span>
          </a>
          <span className={`col-src${t.reason ? ' why' : ''}`}>{t.reason || (t.kind === 'art_track' ? 'YouTube Music 공식 음원' : '뮤직비디오')}</span>
          {edit ? (
            <span className="col-acts edit-acts">
              <button className="icon-btn" aria-label="위로" disabled={i === 0} onClick={() => edit.onMove(i, i - 1)}><ArrowUp /></button>
              <button className="icon-btn" aria-label="아래로" disabled={i === tracks.length - 1} onClick={() => edit.onMove(i, i + 1)}><ArrowDown /></button>
              <button className="icon-btn danger" aria-label="목록에서 빼기" onClick={() => edit.onRemove(t.videoId)}><X /></button>
            </span>
          ) : (
            <span className="col-acts">
              <button
                className="icon-btn heart"
                aria-label="좋아요"
                aria-pressed={t.reaction === 'like'}
                onClick={() => react.mutate({ track: t, reaction: t.reaction === 'like' ? null : 'like' })}
              >
                <Heart />
              </button>
              <button
                className="icon-btn nope desk-only"
                aria-label="관심 없음"
                aria-pressed={t.reaction === 'dislike'}
                onClick={() => react.mutate({ track: t, reaction: t.reaction === 'dislike' ? null : 'dislike' })}
              >
                <CircleMinus />
              </button>
              <button className="icon-btn desk-only" aria-label="플레이리스트에 추가" onClick={() => openTrack(t, playlistId)}>
                <Plus />
              </button>
              <button className="icon-btn mob-only" aria-label="더 보기" onClick={() => openTrack(t, playlistId)}>
                <Ellipsis />
              </button>
            </span>
          )}
          <span className="d num">{fmtDuration(t.durationSec)}</span>
        </div>
      ))}
    </div>
  );
}
