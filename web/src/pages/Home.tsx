import { Link } from 'react-router-dom';
import { Art, Cover, LikedArt } from '../components/Art';
import { ErrorBox } from '../components/States';
import { useAuth } from '../lib/auth';
import { fmtDate, greeting } from '../lib/format';
import { useChart, usePlaylists } from '../lib/queries';
import { useUi } from '../lib/ui';

export function Home() {
  const { user } = useAuth();
  const playlists = usePlaylists();
  const chart = useChart('KR');
  const { openTrack } = useUi();
  const firstName = user?.name?.split(' ')[0] || '';

  return (
    <div className="view home">
      <h1 className="greet">{greeting()}{firstName && `, ${firstName}`}</h1>

      <div className="quick">
        <Link to="/liked" className="tile"><LikedArt /><b>좋아요한 곡</b></Link>
        {playlists.data?.slice(0, 7).map((pl) => (
          <Link key={pl.id} to={`/playlist/${pl.id}`} className="tile"><Cover covers={pl.covers} seed={pl.id} /><b>{pl.title}</b></Link>
        ))}
        {playlists.data && playlists.data.length === 0 && (
          <Link to="/search" className="tile tile-cta"><span className="plus">+</span><b>곡을 검색해 첫 플레이리스트 만들기</b></Link>
        )}
      </div>

      <section className="shelf">
        <div className="shelf-h">
          <h2>지금 한국에서</h2>
        </div>
        {chart.isError && <ErrorBox error={chart.error} onRetry={() => chart.refetch()} />}
        <div className="cards">
          {chart.isLoading && Array.from({ length: 6 }, (_, i) => <div key={i} className="card skeleton"><div className="art" /><b /><small /></div>)}
          {chart.data?.tracks.slice(0, 15).map((t, i) => (
            <button key={t.videoId} className="card" onClick={() => openTrack(t)}>
              <div className="card-art">
                <Art src={t.thumbnail} seed={t.videoId} />
                <span className="rank num">{i + 1}</span>
              </div>
              <b>{t.title}</b>
              <small>{t.artist}</small>
            </button>
          ))}
        </div>
        {chart.data && (
          <p className="src">출처: {chart.data.source} · {chart.data.region} · {fmtDate(chart.data.fetchedAt)} 기준. {chart.data.note}</p>
        )}
      </section>

      {!!playlists.data?.length && (
        <section className="shelf">
          <div className="shelf-h">
            <h2>내 플레이리스트</h2>
            <Link to="/library">모두 보기</Link>
          </div>
          <div className="cards">
            {playlists.data.map((pl) => (
              <Link key={pl.id} to={`/playlist/${pl.id}`} className="card">
                <div className="card-art"><Cover covers={pl.covers} seed={pl.id} /></div>
                <b>{pl.title}</b>
                <small>{pl.count}곡</small>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="shelf">
        <div className="shelf-h"><h2>AI 라디오</h2></div>
        <Link to="/radio" className="promo">
          <span className="eyebrow">AI 라디오</span>
          <b>좋아하는 노래로 비슷한 곡 20~30곡 만들기</b>
          <small>국내·해외를 골라 누르면 YouTube Music 재생목록으로 바로 만들어 드립니다.</small>
        </Link>
      </section>
    </div>
  );
}
