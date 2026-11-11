/**
 * 데모 모드 백엔드. GAS API와 같은 action/응답 형식을 브라우저 안에서 흉내낸다.
 * 데이터는 이 브라우저의 localStorage 에만 저장되며, 화면에는 항상 DEMO 표시가 붙는다.
 */
import type { AddResult, Playlist, PlaylistSync, Quota, RadioRegion, RadioResult, RadioState, Reaction, SyncResult, Track } from './types';
import { ApiError, quotaStore } from './api';

const CATALOG: Track[] = [
  ['I0_ZXHzKysc', 'Blueming', 'IU', 'art_track', 217],
  ['9wUKhEgnllc', 'Hype Boy', 'NewJeans', 'video', 179],
  ['gdZLi9oWNZg', 'Dynamite', 'BTS', 'video', 223],
  ['fJ9rUzIMcZQ', 'Bohemian Rhapsody', 'Queen', 'video', 359],
  ['dvgZkm1xWPE', 'Viva La Vida', 'Coldplay', 'video', 242],
  ['demo0000006', 'Through the Night', 'IU', 'art_track', 254],
  ['demo0000007', 'Fix You', 'Coldplay', 'art_track', 295],
  ['demo0000008', 'Rain', '태연', 'art_track', 238],
  ['demo0000009', 'Lost Stars', 'Adam Levine', 'art_track', 267],
  ['demo0000010', '봄날', 'BTS', 'video', 274],
  ['demo0000011', 'Yellow', 'Coldplay', 'art_track', 269],
  ['demo0000012', '밤편지', 'IU', 'art_track', 253],
  ['demo0000013', 'Supernova', 'aespa', 'video', 179],
  ['demo0000014', 'Ditto', 'NewJeans', 'video', 186],
  ['demo0000015', 'Love wins all', 'IU', 'video', 271],
  ['demo0000016', 'The Night We Met', 'Lord Huron', 'art_track', 208],
].map(([videoId, title, artist, kind, durationSec]) => ({
  videoId: videoId as string,
  title: title as string,
  artist: artist as string,
  channel: kind === 'art_track' ? `${artist} - Topic` : (artist as string),
  kind: kind as Track['kind'],
  thumbnail: '',
  durationSec: durationSec as number,
}));

interface Store {
  reactions: Record<string, Reaction>;
  playlists: Omit<Playlist, 'count' | 'totalSec' | 'covers'>[];
  items: Record<string, string[]>;
  quota: Quota;
  sync?: Record<string, { ids: string[]; yt: string; at: string }>;
  radio?: { seedIds: string[]; region: RadioRegion; size: 20 | 30; playlistId?: string; note: string; at: string; reasons: Record<string, string> };
}

const KEY = 'dada.demo.v1';
function seed(): Store {
  const now = new Date().toISOString();
  return {
    reactions: { dvgZkm1xWPE: 'like', I0_ZXHzKysc: 'like' },
    playlists: [{ id: 'demo-pl-1', title: '늦가을 산책', kind: 'manual', createdAt: now, updatedAt: now }],
    items: { 'demo-pl-1': ['I0_ZXHzKysc', 'dvgZkm1xWPE', 'demo0000006', 'demo0000008'] },
    quota: { used: 0, limit: 10000, day: now.slice(0, 10) },
  };
}
function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* 저장소 사용 불가 시 메모리로 동작 */
  }
  return seed();
}
let db = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

const byId = new Map(CATALOG.map((t) => [t.videoId, t]));
const withR = (ids: string[]) =>
  ids.map((id) => byId.get(id)).filter((t): t is Track => !!t).map((t) => ({ ...t, reaction: db.reactions[t.videoId] ?? null }));
const summarize = (pl: Store['playlists'][number]): Playlist => {
  const ids = db.items[pl.id] ?? [];
  const rec = db.sync?.[pl.id];
  const sync: PlaylistSync = rec
    ? { state: rec.ids.join() === ids.join() ? 'ok' : 'outdated', ytPlaylistId: rec.yt, url: `https://music.youtube.com/playlist?list=${rec.yt}`, syncedAt: rec.at }
    : { state: 'none' };
  return { ...pl, count: ids.length, totalSec: ids.reduce((s, id) => s + (byId.get(id)?.durationSec ?? 0), 0), covers: [], sync };
};
const own = (id: unknown) => {
  const pl = db.playlists.find((p) => p.id === id);
  if (!pl) throw new ApiError('not_found', '플레이리스트를 찾을 수 없습니다.');
  return pl;
};
const touch = (id: string) => {
  const pl = own(id);
  pl.updatedAt = new Date().toISOString();
};
const cleanTitle = (t: unknown) => {
  const s = String(t ?? '').trim();
  if (!s) throw new ApiError('bad_request', '플레이리스트 이름을 입력하세요.');
  if (s.length > 80) throw new ApiError('bad_request', '이름은 80자 이내로 입력하세요.');
  return s;
};

const handlers: Record<string, (p: Record<string, any>) => unknown> = {
  me: () => ({ user: { key: 'a', email: 'demo@dada.music', name: '데모', picture: '' } }),
  search: (p) => {
    db.quota.used += 101;
    const q = String(p.q ?? '').toLowerCase().trim();
    const hits = CATALOG.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(q));
    return withR((hits.length ? hits : CATALOG.slice(0, 8)).map((t) => t.videoId));
  },
  chart: () => {
    db.quota.used += 1;
    return {
      region: 'KR',
      source: 'YouTube 인기 뮤직비디오',
      note: '공식 음원 차트가 아닙니다.',
      fetchedAt: new Date().toISOString(),
      tracks: withR(['9wUKhEgnllc', 'demo0000013', 'gdZLi9oWNZg', 'demo0000014', 'I0_ZXHzKysc', 'demo0000015', 'demo0000010', 'demo0000012']),
    };
  },
  'reactions.set': (p) => {
    if (p.reaction) db.reactions[p.videoId] = p.reaction;
    else delete db.reactions[p.videoId];
    return { videoId: p.videoId, reaction: p.reaction ?? null };
  },
  'reactions.list': (p) => ({
    tracks: withR(Object.keys(db.reactions).filter((id) => db.reactions[id] === (p.reaction ?? 'like'))),
  }),
  'playlists.list': () => ({
    playlists: [...db.playlists].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summarize),
  }),
  'playlists.get': (p) => {
    const pl = own(p.id);
    return { playlist: summarize(pl), tracks: withR(db.items[pl.id] ?? []) };
  },
  'playlists.create': (p) => {
    const now = new Date().toISOString();
    const pl = { id: `demo-${Date.now().toString(36)}`, title: cleanTitle(p.title), kind: 'manual' as const, createdAt: now, updatedAt: now };
    db.playlists.push(pl);
    db.items[pl.id] = [...new Set<string>(p.videoIds ?? [])];
    return { playlist: summarize(pl) };
  },
  'playlists.update': (p) => {
    const pl = own(p.id);
    pl.title = cleanTitle(p.title);
    touch(pl.id);
    return { id: pl.id, title: pl.title };
  },
  'playlists.delete': (p) => {
    own(p.id);
    db.playlists = db.playlists.filter((x) => x.id !== p.id);
    delete db.items[p.id];
    return { id: p.id, deleted: true };
  },
  'playlists.addTracks': (p): AddResult => {
    const pl = own(p.id);
    const cur = db.items[pl.id] ?? [];
    let duplicates = 0;
    let added = 0;
    for (const id of p.videoIds as string[]) {
      if (cur.includes(id)) duplicates++;
      else {
        cur.push(id);
        added++;
      }
    }
    db.items[pl.id] = cur;
    touch(pl.id);
    return { added, duplicates, unavailable: 0 };
  },
  'playlists.removeTracks': (p) => {
    const pl = own(p.id);
    const drop = new Set<string>(p.videoIds);
    db.items[pl.id] = (db.items[pl.id] ?? []).filter((id) => !drop.has(id));
    touch(pl.id);
    return { removed: drop.size };
  },
  /** 데모: 실제 YouTube에는 보내지 않고 상태만 흉내 (링크는 존재하지 않는 목록) */
  'sync.push': (p): SyncResult => {
    const pl = own(p.id);
    const ids = db.items[pl.id] ?? [];
    if (!ids.length) throw new ApiError('bad_request', '빈 플레이리스트는 보낼 수 없습니다. 곡을 먼저 담으세요.');
    db.sync = db.sync ?? {};
    const prev = db.sync[pl.id];
    const mode: SyncResult['mode'] = prev && prev.ids.join() === ids.join() ? 'skip' : prev && ids.join().startsWith(prev.ids.join()) ? 'append' : 'swap';
    const yt = mode === 'swap' ? `PLDEMO${Date.now().toString(36)}` : prev!.yt;
    db.quota.used += mode === 'skip' ? 1 : mode === 'append' ? 50 * (ids.length - prev!.ids.length) : 100 + 50 * ids.length;
    db.sync[pl.id] = { ids: [...ids], yt, at: new Date().toISOString() };
    return { mode, ytPlaylistId: yt, url: `https://music.youtube.com/playlist?list=${yt}`, firstVideoId: ids[0], count: ids.length, videoIds: ids, failed: [], failedReasons: [], units: 0 };
  },
  'radio.get': (): RadioState => {
    const r = db.radio;
    const pl = r?.playlistId ? db.playlists.find((x) => x.id === r.playlistId) : undefined;
    return {
      seeds: withR(r?.seedIds ?? []),
      region: r?.region ?? 'mix',
      size: r?.size ?? 20,
      note: r?.note ?? '',
      generatedAt: r?.at ?? '',
      radio: pl ? { playlist: summarize(pl), tracks: withR(db.items[pl.id] ?? []).map((t) => ({ ...t, reason: r?.reasons[t.videoId] ?? '' })) } : null,
    };
  },
  'radio.save': (p) => {
    db.radio = { ...(db.radio ?? { note: '', at: '', reasons: {} }), seedIds: p.seedIds, region: p.region, size: p.size };
    return handlers['radio.get']({});
  },
  /** 데모: AI 대신 카탈로그에서 씨앗을 뺀 곡을 섞어 고른다 */
  'radio.generate': (p): RadioResult => {
    const seedIds: string[] = p.seedIds ?? [];
    if (!seedIds.length) throw new ApiError('bad_request', '좋아하는 노래를 한 곡 이상 등록하세요.');
    const pool = CATALOG.filter((t) => !seedIds.includes(t.videoId)).sort(() => Math.random() - 0.5).slice(0, Math.min(p.size ?? 20, 12));
    const now = new Date().toISOString();
    let id = db.radio?.playlistId;
    const title = 'AI 라디오 · ' + ({ kr: '국내', intl: '해외', mix: '국내+해외' } as const)[p.region as RadioRegion];
    const existing = db.playlists.find((x) => x.id === id);
    if (existing) { existing.title = title; existing.updatedAt = now; }
    else { id = 'demo-radio'; db.playlists.push({ id, title, kind: 'radio', createdAt: now, updatedAt: now }); }
    db.items[id!] = pool.map((t) => t.videoId);
    const reasons: Record<string, string> = {};
    pool.forEach((t) => (reasons[t.videoId] = `${t.artist} 느낌의 데모 추천`));
    db.radio = { seedIds, region: p.region, size: p.size, playlistId: id, note: '데모 모드: AI 없이 무작위로 고른 목록입니다', at: now, reasons };
    db.quota.used += 300;
    return { playlistId: id!, count: pool.length, note: db.radio.note, requested: pool.length, unmatched: [], stoppedByQuota: false, cachedSearches: 0, units: 300 };
  },
  'playlists.reorder': (p) => {
    const pl = own(p.id);
    const cur = [...(db.items[pl.id] ?? [])].sort().join();
    const next = p.videoIds as string[];
    if ([...next].sort().join() !== cur) throw new ApiError('conflict', '목록이 다른 곳에서 바뀌었습니다. 새로고침 후 다시 시도하세요.');
    db.items[pl.id] = next;
    touch(pl.id);
    return { id: pl.id, count: next.length };
  },
};

export async function mockCall<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  await new Promise((r) => setTimeout(r, action === 'sync.push' ? 2000 : action === 'radio.generate' ? 3000 : 220));
  const h = handlers[action];
  if (!h) throw new ApiError('not_found', `알 수 없는 요청: ${action}`);
  const data = h(payload as Record<string, any>);
  save();
  quotaStore.set({ ...db.quota });
  return structuredClone(data) as T;
}

export function resetDemo() {
  db = seed();
  save();
}
