import { Link } from 'react-router-dom';

/** The lime brand symbol and the BIZZAR BUZZAR wordmark. Links home. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-3 rounded-[10px] text-text no-underline" aria-label="Bizzar Buzzar, home">
      <span
        aria-hidden="true"
        className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-lime font-display text-2xl leading-none font-black text-[#090b0a]"
      >
        B
      </span>
      {!compact && (
        <span className="font-display text-[22px] leading-none font-black tracking-[0.04em] uppercase">Bizzar Buzzar</span>
      )}
    </Link>
  );
}
