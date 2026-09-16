import { useEffect, useState } from 'react';
import { MethodSheet } from './components/MethodSheet';
import { SuccessScreen } from './components/SuccessScreen';
import { createOrder, openCheckout } from './payment';
import type { Bill, PaymentMethod } from './types';

/**
 * The reminder screen: a list of bills, each with a Pay now button.
 *
 * The flow is four states — list, sheet, Razorpay, success — and this component
 * just moves between them.
 */
export default function App() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [configured, setConfigured] = useState(true);
  const [selected, setSelected] = useState<Bill | null>(null);
  const [busy, setBusy] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ bill: Bill; paymentId: string } | null>(null);

  useEffect(() => {
    fetch('/api/bills')
      .then((r) => r.json())
      .then((d) => {
        setBills(d.bills);
        setConfigured(d.configured);
      })
      .catch(() => setError('Could not reach the payment server. Is it running?'));
  }, []);

  /** Step 1: the user picked a method in the sheet. */
  const handlePick = async (method: PaymentMethod) => {
    if (!selected) return;
    setBusy(method);
    setError(null);

    try {
      // Step 2: our server creates the order and decides the amount.
      const order = await createOrder(selected.id);

      // Step 3: hand off to Razorpay, opened on the chosen method.
      await openCheckout({
        order,
        method,
        // Step 4: fires only after our server verified the signature.
        onSuccess: (paymentId) => {
          setBusy(null);
          setSelected(null);
          setPaid({ bill: order.bill, paymentId });
        },
        onFailure: (message) => {
          setBusy(null);
          setError(message);
        },
        onDismiss: () => setBusy(null),
      });
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (paid) {
    return (
      <SuccessScreen
        billLabel={paid.bill.label}
        amount={paid.bill.amountInRupees}
        paymentId={paid.paymentId}
        onDone={() => setPaid(null)}
      />
    );
  }

  return (
    <div className="app">
      <header className="head">
        <p className="eyebrow">BillMate</p>
        <h1>Due this week</h1>
      </header>

      {!configured && (
        <p className="warn">
          No Razorpay keys found. Copy <code>.env.example</code> to <code>.env</code>,
          add your test keys, and restart the server.
        </p>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      <ul className="bills">
        {bills.map((bill) => (
          <li key={bill.id} className="bill">
            <div className="bill-info">
              <span className="bill-label">{bill.label}</span>
              <span className="bill-due">Due in 2 days</span>
            </div>
            <div className="bill-right">
              <span className="bill-amount">₹{bill.amountInRupees.toLocaleString('en-IN')}</span>
              <button
                className="primary small"
                onClick={() => {
                  setError(null);
                  setSelected(bill);
                }}
              >
                Pay now
              </button>
            </div>
          </li>
        ))}
      </ul>

      <MethodSheet
        open={selected !== null}
        billLabel={selected?.label ?? ''}
        amount={selected?.amountInRupees ?? 0}
        busy={busy}
        onPick={handlePick}
        onClose={() => {
          setSelected(null);
          setBusy(null);
        }}
      />
    </div>
  );
}
