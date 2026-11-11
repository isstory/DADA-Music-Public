export type Reaction = 'like' | 'dislike' | null;

export interface Track {
  videoId: string;
  title: string;
  artist: string;
  channel: string;
  /** art_track = YouTube Music 공식 음원(Topic 채널), video = 일반 뮤직비디오 */
  kind: 'art_track' | 'video';
  thumbnail: string;
  durationSec: number;
  reaction?: Reaction;
  /** AI 라디오 추천 이유 */
  reason?: string;
}

export interface Playlist {
  id: string;
  title: string;
  kind: 'manual' | 'radio' | 'shared';
  createdAt: string;
  updatedAt: string;
  count: number;
  totalSec: number;
  covers?: string[];
  sync?: PlaylistSync;
}

/** YouTube Music 동기화 상태: none(안 보냄) · ok(최신) · outdated(보낸 뒤 바뀜) · error */
export interface PlaylistSync {
  state: 'none' | 'ok' | 'outdated' | 'error';
  ytPlaylistId?: string;
  url?: string;
  syncedAt?: string;
  note?: string;
  error?: string;
}

export interface SyncResult {
  mode: 'skip' | 'append' | 'swap';
  ytPlaylistId: string;
  url: string;
  firstVideoId: string;
  count: number;
  videoIds: string[];
  failed: string[];
  failedReasons: string[];
  units: number;
}

export interface User {
  key: string;
  email: string;
  name: string;
  picture: string;
}

export interface Quota {
  used: number;
  limit: number;
  day: string;
}

export interface Chart {
  region: string;
  source: string;
  note: string;
  fetchedAt: string;
  tracks: Track[];
}

export interface AddResult {
  added: number;
  duplicates: number;
  unavailable: number;
}

export type RadioRegion = 'kr' | 'intl' | 'mix';

export interface RadioState {
  seeds: Track[];
  region: RadioRegion;
  size: 20 | 30;
  note: string;
  generatedAt: string;
  radio: { playlist: Playlist; tracks: Track[] } | null;
}

export interface RadioResult {
  playlistId: string;
  count: number;
  note: string;
  requested: number;
  unmatched: string[];
  stoppedByQuota: boolean;
  cachedSearches: number;
  units: number;
}
