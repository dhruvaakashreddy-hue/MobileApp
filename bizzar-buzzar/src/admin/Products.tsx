import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api.ts';
import { Notice } from '../components/Notice.tsx';
import { Button, Cell, Field, Flash, formData, inputClass, parseSpecs, rupeesToPaise, Section, Table, useAction, useAsync } from './ui.tsx';
import { istLocalToIso, money } from '../lib/format.ts';

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  condition: string;
  shipping_eligible: boolean;
  shipping_fee_paise: number;
  procurement_cost_paise: number | null;
  shipping_cost_paise: number | null;
  other_cost_paise: number | null;
  is_sample: boolean;
  drop_count: number;
  reference_count: number;
}

const COSTS = ['procurement_cost_paise', 'shipping_cost_paise', 'other_cost_paise'] as const;

export function Products() {
  const { data, error, reload } = useAsync<{ products: ProductRow[] }>('/admin/products');
  const create = useAction();
  const reference = useAction();
  const upload = useAction();
  const [selected, setSelected] = useState<string>('');
  const fileInput = useRef<HTMLInputElement>(null);

  const onCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void create.run(
      async () => {
        const body = {
          sku: form.sku,
          name: form.name,
          description: form.description ?? '',
          category: form.category,
          condition: form.condition,
          specs: parseSpecs(form.specs),
          warrantyText: form.warrantyText,
          returnPolicyText: form.returnPolicyText,
          shippingEligible: form.shippingEligible === 'on',
          shippingFeePaise: rupeesToPaise(form.shippingFee) ?? 0,
          procurementCostPaise: rupeesToPaise(form.procurementCost),
          shippingCostPaise: rupeesToPaise(form.shippingCost),
          otherCostPaise: rupeesToPaise(form.otherCost),
          isSample: form.isSample === 'on',
        };
        await api('/admin/products', { body });
        (event.target as HTMLFormElement).reset();
      },
      'Product saved.',
      reload,
    );
  };

  const onReference = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = formData(event);
    void reference.run(
      () =>
        api(`/admin/products/${form.productId}/price-references`, {
          body: {
            condition: form.condition,
            amountPaise: rupeesToPaise(form.amount),
            sourceLabel: form.sourceLabel,
            sourceUrl: form.sourceUrl || null,
            evidenceNote: form.evidenceNote,
            capturedAt: istLocalToIso(form.capturedAt),
          },
        }),
      'Reference price saved. It now shows on the product only if it matches the condition.',
      reload,
    );
  };

  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selected) return;
    void upload.run(
      async () => {
        // Raw image bytes, not JSON. The server accepts only the three image types, up to 2 MB.
        const response = await fetch(`/api/admin/products/${selected}/images`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          throw new ApiError(response.status, body?.error?.code ?? 'upload_failed', body?.error?.message ?? 'The image could not be uploaded.');
        }
      },
      'Image uploaded. It stays hidden until its drop releases.',
      reload,
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow text-amber">Catalogue</p>
        <h1 className="mt-2 text-5xl uppercase">Products</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every product carries its warranty and return terms. A cost left blank is shown as missing in margin, never as zero.
        </p>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      <Section title="Add a product">
        <form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU">
            <input name="sku" required className={inputClass} />
          </Field>
          <Field label="Name">
            <input name="name" required className={inputClass} />
          </Field>
          <Field label="Category">
            <input name="category" required className={inputClass} />
          </Field>
          <Field label="Condition">
            <select name="condition" className={inputClass} defaultValue="new">
              <option value="new">New, sealed</option>
              <option value="open_box">Open box</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <textarea name="description" rows={3} className="field py-3 text-sm" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Specifications" hint='One per line, as "Label: value".'>
              <textarea name="specs" rows={4} className="field py-3 text-sm" placeholder={'Type: Over-ear\nBattery: Up to 40 hours'} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Warranty" hint="Shown to buyers before payment.">
              <input name="warrantyText" required className={inputClass} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Return terms" hint="Shown to buyers before payment.">
              <input name="returnPolicyText" required className={inputClass} />
            </Field>
          </div>
          <Field label="Delivery fee (₹)" hint="Leave empty for free delivery.">
            <input name="shippingFee" inputMode="decimal" className={inputClass} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm">
            <input type="checkbox" name="shippingEligible" defaultChecked className="size-5 accent-[#d9ff43]" />
            Ships within India
          </label>
          <Field label="Procurement cost (₹)" hint="Needed for margin.">
            <input name="procurementCost" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Shipping cost (₹)" hint="Needed for margin.">
            <input name="shippingCost" inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Other cost (₹)" hint="Packaging, testing. Needed for margin.">
            <input name="otherCost" inputMode="decimal" className={inputClass} />
          </Field>
          <label className="flex min-h-11 items-center gap-3 self-end text-sm">
            <input type="checkbox" name="isSample" className="size-5 accent-[#d9ff43]" />
            Sample data (labelled as preview)
          </label>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <Button tone="primary" type="submit" busy={create.busy}>
              Save product
            </Button>
            <Flash message={create.message} />
          </div>
        </form>
      </Section>

      <Section title="Products">
        {data && data.products.length === 0 && <p className="text-sm text-muted">No products yet.</p>}
        {data && data.products.length > 0 && (
          <Table head={['Product', 'Condition', 'Delivery', 'Costs recorded', 'Drops', 'Evidence', 'Image']}>
            {data.products.map((product) => {
              const missing = COSTS.filter((key) => product[key] === null).length;
              return (
                <tr key={product.id}>
                  <Cell>
                    <span className="font-semibold">{product.name}</span>
                    <br />
                    <span className="text-xs text-muted">
                      {product.sku}
                      {product.is_sample ? ' · sample' : ''}
                    </span>
                  </Cell>
                  <Cell>{product.condition.replace('_', ' ')}</Cell>
                  <Cell className="num">{product.shipping_eligible ? (product.shipping_fee_paise === 0 ? 'Free' : money(product.shipping_fee_paise)) : 'Not shipped'}</Cell>
                  <Cell>
                    {missing === 0 ? (
                      <span className="text-lime">All 3</span>
                    ) : (
                      <span className="text-amber">{3 - missing} of 3, {missing} missing</span>
                    )}
                  </Cell>
                  <Cell className="num">{product.drop_count}</Cell>
                  <Cell className="num">{product.reference_count}</Cell>
                  <Cell>
                    <button
                      type="button"
                      className="btn-ghost min-h-9 px-2 text-xs"
                      onClick={() => {
                        setSelected(product.id);
                        fileInput.current?.click();
                      }}
                    >
                      Upload image
                    </button>
                  </Cell>
                </tr>
              );
            })}
          </Table>
        )}
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onUpload} aria-label="Product image file" />
        <Flash message={upload.message} />
      </Section>

      <Section title="Price evidence">
        <p className="text-sm text-muted">
          Reference prices appear to buyers only with a source and a note on how it was checked, and only against the same condition.
        </p>
        <form onSubmit={onReference} className="grid gap-4 sm:grid-cols-2">
          <Field label="Product">
            <select name="productId" className={inputClass} value={selected} onChange={(event) => setSelected(event.target.value)} required>
              <option value="">Choose a product</option>
              {data?.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Condition">
            <select name="condition" className={inputClass} defaultValue="new">
              <option value="new">New, sealed</option>
              <option value="open_box">Open box</option>
              <option value="refurbished">Refurbished</option>
            </select>
          </Field>
          <Field label="Reference price (₹)">
            <input name="amount" required inputMode="decimal" className={inputClass} />
          </Field>
          <Field label="Date checked (IST)">
            <input name="capturedAt" type="datetime-local" required className={inputClass} />
          </Field>
          <Field label="Source">
            <input name="sourceLabel" required className={inputClass} placeholder="Retailer name or listing" />
          </Field>
          <Field label="Source link (optional)">
            <input name="sourceUrl" type="url" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Evidence note" hint="How you checked it, and what you compared it with.">
              <textarea name="evidenceNote" required rows={2} className="field py-3 text-sm" />
            </Field>
          </div>
          <div className="sm:col-span-2 flex flex-wrap items-center gap-4">
            <Button tone="primary" type="submit" busy={reference.busy}>
              Save reference price
            </Button>
            <Flash message={reference.message} />
          </div>
        </form>
      </Section>
    </div>
  );
}
