import { money } from '../lib/format.ts';
import { Notice } from '../components/Notice.tsx';
import { Stat, useAsync } from './ui.tsx';

interface Summary {
  windowDays: number;
  visits: number;
  pushOptIns: number;
  emailOptIns: number;
  reservationsCreated: number;
  paidOrders: number;
  grossPaise: number;
  refundedPaise: number;
  netPaise: number;
  marginPaise: number;
  ordersWithCompleteCosts: number;
  ordersWithMissingCosts: number;
}

export function Overview() {
  const { data, error } = useAsync<Summary>('/admin/summary?days=30');
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!data) return <div className="card h-64 animate-pulse" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-amber">Admin</p>
        <h1 className="mt-2 text-5xl uppercase">Overview</h1>
        <p className="mt-2 text-sm text-muted">
          The last {data.windowDays} days. Every figure is counted from recorded rows. Nothing is estimated.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Visits" value={data.visits.toLocaleString('en-IN')} note="Page views per day. No visitor identifiers." />
        <Stat label="Browser opt-ins" value={data.pushOptIns.toLocaleString('en-IN')} note="Accounts with browser alerts on" />
        <Stat label="Email opt-ins" value={data.emailOptIns.toLocaleString('en-IN')} note="Accounts with session reminders" />
        <Stat label="Reservations" value={data.reservationsCreated.toLocaleString('en-IN')} note="Holds placed on units" />
        <Stat label="Paid orders" value={data.paidOrders.toLocaleString('en-IN')} />
        <Stat label="Gross" value={money(data.grossPaise)} note="Captured totals" />
        <Stat label="Refunded" value={money(data.refundedPaise)} />
        <Stat label="Net" value={money(data.netPaise)} note="Gross minus refunds" />
        <Stat
          label="Margin"
          value={money(data.marginPaise)}
          note={`From ${data.ordersWithCompleteCosts} order${data.ordersWithCompleteCosts === 1 ? '' : 's'} with every cost recorded`}
        />
        <Stat
          label="Missing costs"
          value={data.ordersWithMissingCosts.toLocaleString('en-IN')}
          note="Orders left out of margin. A missing cost is never counted as zero."
        />
      </div>
    </div>
  );
}
