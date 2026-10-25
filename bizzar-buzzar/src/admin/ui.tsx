import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, messageFor } from '../lib/api.ts';
import { Notice } from '../components/Notice.tsx';

/** Loads a GET endpoint and returns a reload function. Errors are shown as plain messages. */
export function useAsync<T>(path: string | null): { data: T | null; error: string | null; reload: () => Promise<void> } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!path) return;
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [path]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, reload };
}

/** Runs a mutation, reports its outcome, and reloads the affected data. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, success: string, after?: () => Promise<void> | void) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'success', text: success });
      await after?.();
    } catch (caught) {
      setMessage({ tone: 'error', text: messageFor(caught) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, run, setMessage };
}

export function formData(event: FormEvent<HTMLFormElement>): Record<string, string> {
  const values: Record<string, string> = {};
  new FormData(event.currentTarget).forEach((value, key) => {
    if (typeof value === 'string') values[key] = value;
  });
  return values;
}

export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl uppercase">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-2 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <span className="eyebrow">{label}</span>
      <span className="num font-display text-5xl leading-none font-black text-text">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs tracking-wide text-muted uppercase">
            {head.map((h) => (
              <th key={h} scope="col" className="px-2 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-2 py-3 align-top ${className}`}>{children}</td>;
}

export function Button({
  children,
  busy,
  tone = 'secondary',
  onClick,
  type = 'button',
}: {
  children: ReactNode;
  busy?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
  onClick?: () => void;
  type?: 'button' | 'submit';
}) {
  const cls = tone === 'primary' ? 'btn-primary' : tone === 'danger' ? 'btn-secondary text-danger' : 'btn-secondary';
  return (
    <button type={type} onClick={onClick} disabled={busy} className={`${cls} min-h-10 px-4 text-sm`}>
      {busy ? 'Working…' : children}
    </button>
  );
}

export function Flash({ message }: { message: { tone: 'success' | 'error'; text: string } | null }) {
  if (!message) return null;
  return <Notice tone={message.tone === 'error' ? 'error' : 'success'}>{message.text}</Notice>;
}

export const inputClass = 'field min-h-11 text-sm';

export function rupeesToPaise(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const trimmed = value.trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(trimmed)) throw new Error(`"${value}" is not an amount in rupees.`);
  const [whole, fraction = ''] = trimmed.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Converts "label: value" lines from a textarea into spec entries. */
export function parseSpecs(text: string | undefined): { label: string; value: string }[] {
  return (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':');
      if (index < 1) throw new Error(`Write each spec as "Label: value". Check "${line}".`);
      return { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
    })
    .slice(0, 20);
}
