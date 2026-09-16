import type { PaymentMethod } from '../types';

/**
 * The UPI / Cards / Wallet sheet.
 *
 * This is your own UI, so it can look like the rest of your app. Picking one
 * does not charge anything — it decides which method Razorpay Checkout opens
 * on in the next step.
 */

const METHODS: { id: PaymentMethod; icon: string; label: string; hint: string }[] = [
  { id: 'upi', icon: '📲', label: 'UPI', hint: 'GPay, PhonePe, Paytm, any UPI app' },
  { id: 'card', icon: '💳', label: 'Card', hint: 'Debit or credit card' },
  { id: 'wallet', icon: '👛', label: 'Wallet', hint: 'Paytm, Mobikwik, Freecharge' },
];

export function MethodSheet({
  open,
  amount,
  billLabel,
  busy,
  onPick,
  onClose,
}: {
  open: boolean;
  amount: number;
  billLabel: string;
  busy: PaymentMethod | null;
  onPick: (method: PaymentMethod) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Choose a payment method">
      <button className="sheet-scrim" aria-label="Close" onClick={onClose} />
      <div className="sheet">
        <span className="sheet-grabber" aria-hidden />
        <h2 className="sheet-title">How would you like to pay?</h2>
        <p className="sheet-sub">
          {billLabel} · <strong>₹{amount.toLocaleString('en-IN')}</strong>
        </p>

        <div className="method-list">
          {METHODS.map((m) => (
            <button
              key={m.id}
              className="method"
              disabled={busy !== null}
              onClick={() => onPick(m.id)}
            >
              <span className="method-icon" aria-hidden>{m.icon}</span>
              <span className="method-text">
                <span className="method-label">{m.label}</span>
                <span className="method-hint">{m.hint}</span>
              </span>
              <span className="method-arrow" aria-hidden>
                {busy === m.id ? '…' : '›'}
              </span>
            </button>
          ))}
        </div>

        <button className="sheet-cancel" onClick={onClose} disabled={busy !== null}>
          Cancel
        </button>
      </div>
    </div>
  );
}
