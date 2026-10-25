import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from '../lib/auth.tsx';
import { Brand } from '../components/Brand.tsx';
import { Notice } from '../components/Notice.tsx';
import { Link } from 'react-router-dom';
import { Overview } from './Overview.tsx';
import { Products } from './Products.tsx';
import { Schedule } from './Schedule.tsx';
import { Orders, OrderDetail } from './Orders.tsx';
import { Operations } from './Operations.tsx';

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/products', label: 'Products', end: false },
  { to: '/admin/schedule', label: 'Schedule', end: false },
  { to: '/admin/orders', label: 'Orders', end: false },
  { to: '/admin/operations', label: 'Operations', end: false },
];

/**
 * The admin shell. The check here is for usability only. Every admin endpoint enforces
 * the administrator flag on the server, so this guard cannot grant access by itself.
 */
export function AdminApp() {
  const { me, loading, signOut } = useSession();

  if (loading) return <div className="shell py-12"><div className="card h-64 animate-pulse" /></div>;

  if (!me) {
    return (
      <div className="shell flex flex-col gap-6 py-16">
        <Brand />
        <Notice>Sign in with an administrator account to open this area.</Notice>
        <Link to="/login?next=/admin" className="btn-primary self-start">
          Sign in
        </Link>
      </div>
    );
  }

  if (!me.profile.isAdmin) {
    return (
      <div className="shell flex flex-col gap-6 py-16">
        <Brand />
        <Notice tone="error">This area is for administrators only. Ask the owner if you need access.</Notice>
        <Link to="/" className="btn-secondary self-start">
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="border-b border-line bg-card md:min-h-dvh md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 p-4 md:flex-col md:items-start md:gap-8 md:p-6">
          <div className="flex flex-col gap-1">
            <Brand />
            <span className="pl-12 text-xs font-semibold tracking-[0.14em] text-amber uppercase">Admin</span>
          </div>
          <button type="button" className="btn-ghost min-h-10 text-xs md:self-start" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-4 pb-4 md:flex-col md:px-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `shrink-0 rounded-[12px] px-4 py-2.5 text-sm font-medium ${isActive ? 'bg-elevated text-text' : 'text-muted hover:text-text'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 p-4 sm:p-6 lg:p-8">
        <Routes>
          <Route path="/admin" element={<Overview />} />
          <Route path="/admin/products" element={<Products />} />
          <Route path="/admin/schedule" element={<Schedule />} />
          <Route path="/admin/orders" element={<Orders />} />
          <Route path="/admin/orders/:orderId" element={<OrderDetail />} />
          <Route path="/admin/operations" element={<Operations />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
