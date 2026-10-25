import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PREVIEW_SCENARIOS, previewAvailable, startPreviewScenario, type PreviewScenario } from '../lib/preview.ts';
import { usePreviewScenario } from '../lib/useDrop.ts';

/**
 * Preview controls for the concept states. They exist only in development builds, or in a
 * build that sets VITE_BB_PREVIEW=true. Production builds leave them out entirely.
 */
export function PreviewControls() {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const active = usePreviewScenario();
  const [open, setOpen] = useState(false);

  if (!previewAvailable()) return null;

  const choose = (scenario: PreviewScenario) => {
    startPreviewScenario(scenario);
    const params = new URLSearchParams(search);
    params.set('preview', scenario);
    navigate({ pathname: pathname === '/login' ? '/' : pathname, search: `?${params.toString()}` });
  };

  const exit = () => {
    const params = new URLSearchParams(search);
    params.delete('preview');
    const query = params.toString();
    navigate({ pathname, search: query ? `?${query}` : '' });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-50 min-h-11 rounded-full border border-amber/60 bg-elevated/95 px-4 text-xs font-semibold text-amber shadow-2xl backdrop-blur md:bottom-6"
      >
        Preview controls
      </button>
    );
  }

  return (
    <aside
      aria-label="Preview controls"
      className="fixed right-4 bottom-[calc(80px+env(safe-area-inset-bottom))] z-50 w-[min(320px,calc(100vw-2rem))] rounded-[20px] border border-amber/60 bg-elevated/95 p-3 text-sm shadow-2xl backdrop-blur md:bottom-6"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-amber">Preview controls</p>
        <div className="flex gap-1">
          {active && (
            <button type="button" onClick={exit} className="btn-ghost min-h-9 px-2 text-xs">
              Exit preview
            </button>
          )}
          <button type="button" onClick={() => setOpen((value) => !value)} className="btn-ghost min-h-9 px-2 text-xs" aria-expanded={open}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">Concept preview — sample products and prices. Not available in production.</p>
      {open && (
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {PREVIEW_SCENARIOS.map((scenario) => (
            <li key={scenario.id}>
              <button
                type="button"
                aria-pressed={active === scenario.id}
                title={scenario.hint}
                onClick={() => choose(scenario.id)}
                className={`min-h-11 w-full rounded-[12px] border px-3 text-left text-xs font-semibold ${
                  active === scenario.id ? 'border-lime bg-lime text-[#090b0a]' : 'border-line bg-bg text-text hover:border-muted'
                }`}
              >
                {scenario.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
