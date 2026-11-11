import { Heart } from 'lucide-react';
import { hueOf } from '../lib/format';

/**
 * 앨범아트. YouTube hqdefault(4:3, 위아래 검은 띠)를 확대 크롭해 정사각형으로 보여준다.
 * 썸네일이 없으면(데모) videoId 기반 그라데이션.
 */
export function Art({ src, seed, className = '', round = false }: { src?: string; seed: string; className?: string; round?: boolean }) {
  const cls = `art ${round ? 'round ' : ''}${className}`;
  if (src) {
    return (
      <div className={cls}>
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
      </div>
    );
  }
  const h = hueOf(seed);
  return <div className={cls} style={{ '--h1': h, '--h2': (h + 140) % 360 } as React.CSSProperties} />;
}

/** 플레이리스트 커버: 4곡 이상이면 2×2 모자이크 */
export function Cover({ covers, seed, className = '' }: { covers?: string[]; seed: string; className?: string }) {
  if (covers && covers.length >= 4) {
    return (
      <div className={`art mosaic ${className}`}>
        {covers.slice(0, 4).map((c, i) => (
          <img key={i} src={c} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ))}
      </div>
    );
  }
  return <Art src={covers?.[0]} seed={seed} className={className} />;
}

export function LikedArt({ className = '' }: { className?: string }) {
  return (
    <div className={`art liked ${className}`}>
      <Heart fill="currentColor" strokeWidth={0} />
    </div>
  );
}
