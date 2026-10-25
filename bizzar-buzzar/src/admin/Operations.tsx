import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { formatDateTime, money } from '../lib/format.ts';
import { Chip } from '../components/StatusChip.tsx';
import { Button, Cell, Flash, formData, inputClass, Section, Table, useAction, useAsync } from './ui.tsx';

interface JobRow {
  id: string;
  kind: string;
  status: string;
  run_at: string;
  deadline_at: string;
  attempts: number;
  max_attempts: number;
  sent_count: number;
  failed_count: number;
  last_error: string | null;
  drop_session: string | null;
}

interface CaseRow {
  id: string;
  kind: string;
  status: string;
  order_id: string | null;
  provider_payment_id: string | null;
  amount_paise: number | null;
  details: Record<string, unknown>;
  resolution_note: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  actor_kind: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

const JOB_TONE: Record<string, 'lime' | 'amber' | 'danger' | 'muted'> = {
  sent: 'lime',
  queued: 'amber',
  running: 'amber',
  failed: 'danger',
  expired: 'muted',
  cancelled: 'muted',
};

/** Jobs, reconciliation cases and the audit trail. Failures are visible here, not hidden in logs. */
export function Operations() {
  const jobs = useAsync<{ jobs: JobRow[] }>('/admin/jobs');
  const cases = useAsync<{ cases: CaseRow[] }>('/admin/cases');
  const audit = useAsync<{ entries: AuditRow[] }>('/admin/audit');
  const retry = useAction();
  const resolve = useAction();
  const [resolving, setResolving] = useState<string | null>(null);

  const onResolve = (event: FormEvent<HTMLFormElement>, caseId: string) => {
    event.preventDefault();
    const form = formData(event);
    void resolve.run(
      () => api(`/admin/cases/${caseId}/resolve`, { body: { note: form.note } }),
      'Case resolved and recorded in the audit log.',
      async () => {
        setResolving(null);
        await cases.reload();
      },
    );
  };

  const openCases = cases.data?.cases.filter((c) => c.status === 'open').length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-amber">Operations</p>
        <h1 className="mt-2 text-5xl uppercase">Operations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Alert delivery, payment cases and every change made in this area. Outcomes are counts only, with no subscriber details.
        </p>
      </div>

      <Section title={`Reconciliation cases${openCases ? ` (${openCases} open)` : ''}`}>
        {cases.error && <p className="text-sm text-danger">{cases.error}</p>}
        {cases.data && cases.data.cases.length === 0 && <p className="text-sm text-muted">Nothing needs reconciling.</p>}
        {cases.data && cases.data.cases.length > 0 && (
          <Table head={['Opened', 'Kind', 'Amount', 'Details', 'Status', 'Action']}>
            {cases.data.cases.map((item) => (
              <tr key={item.id}>
                <Cell className="text-muted">{formatDateTime(item.created_at)}</Cell>
                <Cell className="font-semibold">{item.kind.replace(/_/g, ' ')}</Cell>
                <Cell className="num">{item.amount_paise === null ? '—' : money(item.amount_paise)}</Cell>
                <Cell className="max-w-xs text-xs text-muted break-words">
                  {JSON.stringify(item.details)}
                  {item.resolution_note && <span className="block text-text">Resolved: {item.resolution_note}</span>}
                </Cell>
                <Cell>
                  <Chip tone={item.status === 'open' ? 'amber' : 'muted'}>{item.status}</Chip>
                </Cell>
                <Cell>
                  {item.status === 'open' && (
                    <button type="button" className="btn-ghost min-h-9 px-2 text-xs" onClick={() => setResolving(resolving === item.id ? null : item.id)}>
                      Resolve
                    </button>
                  )}
                  {resolving === item.id && (
                    <form onSubmit={(event) => onResolve(event, item.id)} className="mt-2 flex w-56 flex-col gap-2">
                      <input name="note" required className={inputClass} placeholder="What you checked and did" />
                      <Button type="submit" busy={resolve.busy}>
                        Mark resolved
                      </Button>
                    </form>
                  )}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
        <Flash message={resolve.message} />
      </Section>

      <Section title="Alert jobs">
        <p className="text-sm text-muted">
          An alert that reaches its deadline (release time) expires rather than arriving late. Retry works only while the deadline is still ahead.
        </p>
        {jobs.error && <p className="text-sm text-danger">{jobs.error}</p>}
        {jobs.data && jobs.data.jobs.length === 0 && <p className="text-sm text-muted">No alert jobs yet.</p>}
        {jobs.data && jobs.data.jobs.length > 0 && (
          <Table head={['Job', 'Session', 'Runs at', 'Deadline', 'Status', 'Sent / failed', 'Last error', '']}>
            {jobs.data.jobs.map((job) => (
              <tr key={job.id}>
                <Cell>{job.kind.replace(/_/g, ' ')}</Cell>
                <Cell>{job.drop_session ?? '—'}</Cell>
                <Cell className="text-muted">{formatDateTime(job.run_at)}</Cell>
                <Cell className="text-muted">{formatDateTime(job.deadline_at)}</Cell>
                <Cell>
                  <Chip tone={JOB_TONE[job.status] ?? 'muted'}>{job.status}</Chip>
                  <span className="block text-xs text-muted">
                    attempt {job.attempts} of {job.max_attempts}
                  </span>
                </Cell>
                <Cell className="num">
                  {job.sent_count} / {job.failed_count}
                </Cell>
                <Cell className="text-xs text-muted">{job.last_error ?? '—'}</Cell>
                <Cell>
                  {(job.status === 'failed' || job.status === 'expired') && (
                    <button
                      type="button"
                      className="btn-ghost min-h-9 px-2 text-xs"
                      onClick={() => void retry.run(() => api(`/admin/jobs/${job.id}/retry`, { body: {} }), 'Job re-queued.', () => jobs.reload())}
                    >
                      Retry
                    </button>
                  )}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
        <Flash message={retry.message} />
      </Section>

      <Section title="Audit trail">
        {audit.data && audit.data.entries.length === 0 && <p className="text-sm text-muted">No changes recorded yet.</p>}
        {audit.data && audit.data.entries.length > 0 && (
          <Table head={['When', 'Who', 'Action', 'Record']}>
            {audit.data.entries.map((entry) => (
              <tr key={entry.id}>
                <Cell className="text-muted">{formatDateTime(entry.created_at)}</Cell>
                <Cell>{entry.actor_kind}</Cell>
                <Cell className="font-semibold">{entry.action}</Cell>
                <Cell className="text-xs text-muted">
                  {entry.entity_type} {entry.entity_id.slice(0, 8)}
                </Cell>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
