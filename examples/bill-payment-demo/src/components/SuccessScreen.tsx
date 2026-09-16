/**
 * Shown only after the SERVER has verified the signature — never straight from
 * Checkout's callback. That distinction is the whole point of the verify step.
 */
export function SuccessScreen({
  billLabel,
  amount,
  paymentId,
  onDone,
}: {
  billLabel: string;
  amount: number;
  paymentId: string;
  onDone: () => void;
}) {
  return (
    <div className="success">
      <div className="success-tick" aria-hidden>✓</div>
      <h1 className="success-title">Payment successful</h1>
      <p className="success-sub">
        {billLabel} is paid. A receipt is on its way.
      </p>

      <dl className="receipt">
        <div><dt>Amount paid</dt><dd>₹{amount.toLocaleString('en-IN')}</dd></div>
        <div><dt>Payment ID</dt><dd className="mono">{paymentId}</dd></div>
        <div><dt>Status</dt><dd className="ok">Verified by server</dd></div>
      </dl>

      <button className="primary" onClick={onDone}>Back to reminders</button>
    </div>
  );
}
