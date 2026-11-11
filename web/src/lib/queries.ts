import { useIsMutating, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { call, quotaStore } from './api';
import type { AddResult, Chart, Playlist, RadioState, Reaction, SyncResult, Track } from './types';

export const qk = {
  radio: ['radio'] as const,
  playlists: ['playlists'] as const,
  playlist: (id: string) => ['playlist', id] as const,
  liked: ['liked'] as const,
  chart: (region: string) => ['chart', region] as const,
  search: (q: string) => ['search', q] as const,
};

export const useQuota = () => useSyncExternalStore(quotaStore.subscribe, quotaStore.get);

export const usePlaylists = () =>
  useQuery({ queryKey: qk.playlists, queryFn: () => call<{ playlists: Playlist[] }>('playlists.list').then((r) => r.playlists) });

export const usePlaylist = (id: string | null | undefined) =>
  useQuery({
    queryKey: qk.playlist(id ?? ''),
    queryFn: () => call<{ playlist: Playlist; tracks: Track[] }>('playlists.get', { id }),
    enabled: !!id,
  });

export const useLiked = () =>
  useQuery({ queryKey: qk.liked, queryFn: () => call<{ tracks: Track[] }>('reactions.list', { reaction: 'like' }).then((r) => r.tracks) });

export const useChart = (region = 'KR') =>
  useQuery({ queryKey: qk.chart(region), queryFn: () => call<Chart>('chart', { region }), staleTime: 30 * 60_000 });

/** 검색은 1회 100 units → 입력 중 자동 검색하지 않고, 같은 검색어는 오래 캐시 */
export const useSearch = (q: string) =>
  useQuery({
    queryKey: qk.search(q),
    queryFn: () => call<Track[]>('search', { q }),
    enabled: q.trim().length > 0,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
  });

/** 캐시 안의 모든 곡 목록에서 같은 videoId 의 reaction 을 바꾼다 */
function patchReaction(qc: QueryClient, videoId: string, reaction: Reaction) {
  const fix = (t: Track) => (t.videoId === videoId ? { ...t, reaction } : t);
  qc.setQueriesData<Track[]>({ queryKey: ['search'] }, (d) => d?.map(fix));
  qc.setQueriesData<Chart>({ queryKey: ['chart'] }, (d) => (d ? { ...d, tracks: d.tracks.map(fix) } : d));
  qc.setQueriesData<{ playlist: Playlist; tracks: Track[] }>({ queryKey: ['playlist'] }, (d) => (d ? { ...d, tracks: d.tracks.map(fix) } : d));
  qc.setQueriesData<Track[]>({ queryKey: qk.liked }, (d) => d?.map(fix));
}

export function useReact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { track: Track; reaction: Reaction }) => call('reactions.set', { videoId: v.track.videoId, reaction: v.reaction }),
    onMutate: (v) => {
      const prev = v.track.reaction ?? null;
      patchReaction(qc, v.track.videoId, v.reaction);
      return { prev };
    },
    onError: (_e, v, ctx) => patchReaction(qc, v.track.videoId, ctx?.prev ?? null),
    onSettled: () => qc.invalidateQueries({ queryKey: qk.liked }),
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { title: string; videoIds?: string[] }) => call<{ playlist: Playlist }>('playlists.create', v).then((r) => r.playlist),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.playlists }),
  });
}

export function useAddTracks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; videoIds: string[] }) => call<AddResult>('playlists.addTracks', v),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: qk.playlist(v.id) });
      qc.invalidateQueries({ queryKey: qk.playlists });
    },
  });
}

/**
 * YouTube Music으로 보내기. 30곡 기준 수십 초 걸릴 수 있어 mutationKey 로
 * 어느 화면에서 눌러도 같은 진행 상태를 공유한다 (서버도 중복 실행을 막음).
 */
export function useSync(id: string | null | undefined) {
  const qc = useQueryClient();
  const pending = useIsMutating({ mutationKey: ['sync', id ?? ''] }) > 0;
  const m = useMutation({
    mutationKey: ['sync', id ?? ''],
    mutationFn: () => call<SyncResult>('sync.push', { id }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.playlists });
      if (id) qc.invalidateQueries({ queryKey: qk.playlist(id) });
    },
  });
  return { ...m, pending: pending || m.isPending };
}

export function usePlaylistMutations(id: string) {
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: qk.playlist(id) });
    qc.invalidateQueries({ queryKey: qk.playlists });
  };
  return {
    rename: useMutation({ mutationFn: (title: string) => call('playlists.update', { id, title }), onSuccess: refresh }),
    remove: useMutation({ mutationFn: () => call('playlists.delete', { id }), onSuccess: () => qc.invalidateQueries({ queryKey: qk.playlists }) }),
    removeTracks: useMutation({ mutationFn: (videoIds: string[]) => call('playlists.removeTracks', { id, videoIds }), onSuccess: refresh }),
    reorder: useMutation({ mutationFn: (videoIds: string[]) => call('playlists.reorder', { id, videoIds }), onSuccess: refresh }),
  };
}

export const useRadio = () => useQuery({ queryKey: qk.radio, queryFn: () => call<RadioState>('radio.get') });

export function useSaveRadio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { seedIds: string[]; region: string; size: number }) => call<RadioState>('radio.save', v),
    onSuccess: (d) => qc.setQueryData(qk.radio, d),
  });
}
