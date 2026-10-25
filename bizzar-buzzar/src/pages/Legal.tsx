import { LEGAL_COPY_IS_DRAFT } from '../lib/legal.ts';
import { Notice } from '../components/Notice.tsx';

interface LegalPage {
  path: '/contact' | '/shipping' | '/returns' | '/terms' | '/privacy';
  title: string;
  intro: string;
  sections: { heading: string; body: string[] }[];
}

/**
 * Draft policy copy. Every bracketed item is a fact only the owner can supply, such as a legal
 * name, a registered address or a grievance contact. Nothing here is a statement of policy
 * until the owner has completed and approved it.
 */
export const LEGAL_PAGES: LegalPage[] = [
  {
    path: '/contact',
    title: 'Contact',
    intro: 'Questions about an order, a drop or your alerts.',
    sections: [
      { heading: 'Email', body: ['[Owner to add: support email address]', 'We reply on business days, India time.'] },
      { heading: 'Business details', body: ['[Owner to add: registered business name and address]', '[Owner to add: GSTIN, if registered]'] },
    ],
  },
  {
    path: '/shipping',
    title: 'Shipping',
    intro: 'We deliver to addresses within India, in Indian rupees.',
    sections: [
      { heading: 'Where we deliver', body: ['India only, at launch. Each product page says whether it can ship to you before you pay.'] },
      { heading: 'Delivery fees', body: ['Each product shows its delivery fee before you reserve it. Your total is shown again before payment.'] },
      { heading: 'Dispatch and tracking', body: ['[Owner to add: typical dispatch time and courier partners]', 'We add a tracking number to your order once it ships.'] },
    ],
  },
  {
    path: '/returns',
    title: 'Returns',
    intro: 'What you can return, and how.',
    sections: [
      { heading: 'Return window', body: ['[Owner to confirm: return window per product, shown on each product page]'] },
      { heading: 'Eligible items', body: ['[Owner to confirm: conditions for returns, including open-box and refurbished items]'] },
      { heading: 'Refunds', body: ['[Owner to confirm: refund timelines and method]', 'Refunds go back to your original payment method through the payment provider.'] },
    ],
  },
  {
    path: '/terms',
    title: 'Terms',
    intro: 'The rules for buying a drop.',
    sections: [
      { heading: 'One unit, one buyer', body: ['Each drop has one unit by default. A reservation holds it for two minutes. Payment confirmed by the provider completes the purchase.'] },
      { heading: 'Prices', body: ['Prices are in Indian rupees and shown before you reserve. Reference prices appear only with stored evidence.'] },
      { heading: 'Cancelled and interrupted drops', body: ['If a drop is cancelled or a payment is interrupted, we refund in full and tell you.'] },
      { heading: 'Full terms', body: ['[Owner to add: complete terms of sale, governing law and dispute process]'] },
    ],
  },
  {
    path: '/privacy',
    title: 'Privacy',
    intro: 'What we collect and why.',
    sections: [
      { heading: 'What we store', body: ['Your email address, the name and delivery addresses you give us, your orders, and your alert settings.', 'We do not store card numbers. Payments are taken by the payment provider.'] },
      { heading: 'Alerts', body: ['Browser alerts and email reminders are optional. You can turn them off, or unsubscribe from everything, at any time.'] },
      { heading: 'Analytics', body: ['We count page views per day without storing visitor identifiers or IP addresses.'] },
      { heading: 'Your rights', body: ['[Owner to add: contact for access and deletion requests, and the data retention period]'] },
    ],
  },
];

export function Legal({ page }: { page: LegalPage['path'] }) {
  const content = LEGAL_PAGES.find((entry) => entry.path === page);
  if (!content) return null;
  return (
    <div className="shell py-10 md:py-14">
      <article className="mx-auto flex max-w-2xl flex-col gap-8">
        <div>
          <p className="eyebrow text-lime">Bizzar Buzzar</p>
          <h1 className="mt-3 text-5xl uppercase sm:text-6xl">{content.title}</h1>
          <p className="mt-3 text-lg text-muted">{content.intro}</p>
        </div>
        {LEGAL_COPY_IS_DRAFT && (
          <Notice tone="warn">
            Draft. This page is not final policy. The owner must complete the bracketed items and approve the text before production use.
          </Notice>
        )}
        {content.sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-3">
            <h2 className="text-2xl uppercase">{section.heading}</h2>
            {section.body.map((paragraph) => (
              <p key={paragraph} className={`leading-relaxed ${paragraph.startsWith('[') ? 'text-amber' : 'text-muted'}`}>
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </article>
    </div>
  );
}
