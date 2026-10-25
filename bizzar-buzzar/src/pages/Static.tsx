import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PastDrop } from '../../shared/api-types.ts';
import { api } from '../lib/api.ts';
import { usePreviewScenario } from '../lib/useDrop.ts';
import { PREVIEW_NOTICE, SAMPLE_PAST_DROPS } from '../lib/preview.ts';
import { HowItWorks, PastDrops } from '../components/Showcase.tsx';
import { PreviewBanner } from '../components/Notice.tsx';

export function PastDropsPage() {
  const preview = usePreviewScenario();
  const [drops, setDrops] = useState<PastDrop[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (preview) {
      setDrops(SAMPLE_PAST_DROPS);
      setLoaded(true);
      return;
    }
    api<{ drops: PastDrop[] }>('/past-drops')
      .then((response) => setDrops(response.drops))
      .catch(() => setDrops([]))
      .finally(() => setLoaded(true));
  }, [preview]);

  return (
    <div className="shell py-10 md:py-14">
      {preview && <PreviewBanner />}
      <p className="eyebrow text-lime">Archive</p>
      <h1 className="mt-3 text-5xl uppercase sm:text-6xl">Past drops</h1>
      <p className="mt-3 max-w-xl text-muted">Drops that have sold out or closed. Buyers are not named.</p>
      <div className="mt-10">{loaded && <PastDrops drops={drops} />}</div>
      {preview && <p className="mt-10 text-xs text-muted">{PREVIEW_NOTICE}.</p>}
    </div>
  );
}

export function HowItWorksPage() {
  return (
    <div className="shell py-10 md:py-14">
      <p className="eyebrow text-lime">Guide</p>
      <h1 className="mt-3 text-5xl uppercase sm:text-6xl">How it works</h1>
      <p className="mt-3 max-w-xl text-muted">Big deals, small drops. One surprise at a time.</p>
      <div className="mt-10">
        <HowItWorks />
      </div>
      <p className="mt-10 text-sm text-muted">
        Ready? <Link to="/alerts" className="font-semibold text-text underline underline-offset-4">Get drop alerts</Link> and we will tell you before the next drop releases.
      </p>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="shell py-20 text-center">
      <p className="font-display text-8xl font-black text-lime">404</p>
      <h1 className="mt-4 text-4xl uppercase">Nothing here</h1>
      <Link to="/" className="btn-primary mt-8 inline-flex">
        Back to the live drop
      </Link>
    </div>
  );
}
