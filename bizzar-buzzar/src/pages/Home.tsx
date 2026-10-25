import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DropState, PastDrop } from '../../shared/api-types.ts';
import { api } from '../lib/api.ts';
import { PREVIEW_NOTICE, SAMPLE_PAST_DROPS } from '../lib/preview.ts';
import { useDropState } from '../lib/useDrop.ts';
import { FeaturedDrop, StickyPurchaseBar } from '../components/FeaturedDrop.tsx';
import { HowItWorks, MysteryStrip, PastDrops } from '../components/Showcase.tsx';
import { Notice, PreviewBanner } from '../components/Notice.tsx';

function eyebrow(state: DropState | null): string {
  if (!state) return 'Surprise drops · India · INR';
  if (state.phase === 'live') return 'Live now · one unit';
  if (state.phase === 'reveal') return 'Final 30 seconds';
  if (state.phase === 'paused') return 'Paused';
  return 'Surprise drops · India · INR';
}

export function Home() {
  const { state, error, preview } = useDropState();
  const [past, setPast] = useState<PastDrop[]>([]);

  useEffect(() => {
    if (preview) {
      setPast(SAMPLE_PAST_DROPS);
      return;
    }
    api<{ drops: PastDrop[] }>('/past-drops')
      .then((response) => setPast(response.drops))
      .catch(() => setPast([]));
  }, [preview]);

  const showStrip = state && (state.phase === 'live' || state.phase === 'sold' || state.phase === 'ended');

  return (
    <div className="shell pt-8 pb-6 md:pt-14">
      {preview && <PreviewBanner />}

      <section aria-labelledby="hero" className="flex flex-col gap-5">
        <p className="eyebrow text-lime">{eyebrow(state)}</p>
        <h1 id="hero" className="font-display text-[48px] leading-[0.86] font-black uppercase sm:text-[88px] lg:text-[120px]">
          Big deals.
          <br />
          <span className="text-lime">Small drops.</span>
        </h1>
        <p className={`max-w-xl text-lg text-muted ${state?.phase === 'reveal' ? 'hidden sm:block' : ''}`}>
          One surprise at a time. Get alerted 30 seconds before each drop.
        </p>
      </section>

      <div className="mt-10 md:mt-12">
        {error && !state && <Notice tone="error">{error}</Notice>}
        {!state && !error && <div className="card h-80 animate-pulse" aria-label="Loading the current drop" />}
        {state && <FeaturedDrop state={state} />}
      </div>

      {showStrip && (
        <div className="mt-8">
          <MysteryStrip />
        </div>
      )}

      {state && <StickyPurchaseBar state={state} />}

      <section aria-labelledby="past-title" className="mt-20">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="past-title" className="text-4xl uppercase sm:text-5xl">
            Past drops
          </h2>
          <Link to="/past-drops" className="text-sm font-medium text-muted underline underline-offset-4 hover:text-text">
            See all
          </Link>
        </div>
        <PastDrops drops={past} limit={3} />
      </section>

      <section aria-labelledby="how-title" className="mt-20">
        <h2 id="how-title" className="mb-6 text-4xl uppercase sm:text-5xl">
          How it works
        </h2>
        <HowItWorks />
      </section>

      {preview && (
        <p className="mt-12 text-xs text-muted">{PREVIEW_NOTICE}. Sample products are not for sale.</p>
      )}
    </div>
  );
}
