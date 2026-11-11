import { Link } from 'react-router-dom';
import { LikedArt } from '../components/Art';
import { Empty, ErrorBox, RowsSkeleton } from '../components/States';
import { TrackList } from '../components/TrackList';
import { useAuth } from '../lib/auth';
import { fmtTotal } from '../lib/format';
import { useLiked } from '../lib/queries';

export function Liked() {
  const liked = useLiked();
  const { user } = useAuth();
  const list = liked.data?.filter((t) => t.reaction === 'like') ?? [];
  const total = list.reduce((s, t) => s + t.durationSec, 0);

  return (
    <div className="view detail" style={{ '--tint': '38 45% 32%' } as React.CSSProperties}>
      <header className="pl-head">
        <LikedArt className="pl-cover" />
        <div className="pl-meta">
          <span className="kind">플레이리스트</span>
          <h1>좋아요한 곡</h1>
          <span className="facts">{user?.name || user?.email} · {list.length}곡{total ? `, ${fmtTotal(total)}` : ''}</span>
        </div>
      </header>
      <div className="pl-body">
        {liked.isLoading && <RowsSkeleton />}
        {liked.isError && <ErrorBox error={liked.error} onRetry={() => liked.refetch()} />}
        {liked.data && list.length === 0 && (
          <Empty title="좋아요한 곡이 없습니다" action={<Link to="/search" className="btn btn-primary btn-sm">곡 찾아보기</Link>}>
            하트를 누른 곡이 여기에 모이고, AI 추천의 재료가 됩니다.
          </Empty>
        )}
        {list.length > 0 && <TrackList tracks={list} />}
      </div>
    </div>
  );
}
