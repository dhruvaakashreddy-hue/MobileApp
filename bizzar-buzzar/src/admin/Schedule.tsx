import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { formatClock, formatDate, istLocalToIso, money } from '../lib/format.ts';
import { Chip } from '../components/StatusChip.tsx';
import { Notice } from '../components/Notice.tsx';
import { Button, Cell, Field, Flash, formData, inputClass, rupeesToPaise, Section, Table, useAction, useAsync } from './ui.tsx';

interface SessionRow {
  id: string;
  name: string;
  status: string;
  window_opens_at: string;
  window_closes_at: string;
  drop_count: number;
}

interface DropRow {
  id: string;
  position: number;
  status: string;
  sale_price_paise: number;
  quantity: number;
  release_at: string | null;
  closes_at: string | null;
  product_id: string;
  product_name: string;
  condition: string;
}

interface SessionDetail {
  session: SessionRow;
  drops: DropRow[];
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
}

interface InspectView {
  drop: Record<string, unknown>;
  reservations: { status: string; count: number }[];
  orders: { id: string; order_no: number; payment_status: string; total_paise: number }[];
  jobs: { kind: string; status: string; attempts: number; sent_count: number; failed_count: number; last_error: string | null }[];
  history: { action: string; actor_kind: string; created_at: string }[];
}

const STATUS_TONE: Record<string, 'lime' | 'amber' | 'muted' | 'danger'> = {
  scheduled: 'lime',
  paused: 'amber',
  cancelled: 'danger',
  draft: 'muted',
};

function windowLabel(opens: string, closes: string): string {
  return `${formatDate(opens)}, ${formatClock(opens)} – ${formatClock(closes)} IST`;
}

export function Schedule() {
  const sessions = useAsync<{ sessions: SessionRow[] }>('/admin/sessions');
  const products = useAsync<{ products: ProductOption[] }>('/admin/products');
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useAsync<SessionDetail>(openId ? `/admin/sessions/${openId}` : null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const inspect = useAsync<InspectView>(inspectId ? `/admin/drops/${inspectId}` : null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const createSessionAction = useAction();
  const sessionAction = useAction();
  const dropAction = useAction();
  const addDrop = useAction();

  const reloadAll = async () => {
    await sessions.reload();
    await detail.reload();
  };

  const onCreateSession = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void createSessionAction.run(
      () =>
        api('/admin/sessions', {
          body: { name: form.name, opensAt: istLocalToIso(form.opensAt), closesAt: istLocalToIso(form.closesAt) },
        }),
      'Session created as a draft. Publish it when its drops are ready.',
      () => sessions.reload(),
    );
    (event.target as HTMLFormElement).reset();
  };

  const onAddDrop = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!openId) return;
    const form = formData(event);
    void addDrop.run(
      () =>
        api(`/admin/sessions/${openId}/drops`, {
          body: {
            productId: form.productId,
            salePaise: rupeesToPaise(form.sale),
            quantity: Number(form.quantity || 1),
            position: Number(form.position),
            releaseAt: form.releaseAt ? istLocalToIso(form.releaseAt) : null,
            closesAt: form.closesAt ? istLocalToIso(form.closesAt) : null,
          },
        }),
      'Drop added as a draft. Schedule it once the times are right.',
      reloadAll,
    );
  };

  const dropCommand = (dropId: string, action: 'schedule' | 'pause' | 'resume', success: string) =>
    void dropAction.run(() => api(`/admin/drops/${dropId}/${action}`, { body: {} }), success, reloadAll);

  const onCancel = (event: FormEvent<HTMLFormElement>, dropId: string) => {
    event.preventDefault();
    const form = formData(event);
    void dropAction.run(
      () => api(`/admin/drops/${dropId}/cancel`, { body: { reason: form.reason, paidOrdersAction: form.paidOrdersAction } }),
      'Drop cancelled. Holds were released, and paid orders followed your choice.',
      async () => {
        setCancelId(null);
        await reloadAll();
      },
    );
  };

  const drops = detail.data?.drops ?? [];
  const sorted = [...drops].filter((d) => d.release_at).sort((a, b) => Date.parse(a.release_at!) - Date.parse(b.release_at!));
  const gapById = new Map<string, number>();
  sorted.forEach((drop, index) => {
    if (index > 0) gapById.set(drop.id, Math.round((Date.parse(drop.release_at!) - Date.parse(sorted[index - 1].release_at!)) / 60_000));
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-amber">Drops</p>
        <h1 className="mt-2 text-5xl uppercase">Schedule</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Releases inside a session must be 5 to 30 minutes apart, and no sale may run into the next drop. Times are IST. The server checks every rule again on save.
        </p>
      </div>

      <Section title="Sessions">
        {sessions.error && <Notice tone="error">{sessions.error}</Notice>}
        {sessions.data && (
          <Table head={['Session', 'Window (IST)', 'Status', 'Drops', 'Actions']}>
            {sessions.data.sessions.map((session) => (
              <tr key={session.id} className={openId === session.id ? 'bg-elevated/50' : ''}>
                <Cell className="font-semibold">{session.name}</Cell>
                <Cell>{windowLabel(session.window_opens_at, session.window_closes_at)}</Cell>
                <Cell>
                  <Chip tone={STATUS_TONE[session.status] ?? 'muted'}>{session.status}</Chip>
                </Cell>
                <Cell className="num">{session.drop_count}</Cell>
                <Cell>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost min-h-9 px-2 text-xs" aria-pressed={openId === session.id} onClick={() => setOpenId(session.id)}>
                      Open
                    </button>
                    {session.status === 'draft' && (
                      <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => void sessionAction.run(() => api(`/admin/sessions/${session.id}/publish`, { body: {} }), 'Session published.', () => sessions.reload())}>
                        Publish
                      </button>
                    )}
                    {session.status === 'scheduled' && (
                      <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => void sessionAction.run(() => api(`/admin/sessions/${session.id}/pause`, { body: {} }), 'Session paused. Every drop in it is paused too.', () => sessions.reload())}>
                        Pause session
                      </button>
                    )}
                    {session.status === 'paused' && (
                      <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => void sessionAction.run(() => api(`/admin/sessions/${session.id}/resume`, { body: {} }), 'Session resumed.', () => sessions.reload())}>
                        Resume session
                      </button>
                    )}
                  </div>
                </Cell>
              </tr>
            ))}
          </Table>
        )}
        <Flash message={sessionAction.message} />

        <form onSubmit={onCreateSession} className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <Field label="New session name">
              <input name="name" required className={inputClass} placeholder="Evening Drop" />
            </Field>
          </div>
          <Field label="Window opens (IST)">
            <input name="opensAt" type="datetime-local" required className={inputClass} />
          </Field>
          <Field label="Window closes (IST)">
            <input name="closesAt" type="datetime-local" required className={inputClass} />
          </Field>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4 lg:col-span-4">
            <Button tone="primary" type="submit" busy={createSessionAction.busy}>
              Create session
            </Button>
            <Flash message={createSessionAction.message} />
          </div>
        </form>
      </Section>

      {openId && detail.data && (
        <Section title={`Drops in ${detail.data.session.name}`}>
          {dropAction.message && <Flash message={dropAction.message} />}
          {drops.length === 0 && <p className="text-sm text-muted">No drops yet. Add the first one below.</p>}
          {drops.length > 0 && (
            <Table head={['#', 'Product', 'Sale', 'Release → close (IST)', 'Gap', 'Status', 'Actions']}>
              {drops.map((drop) => (
                <tr key={drop.id}>
                  <Cell className="num">{drop.position}</Cell>
                  <Cell>
                    <span className="font-semibold">{drop.product_name}</span>
                    <br />
                    <span className="text-xs text-muted">
                      {drop.condition.replace('_', ' ')} · {drop.quantity} unit{drop.quantity === 1 ? '' : 's'}
                    </span>
                  </Cell>
                  <Cell className="num">{money(drop.sale_price_paise)}</Cell>
                  <Cell>
                    {drop.release_at ? `${formatClock(drop.release_at)} → ${drop.closes_at ? formatClock(drop.closes_at) : '—'}` : <span className="text-muted">Not set</span>}
                  </Cell>
                  <Cell className="num">{gapById.has(drop.id) ? `${gapById.get(drop.id)} min` : '—'}</Cell>
                  <Cell>
                    <Chip tone={STATUS_TONE[drop.status] ?? 'muted'}>{drop.status}</Chip>
                  </Cell>
                  <Cell>
                    <div className="flex flex-col items-start gap-2">
                      <div className="flex flex-wrap gap-2">
                        {drop.status === 'draft' && (
                          <button type="button" className="btn-ghost min-h-9 px-2 text-xs text-lime" onClick={() => dropCommand(drop.id, 'schedule', 'Drop scheduled. Its alert is queued for 30 seconds before release.')}>
                            Schedule
                          </button>
                        )}
                        {drop.status === 'scheduled' && (
                          <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => dropCommand(drop.id, 'pause', 'Drop paused. New holds stop; existing holds run to their end.')}>
                            Pause
                          </button>
                        )}
                        {drop.status === 'paused' && (
                          <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => dropCommand(drop.id, 'resume', 'Drop resumed.')}>
                            Resume
                          </button>
                        )}
                        <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => setInspectId(drop.id)}>
                          Inspect
                        </button>
                        {['scheduled', 'paused'].includes(drop.status) && (
                          <button type="button" className="btn-ghost min-h-9 px-2 text-xs text-danger" onClick={() => setCancelId(cancelId === drop.id ? null : drop.id)}>
                            Cancel
                          </button>
                        )}
                      </div>
                      {cancelId === drop.id && (
                        <form onSubmit={(event) => onCancel(event, drop.id)} className="flex w-full min-w-64 flex-col gap-2 rounded-[12px] border border-danger/50 p-3">
                          <input name="reason" required className={inputClass} placeholder="Reason, shown in the audit log" />
                          <select name="paidOrdersAction" className={inputClass} defaultValue="refund" aria-label="What to do with paid orders">
                            <option value="refund">Refund every paid order</option>
                            <option value="keep">Keep paid orders and fulfil them</option>
                          </select>
                          <Button tone="danger" type="submit" busy={dropAction.busy}>
                            Confirm cancellation
                          </Button>
                        </form>
                      )}
                    </div>
                  </Cell>
                </tr>
              ))}
            </Table>
          )}

          {inspect.data && inspectId && (
            <div className="rounded-[16px] border border-line bg-bg p-5 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Inspection</p>
                <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => setInspectId(null)}>
                  Close
                </button>
              </div>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-muted">Holds and orders</p>
                  <ul className="mt-2 space-y-1">
                    {inspect.data.reservations.length === 0 && <li className="text-muted">No holds yet</li>}
                    {inspect.data.reservations.map((row) => (
                      <li key={row.status}>
                        {row.status}: <span className="num">{row.count}</span>
                      </li>
                    ))}
                    {inspect.data.orders.map((order) => (
                      <li key={order.id}>
                        Order #{order.order_no}: {order.payment_status.replace('_', ' ')}, {money(order.total_paise)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted">Alert jobs</p>
                  <ul className="mt-2 space-y-1">
                    {inspect.data.jobs.length === 0 && <li className="text-muted">None queued</li>}
                    {inspect.data.jobs.map((job) => (
                      <li key={job.kind}>
                        {job.kind.replace(/_/g, ' ')}: {job.status}, sent {job.sent_count}, failed {job.failed_count}
                        {job.last_error ? ` (${job.last_error})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <p className="mt-4 text-muted">Recent history</p>
              <ul className="mt-2 space-y-1 text-xs">
                {inspect.data.history.map((entry, index) => (
                  <li key={`${entry.action}-${index}`}>
                    {entry.action} by {entry.actor_kind}, {formatClock(entry.created_at)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inspect.error && <Notice tone="error">{inspect.error}</Notice>}

          <form onSubmit={onAddDrop} className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <h3 className="text-2xl uppercase sm:col-span-2 lg:col-span-3">Add a drop</h3>
            <Field label="Product">
              <select name="productId" required className={inputClass} defaultValue="">
                <option value="" disabled>
                  Choose a product
                </option>
                {products.data?.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.sku})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sale price (₹)">
              <input name="sale" required inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Units" hint="Default 1. Higher numbers are for future experiments.">
              <input name="quantity" type="number" min={1} max={100} defaultValue={1} className={inputClass} />
            </Field>
            <Field label="Position in session">
              <input name="position" type="number" min={1} required className={inputClass} />
            </Field>
            <Field label="Release (IST)">
              <input name="releaseAt" type="datetime-local" className={inputClass} />
            </Field>
            <Field label="Sale closes (IST)">
              <input name="closesAt" type="datetime-local" className={inputClass} />
            </Field>
            <div className="sm:col-span-2 flex flex-wrap items-center gap-4 lg:col-span-3">
              <Button tone="primary" type="submit" busy={addDrop.busy}>
                Add drop
              </Button>
              <Flash message={addDrop.message} />
            </div>
          </form>
          {detail.data && <p className="text-xs text-muted">Session window: {windowLabel(detail.data.session.window_opens_at, detail.data.session.window_closes_at)}.</p>}
        </Section>
      )}
      {openId && detail.error && <Notice tone="error">{detail.error}</Notice>}
    </div>
  );
}
