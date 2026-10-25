import { NavLink } from 'react-router-dom';

const ITEMS = [
  { to: '/', label: 'Drop', end: true, glyph: 'M4 12 12 4l8 8M6 10v10h12V10' },
  { to: '/alerts', label: 'Alerts', end: false, glyph: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8' },
  { to: '/orders', label: 'Orders', end: false, glyph: 'M4 7h16v13H4zM4 7l2-3h12l2 3M9 11h6' },
  { to: '/account', label: 'Account', end: false, glyph: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0' },
];

/** Mobile bottom navigation. Padded for the home indicator on notched phones. */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto grid max-w-[640px] grid-cols-4">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-xs font-medium ${isActive ? 'text-lime' : 'text-muted'}`
              }
            >
              <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={item.glyph} />
              </svg>
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
