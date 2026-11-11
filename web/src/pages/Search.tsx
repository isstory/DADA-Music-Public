import { Search as SearchIcon, X } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Empty, ErrorBox, RowsSkeleton } from '../components/States';
import { TrackList } from '../components/TrackList';
import { useSearch } from '../lib/queries';

const RECENT_KEY = 'dada.recentSearches';
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

export function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [text, setText] = useState(q);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const result = useSearch(q);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v) return;
    setText(v);
    setParams({ q: v });
    const next = [v, ...recent.filter((r) => r !== v)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="view">
      <h1 className="page-title">탐색</h1>
      <form
        className="searchbox"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <SearchIcon />
        <input id="search-q" type="search" placeholder="곡이나 아티스트 이름" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="search" autoComplete="off" />
        {text && <button type="button" className="icon-btn" aria-label="지우기" onClick={() => setText('')}><X /></button>}
        <button className="btn btn-primary btn-sm" disabled={!text.trim()}>검색</button>
      </form>
      <p className="src">검색 1회에 YouTube 사용량 100이 듭니다. 같은 검색어는 7일 동안 다시 차감되지 않습니다.</p>

      {!q && recent.length > 0 && (
        <div className="recent">
          <p className="label">최근 검색</p>
          <div className="chips">
            {recent.map((r) => (
              <button key={r} className="chip" onClick={() => submit(r)}>{r}</button>
            ))}
          </div>
        </div>
      )}

      {q && result.isLoading && <RowsSkeleton />}
      {result.isError && <ErrorBox error={result.error} onRetry={() => result.refetch()} />}
      {result.data && result.data.length === 0 && <Empty title={`‘${q}’ 검색 결과가 없습니다`}>철자를 확인하거나 아티스트 이름을 함께 입력해 보세요.</Empty>}
      {result.data && result.data.length > 0 && (
        <>
          <p className="label">‘{q}’ 검색 결과 · 공식 음원을 먼저 보여줍니다</p>
          <TrackList tracks={result.data} />
        </>
      )}
    </div>
  );
}
