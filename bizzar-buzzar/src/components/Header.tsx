import { Link, NavLink } from 'react-router-dom';
import { useSession } from '../lib/auth.tsx';
import { Brand } from './Brand.tsx';

const NAV = [
  { to: '/', label: 'Live drop', end: true },
  { to: '/past-drops', label: 'Past drops', end: false },
  { to: '/how-it-works', label: 'How it works', end: false },
];

function Icon({ name }: { name: 'bell' | 'user' }) {
  const paths = {
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10.3 21a1.9 1.9 0 0 0 3.4 0',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  } as const;
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export function Header() {
  const { me } = useSession();
  const initials = (me?.profile.displayName ?? me?.profile.email ?? '?').trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-md">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Brand />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-[12px] px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-elevated text-text' : 'text-muted hover:text-text'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/alerts"
            aria-label="Drop alerts"
            className="relative grid size-11 place-items-center rounded-[12px] border border-line text-text hover:border-muted"
          >
            <Icon name="bell" />
          </Link>
          {me ? (
            <Link
              to="/account"
              aria-label={`Account for ${me.profile.email}`}
              className="grid size-11 place-items-center rounded-[12px] bg-elevated text-sm font-semibold text-text no-underline hover:border-muted"
            >
              {initials}
            </Link>
          ) : (
            <Link to="/login" className="btn-secondary min-h-11 px-4 text-sm">
              <Icon name="user" />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
