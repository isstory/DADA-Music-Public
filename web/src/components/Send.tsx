import { ExternalLink, RefreshCw, Send } from 'lucide-react';
import { useSync } from '../lib/queries';
import type { Playlist, PlaylistSync } from '../lib/types';
import { useUi } from '../lib/ui';

export function fmtAgo(iso?: string) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '방금';
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

/** 30곡 기준 약 40초 — 곡당 1.2초 + 검증 */
const estimateSec = (n: number) => Math.round(n * 1.2 + 6);

export function SyncStatus({ sync, pending, count = 0 }: { sync?: PlaylistSync; pending?: boolean; count?: number }) {
  if (pending) return <span className="status run"><i />YouTube Music으로 보내는 중 · 약 {estimateSec(count)}초</span>;
  switch (sync?.state) {
    case 'ok':
      return <span className="status ok" title={sync.note || undefined}><i />YouTube Music과 같음 · {fmtAgo(sync.syncedAt)}{sync.note ? ' · 일부 제외' : ''}</span>;
    case 'outdated':
      return <span className="status warn"><i />보낸 뒤 바뀜 · 다시 보내야 반영</span>;
    case 'error':
      return <span className="status err" title={sync.error || sync.note}><i />보내기 실패 · {sync.ytPlaylistId ? '이전 목록 유지' : '다시 시도하세요'}</span>;
    default:
      return <span className="status soon"><i />아직 보내지 않음</span>;
  }
}

/** 보내기 + 결과 안내. 어느 화면에서 눌러도 같은 진행 상태를 공유 */
export function useSendAction(pl?: Pick<Playlist, 'id' | 'title' | 'count'> | null) {
  const sync = useSync(pl?.id);
  const { toast, selectPlaylist } = useUi();
  const send = () => {
    if (!pl || sync.pending) return;
    if (!pl.count) return toast('빈 플레이리스트는 보낼 수 없습니다. 곡을 먼저 담으세요.', 'error');
    selectPlaylist(pl.id);
    sync.mutate(undefined, {
      onSuccess: (r) => {
        if (r.mode === 'skip') toast('바뀐 곡이 없어 YouTube Music 목록을 그대로 둡니다');
        else if (r.mode === 'append') toast(`추가한 곡을 YouTube Music 목록에 넣었습니다 (${r.count}곡)`);
        else toast(`YouTube Music에 ‘${pl.title}’을 보냈습니다 (${r.count}곡). 열기를 누르세요`);
        if (r.failed.length) toast(`${r.failed.length}곡은 YouTube에서 재생목록에 넣을 수 없어 제외했습니다`, 'error');
      },
      onError: (e) => toast((e as Error).message, 'error'),
    });
  };
  return { send, pending: sync.pending };
}

/** 플레이리스트 화면의 주 버튼 묶음 */
export function SendActions({ playlist }: { playlist: Playlist }) {
  const { send, pending } = useSendAction(playlist);
  const s = playlist.sync;
  const canOpen = !!s?.url && s.state !== 'none';
  const fresh = s?.state === 'ok';

  return (
    <>
      {canOpen && fresh ? (
        <a className="btn btn-primary" href={s!.url} target="_blank" rel="noopener"><ExternalLink />YouTube Music에서 열기</a>
      ) : (
        <button className="btn btn-primary" onClick={send} disabled={pending}>
          {s?.state === 'outdated' || s?.state === 'error' ? <RefreshCw /> : <Send />}
          {pending ? '보내는 중…' : s?.state === 'outdated' || s?.state === 'error' ? '다시 보내기' : 'YouTube Music으로 보내기'}
        </button>
      )}
      {canOpen && !fresh && (
        <a className="btn btn-ghost" href={s!.url} target="_blank" rel="noopener"><ExternalLink />이전 목록 열기</a>
      )}
    </>
  );
}
