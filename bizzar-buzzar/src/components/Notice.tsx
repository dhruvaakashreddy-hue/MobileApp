import type { ReactNode } from 'react';

const TONE = {
  info: 'border-line bg-elevated text-text',
  warn: 'border-amber/50 bg-amber/10 text-amber',
  error: 'border-danger/50 bg-danger/10 text-danger',
  success: 'border-lime/50 bg-lime/10 text-lime',
} as const;

/** A status message. Errors use role="alert" so screen readers announce them. */
export function Notice({ tone = 'info', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-[14px] border px-4 py-3 text-sm leading-relaxed ${TONE[tone]}`}>
      {children}
    </div>
  );
}

/** Marks the page as sample content. Shown on every preview surface, as the brief requires. */
export function PreviewBanner() {
  return (
    <div className="mb-6 rounded-[14px] border border-amber/50 bg-amber/10 px-4 py-2 text-sm font-medium text-amber">
      Concept preview — sample products and prices
    </div>
  );
}
