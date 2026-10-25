import type { PublicPricing } from '../../shared/api-types.ts';
import { money } from '../lib/format.ts';

/**
 * The sale price leads. The reference price and savings appear only when stored evidence for
 * this product and condition exists. No evidence means no strike-through and no savings claim.
 */
export function PriceBlock({ pricing, size = 'lg' }: { pricing: PublicPricing; size?: 'lg' | 'md' }) {
  const hasEvidence = pricing.referencePaise !== null && pricing.savingsPaise !== null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`num font-bold tracking-tight text-text ${size === 'lg' ? 'text-5xl' : 'text-3xl'}`}>
          {money(pricing.salePaise)}
        </span>
        {hasEvidence && (
          <s className="num text-lg text-muted" aria-label={`Reference price ${money(pricing.referencePaise ?? 0)}`}>
            {money(pricing.referencePaise ?? 0)}
          </s>
        )}
      </div>
      {hasEvidence && pricing.savingsPaise !== null && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="chip border-lime/50 bg-lime/10 text-lime">
            Save {money(pricing.savingsPaise)} · {pricing.savingsPercent}%
          </span>
          <span className="text-muted">against a checked reference price</span>
        </p>
      )}
    </div>
  );
}
