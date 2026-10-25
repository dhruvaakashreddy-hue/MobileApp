import { Link } from 'react-router-dom';
import type { PastDrop } from '../../shared/api-types.ts';
import { formatDate, money } from '../lib/format.ts';
import { CONDITION_LABEL } from './FeaturedDrop.tsx';
import { Chip } from './StatusChip.tsx';

/** Sold or ended drops. The product and price show; no buyer is named. */
export function PastDrops({ drops, limit }: { drops: PastDrop[]; limit?: number }) {
  const shown = limit ? drops.slice(0, limit) : drops;
  if (shown.length === 0) {
    return <p className="text-muted">Past drops appear here once a drop has closed.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((drop) => (
        <li key={drop.dropId} className="card flex gap-4 p-4">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-line bg-bg">
            {drop.imageUrl ? (
              <img src={drop.imageUrl} alt="" loading="lazy" className="h-full w-full object-contain p-2" />
            ) : (
              <span className="font-display text-3xl text-muted/50">?</span>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <p className="font-semibold">{drop.productName}</p>
            <p className="text-xs text-muted">
              {CONDITION_LABEL[drop.condition]} · {formatDate(drop.releasedAt)}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="num font-semibold">{money(drop.salePaise)}</span>
              <Chip tone="muted">{drop.outcome === 'sold' ? 'Sold out' : 'Sale ended'}</Chip>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const STEPS = [
  { n: '01', title: 'Get alerts', body: 'Turn on browser alerts or email reminders. You opt in, and you can stop at any time.' },
  { n: '02', title: 'Catch the reveal', body: 'The product stays a mystery until the countdown reaches zero. Alerts land 30 seconds before release, when your device allows.' },
  { n: '03', title: 'Buy the drop', body: 'One unit, one buyer. Reserve it for two minutes, check the total, and pay. The unit is yours only once payment is confirmed.' },
];

export function HowItWorks() {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map((step) => (
        <li key={step.n} className="card p-6">
          <span className="num font-display text-5xl leading-none font-black text-lime">{step.n}</span>
          <h3 className="mt-4 text-3xl uppercase">{step.title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-muted">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** A compact invitation to alerts. It shows nothing about what comes next. */
export function MysteryStrip() {
  return (
    <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="strip-title">
      <div className="flex items-center gap-4">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-[16px] border border-line bg-bg font-display text-3xl font-black text-lime">
          ?
        </span>
        <div>
          <h2 id="strip-title" className="text-2xl uppercase">
            The next drop is a mystery
          </h2>
          <p className="text-sm text-muted">Get alerted 30 seconds before it releases.</p>
        </div>
      </div>
      <Link to="/alerts" className="btn-secondary w-full sm:w-auto">
        Get drop alerts
      </Link>
    </section>
  );
}
