import { Link } from 'react-router-dom';
import { LEGAL_COPY_IS_DRAFT } from '../lib/legal.ts';
import { Brand } from './Brand.tsx';

const LINKS = [
  { to: '/contact', label: 'Contact' },
  { to: '/shipping', label: 'Shipping' },
  { to: '/returns', label: 'Returns' },
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
];

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line pb-24 md:pb-10">
      <div className="shell flex flex-col gap-8 py-10 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-sm flex-col gap-4">
          <Brand />
          <p className="text-sm text-muted">Surprise drops at unusually low prices. Ships within India, in INR.</p>
          {LEGAL_COPY_IS_DRAFT && (
            <p className="text-xs text-amber">Policy pages are drafts until the owner completes them.</p>
          )}
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-10 gap-y-3 text-sm sm:grid-cols-3">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="text-muted no-underline hover:text-text">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
