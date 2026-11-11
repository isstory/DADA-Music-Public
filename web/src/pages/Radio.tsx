import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Heart, ListMusic, Plus, Radio as RadioIcon, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Art } from '../components/Art';
import { ErrorBox, RowsSkeleton } from '../components/States';
import { TrackList } from '../components/TrackList';
import { call } from '../lib/api';
import { fmtTotal } from '../lib/format';
import { qk, useLiked, useRadio, useSaveRadio, useSearch } from '../lib/queries';
import type { RadioRegion, RadioResult, SyncResult, Track } from '../lib/types';
import { useUi } from '../lib/ui';

const REGIONS: { key: RadioRegion; label: string; hint: string }[] = [
  { key: 'kr', label: '국내', hint: '한국 아티스트만' },
  { key: 'intl', label: '해외', hint: '해외 아티스트만' },
  { key: 'mix', label: '국내+해외', hint: '절반씩 섞어서' },
];
const MAX_SEEDS = 20;

type Step = 'idle' | 'ai' | 'match' | 'sync' | 'done' | 'error';

export function Radio() {
  const radio = useRadio();
  const save = useSaveRadio();
  const liked = useLiked();
  const qc = useQueryClient();
  const { toast, selectPlaylist } = useUi();

  const [seeds, setSeeds] = useState<Track[]>([]);
  const [region, setRegion] = useState<RadioRegion>('mix');
  const [size, setSize] = useState<20 | 30>(20);
  const [step, setStep] = useState<Step>('idle');
  const [result, setResult] = useState<{ gen: RadioResult; sync: SyncResult } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  // 서버에 저장된 씨앗·설정으로 시작
  useEffect(() => {
    if (radio.data && !loaded.current) {
      loaded.current = true;
      setSeeds(radio.data.seeds);
      setRegion(radio.data.region);
      setSize(radio.data.size);
    }
  }, [radio.data]);

  const persist = (next: { seeds?: Track[]; region?: RadioRegion; size?: 20 | 30 }) => {
    const s = next.seeds ?? seeds;
    save.mutate({ seedIds: s.map((t) => t.videoId), region: next.region ?? region, size: next.size ?? size });
  };
  const addSeed = (t: Track) => {
    if (seeds.some((x) => x.videoId === t.videoId)) return;
    if (seeds.length >= MAX_SEEDS) return toast(`좋아하는 노래는 ${MAX_SEEDS}곡까지 등록할 수 있습니다`, 'error');
    const next = [...seeds, t];
    setSeeds(next);
    persist({ seeds: next });
  };
  const removeSeed = (id: string) => {
    const next = seeds.filter((t) => t.videoId !== id);
    setSeeds(next);
    persist({ seeds: next });
  };
  const importLiked = () => {
    const have = new Set(seeds.map((t) => t.videoId));
    const add = (liked.data ?? []).filter((t) => t.reaction === 'like' && !have.has(t.videoId)).slice(0, MAX_SEEDS - seeds.length);
    if (!add.length) return toast('가져올 좋아요한 곡이 없습니다');
    const next = [...seeds, ...add];
    setSeeds(next);
    persist({ seeds: next });
    toast(`좋아요한 곡 ${add.length}곡을 가져왔습니다`);
  };

  const running = step === 'ai' || step === 'match' || step === 'sync';
  const generate = async () => {
    if (running || !seeds.length) return;
    setError(null);
    setResult(null);
    setStep('ai');
    // 서버 한 번의 요청 안에서 AI 추천 → YouTube 확인이 이어지므로, 진행 표시는 시간으로 넘긴다
    const t = setTimeout(() => setStep((s) => (s === 'ai' ? 'match' : s)), 15000);
    try {
      const gen = await call<RadioResult>('radio.generate', { seedIds: seeds.map((s) => s.videoId), region, size });
      clearTimeout(t);
      setStep('sync');
      selectPlaylist(gen.playlistId);
      const sync = await call<SyncResult>('sync.push', { id: gen.playlistId });
      setResult({ gen, sync });
      setStep('done');
      if (sync.failed.length) toast(`${sync.failed.length}곡은 YouTube 재생목록에 넣을 수 없어 제외했습니다`, 'error');
    } catch (e) {
      clearTimeout(t);
      setError((e as Error).message);
      setStep('error');
    } finally {
      qc.invalidateQueries({ queryKey: qk.radio });
      qc.invalidateQueries({ queryKey: qk.playlists });
      qc.invalidateQueries({ queryKey: ['playlist'] });
    }
  };

  if (radio.isLoading) return <div className="view"><RowsSkeleton /></div>;
  if (radio.isError) return <div className="view"><ErrorBox error={radio.error} onRetry={() => radio.refetch()} /></div>;

  const current = radio.data?.radio;
  const listenUrl = result?.sync.url ?? (current?.playlist.sync?.state === 'ok' ? current.playlist.sync.url : undefined);

  return (
    <div className="view radio">
      <header className="radio-head">
        <span className="eyebrow">AI 라디오</span>
        <h1>좋아하는 노래로 만드는 나만의 라디오</h1>
        <p>좋아하는 노래를 고르고 지역을 정하면, AI가 비슷한 곡을 골라 YouTube Music 재생목록으로 만들어 드립니다.</p>
      </header>

      <section className="radio-card">
        <div className="radio-card-h">
          <h2><span className="stepno">1</span>좋아하는 노래</h2>
          <span className="muted small num">{seeds.length} / {MAX_SEEDS}</span>
        </div>
        {seeds.length > 0 ? (
          <div className="seeds">
            {seeds.map((t) => (
              <div key={t.videoId} className="seed">
                <Art src={t.thumbnail} seed={t.videoId} />
                <span className="ti-text"><b>{t.title}</b><small>{t.artist}</small></span>
                <button className="icon-btn" aria-label={`${t.title} 빼기`} onClick={() => removeSeed(t.videoId)}><X /></button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">아직 없습니다. 아래에서 검색해 추가하거나 좋아요한 곡을 가져오세요. 3~10곡이면 충분합니다.</p>
        )}
        <SeedSearch have={new Set(seeds.map((t) => t.videoId))} onAdd={addSeed} />
        <button className="btn btn-ghost btn-sm" onClick={importLiked} disabled={!liked.data?.length || seeds.length >= MAX_SEEDS}>
          <Heart />좋아요한 곡에서 가져오기{liked.data ? ` (${liked.data.filter((t) => t.reaction === 'like').length})` : ''}
        </button>
      </section>

      <section className="radio-card">
        <div className="radio-card-h"><h2><span className="stepno">2</span>어떤 음악으로?</h2></div>
        <div className="segmented" role="radiogroup" aria-label="지역">
          {REGIONS.map((r) => (
            <button key={r.key} role="radio" aria-checked={region === r.key} onClick={() => { setRegion(r.key); persist({ region: r.key }); }}>
              <b>{r.label}</b><small>{r.hint}</small>
            </button>
          ))}
        </div>
        <div className="segmented small-seg" role="radiogroup" aria-label="곡 수">
          {([20, 30] as const).map((n) => (
            <button key={n} role="radio" aria-checked={size === n} onClick={() => { setSize(n); persist({ size: n }); }}>
              <b>{n}곡</b><small>약 {n === 20 ? '1시간 20분' : '2시간'}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="radio-card go">
        <button className="btn btn-primary btn-xl" onClick={generate} disabled={running || !seeds.length}>
          <RadioIcon />{running ? '만드는 중…' : current ? 'AI 라디오 새로 만들고 듣기' : 'AI 라디오 만들고 듣기'}
        </button>
        {!seeds.length && <p className="muted small">좋아하는 노래를 한 곡 이상 등록하면 만들 수 있습니다.</p>}
        {running && (
          <ol className="steps" aria-live="polite">
            <li className={step === 'ai' ? 'now' : 'done'}>AI가 비슷한 곡을 고르는 중</li>
            <li className={step === 'match' ? 'now' : step === 'sync' ? 'done' : ''}>YouTube에서 실제 곡인지 확인하는 중</li>
            <li className={step === 'sync' ? 'now' : ''}>YouTube Music 재생목록으로 보내는 중</li>
          </ol>
        )}
        {running && <p className="muted small">보통 1~2분 걸립니다. 이 화면을 닫아도 서버에서 계속 진행됩니다.</p>}
        {step === 'error' && error && <div className="state error" role="alert"><p>{error}</p></div>}
        {step === 'done' && result && (
          <div className="radio-done">
            <b>{result.gen.count}곡 라디오를 만들었습니다</b>
            {result.gen.note && <p className="note">“{result.gen.note}”</p>}
            {result.gen.unmatched.length > 0 && (
              <p className="muted small">AI가 고른 곡 중 {result.gen.unmatched.length}곡은 YouTube에서 정확히 찾지 못해 뺐습니다.</p>
            )}
          </div>
        )}
        {listenUrl && !running && (
          <a className="btn btn-primary btn-xl listen" href={listenUrl} target="_blank" rel="noopener"><ExternalLink />YouTube Music에서 듣기</a>
        )}
        <p className="src">한 번 만들 때 YouTube 사용량 약 2,000~4,000 (하루 10,000). 이미 찾아본 곡은 다시 차감되지 않습니다.</p>
      </section>

      {current && current.tracks.length > 0 && (
        <section className="shelf">
          <div className="shelf-h">
            <h2>지금 라디오 · {current.playlist.count}곡{current.playlist.totalSec ? ` · ${fmtTotal(current.playlist.totalSec)}` : ''}</h2>
            <Link to={`/playlist/${current.playlist.id}`}><ListMusic size={14} /> 목록 편집</Link>
          </div>
          {radio.data?.note && <p className="note">“{radio.data.note}”</p>}
          <TrackList tracks={current.tracks} playlistId={current.playlist.id} showHeader={false} />
        </section>
      )}
    </div>
  );
}

/** 씨앗 추가용 검색 (Enter 시에만 검색 — 1회 100 units) */
function SeedSearch({ have, onAdd }: { have: Set<string>; onAdd: (t: Track) => void }) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const res = useSearch(q);
  return (
    <div className="seed-search">
      <form
        className="searchbox"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(text.trim());
        }}
      >
        <SearchIcon />
        <input id="seed-q" type="search" placeholder="노래나 가수 검색해서 추가" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search" autoComplete="off" />
        <button className="btn btn-primary btn-sm" disabled={!text.trim()}>검색</button>
      </form>
      {q && res.isLoading && <p className="muted small">검색 중…</p>}
      {res.isError && <ErrorBox error={res.error} />}
      {res.data && (
        <div className="seed-results">
          {res.data.slice(0, 6).map((t) => (
            <div key={t.videoId} className="seed">
              <Art src={t.thumbnail} seed={t.videoId} />
              <span className="ti-text"><b>{t.title}</b><small>{t.kind === 'art_track' && <span className="badge">음원</span>}{t.artist}</small></span>
              <button className="icon-btn" aria-label={`${t.title} 추가`} disabled={have.has(t.videoId)} onClick={() => onAdd(t)}>
                <Plus />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setText(''); }}>검색 닫기</button>
        </div>
      )}
    </div>
  );
}
