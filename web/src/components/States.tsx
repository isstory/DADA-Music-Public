import type { ReactNode } from 'react';

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <p>{(error as Error)?.message ?? '불러오지 못했습니다.'}</p>
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>다시 시도</button>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state empty">
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function RowsSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="tracks" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="trow skeleton"><span className="n" /><span className="ti"><span className="art" /><span className="ti-text"><b /><small /></span></span></div>
      ))}
    </div>
  );
}
