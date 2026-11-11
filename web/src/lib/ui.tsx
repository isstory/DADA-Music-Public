/** 앱 전역 UI 상태: 토스트, 곡 액션 시트, "보낼 목록" 선택 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Track } from './types';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}
interface UiCtx {
  toast: (text: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  sheetTrack: { track: Track; playlistId?: string } | null;
  openTrack: (track: Track, playlistId?: string) => void;
  closeTrack: () => void;
  selectedPlaylistId: string | null;
  selectPlaylist: (id: string | null) => void;
}
const Ctx = createContext<UiCtx | null>(null);
const SEL_KEY = 'dada.selectedPlaylist';

export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheetTrack, setSheetTrack] = useState<UiCtx['sheetTrack']>(null);
  const [selectedPlaylistId, setSel] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SEL_KEY);
    } catch {
      return null;
    }
  });
  const seq = useRef(0);

  const toast = useCallback((text: string, tone: Toast['tone'] = 'info') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 5000 : 2600);
  }, []);

  const value = useMemo<UiCtx>(
    () => ({
      toast,
      toasts,
      sheetTrack,
      openTrack: (track, playlistId) => setSheetTrack({ track, playlistId }),
      closeTrack: () => setSheetTrack(null),
      selectedPlaylistId,
      selectPlaylist: (id) => {
        setSel(id);
        try {
          if (id) localStorage.setItem(SEL_KEY, id);
          else localStorage.removeItem(SEL_KEY);
        } catch {
          /* ignore */
        }
      },
    }),
    [toast, toasts, sheetTrack, selectedPlaylistId],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi() {
  const c = useContext(Ctx);
  if (!c) throw new Error('UiProvider 밖에서 useUi 사용');
  return c;
}
