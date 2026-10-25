import type { Deps } from './deps.ts';
import { AppError, fail } from './errors.ts';
import { constantTimeEqual } from './crypto.ts';
import { clientKey, json, rateLimit, readJson, sessionCookie, clearSessionCookie, cookieValue, SESSION_COOKIE } from './http.ts';
import { optionalInstant, optionalInt, optionalString, requireBool, requireEnum, requireInstant, requireInt, requireString, requireUuid } from './validate.ts';
import { requestLoginCode, revokeSession, verifyLoginCode, type SignedInProfile } from './services/auth.ts';
import { getDropState, listPastDrops, publicConfig, verifyMediaSignature, recordVisitDay } from './services/catalogue.ts';
import { createReservation, getReservation, releaseReservation } from './services/reservations.ts';
import { createPaymentOrder, handleRazorpayWebhook, requestOrderRefund, verifyCheckoutCallback } from './services/payments.ts';
import { dispatchDueJobs, retryJob, sweep } from './services/jobs.ts';
import {
  deleteAddress,
  getMe,
  getMyOrder,
  listAddresses,
  listMyOrders,
  registerPushSubscription,
  saveAddress,
  setAlertPreferences,
  unsubscribeAll,
  updateDisplayName,
} from './services/account.ts';
import {
  addOrderNote,
  addPriceReference,
  addProductImage,
  analyticsSummary,
  cancelDrop,
  createDrop,
  createProduct,
  createSession,
  getOrderDetail,
  inspectDrop,
  listAudit,
  listCases,
  listJobs,
  listOrders,
  listProducts,
  listSessions,
  requireAdmin,
  resolveCase,
  scheduleDrop,
  setDropPaused,
  setFulfilment,
  setSessionStatus,
  updateDrop,
  updateProduct,
  type ProductInput,
} from './services/admin.ts';
import type { Condition, FulfilmentStatus } from '../shared/api-types.ts';

export interface Ctx {
  request: Request;
  deps: Deps;
  params: Record<string, string>;
  search: URLSearchParams;
  viewer: SignedInProfile | null;
}

export type Handler = (ctx: Ctx) => Promise<Response | object> | Response | object;

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: Handler;
  /** External callers (payment provider, scheduler) authenticate by signature or secret, not by origin or cookie. */
  external?: boolean;
}

const UUID_PARAM = /^[0-9a-f-]{36}$/i;

function signedIn(ctx: Ctx): SignedInProfile {
  if (!ctx.viewer) throw fail.unauthorized();
  return ctx.viewer;
}

function adminOf(ctx: Ctx): SignedInProfile {
  return requireAdmin(ctx.viewer);
}

function bodyOf(ctx: Ctx, maxBytes?: number): Promise<Record<string, unknown>> {
  return readJson<Record<string, unknown>>(ctx.request, maxBytes);
}

/** Images are served as bytes with a locked-down CSP, so an SVG can never run script when opened directly. */
function imageBytes(bytes: Uint8Array, contentType: string, cache: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cache,
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

const PUBLIC_PATHS = ['/', '/how-it-works', '/past-drops', '/alerts', '/orders', '/checkout', '/shipping', '/returns', '/terms', '/privacy', '/contact', '/login'];

function productInput(body: Record<string, unknown>): ProductInput {
  const specs = Array.isArray(body.specs) ? body.specs.slice(0, 20) : [];
  return {
    sku: requireString(body.sku, 'SKU', { max: 60 }),
    name: requireString(body.name, 'Name', { max: 160 }),
    description: typeof body.description === 'string' ? body.description.slice(0, 4000) : '',
    category: requireString(body.category, 'Category', { max: 60 }),
    condition: requireEnum<Condition>(body.condition, 'Condition', ['new', 'open_box', 'refurbished']),
    specs: specs.map((spec) => {
      const item = spec as Record<string, unknown>;
      return { label: requireString(item.label, 'Spec label', { max: 60 }), value: requireString(item.value, 'Spec value', { max: 160 }) };
    }),
    warrantyText: requireString(body.warrantyText, 'Warranty', { max: 1000 }),
    returnPolicyText: requireString(body.returnPolicyText, 'Return terms', { max: 1000 }),
    shippingEligible: body.shippingEligible === undefined ? true : requireBool(body.shippingEligible, 'Shipping eligible'),
    shippingFeePaise: optionalInt(body.shippingFeePaise, 'Delivery fee', { min: 0 }) ?? 0,
    procurementCostPaise: optionalInt(body.procurementCostPaise, 'Procurement cost', { min: 0 }),
    shippingCostPaise: optionalInt(body.shippingCostPaise, 'Shipping cost', { min: 0 }),
    otherCostPaise: optionalInt(body.otherCostPaise, 'Other cost', { min: 0 }),
    isSample: body.isSample === true,
  };
}

function dropInput(body: Record<string, unknown>) {
  return {
    productId: requireUuid(body.productId, 'Product'),
    salePaise: requireInt(body.salePaise, 'Sale price (paise)', { min: 1 }),
    quantity: optionalInt(body.quantity, 'Quantity', { min: 1, max: 100 }) ?? 1,
    position: requireInt(body.position, 'Position', { min: 1 }),
    releaseAt: optionalInstant(body.releaseAt, 'Release time'),
    closesAt: optionalInstant(body.closesAt, 'Close time'),
  };
}

export const routes: Route[] = [
  // ── Public catalogue ──────────────────────────────────────────────────────────
  { method: 'GET', path: '/config', handler: ({ deps }) => publicConfig(deps) },
  { method: 'GET', path: '/drop', handler: ({ deps, viewer }) => getDropState(deps, viewer?.id ?? null) },
  { method: 'GET', path: '/past-drops', handler: async ({ deps }) => ({ drops: await listPastDrops(deps) }) },

  {
    method: 'POST',
    path: '/track',
    handler: async (ctx) => {
      rateLimit(`track:${clientKey(ctx.request)}`, 120, 60_000);
      const body = await bodyOf(ctx, 1024);
      const path = typeof body.path === 'string' ? body.path.split('?')[0] : '';
      if (PUBLIC_PATHS.includes(path)) await recordVisitDay(ctx.deps, path);
      return { ok: true };
    },
  },

  {
    method: 'GET',
    path: '/media/:id',
    handler: async ({ deps, params, search }) => {
      const sig = search.get('sig') ?? '';
      if (!UUID_PARAM.test(params.id) || !verifyMediaSignature(deps, params.id, sig)) throw fail.notFound();
      // Served only while the product's drop is live or past. Unreleased images are never returned.
      const [media] = await deps.db.query<{ content_type: string; bytes: Buffer }>(
        `select pm.content_type, pm.bytes from product_media pm
          where pm.id = $1
            and exists (
              select 1 from drops d
               where d.product_id = pm.product_id and d.status in ('scheduled', 'paused') and d.release_at <= $2
            )`,
        [params.id, deps.clock.now()],
      );
      if (!media) throw fail.notFound();
      return imageBytes(new Uint8Array(media.bytes), media.content_type, 'public, max-age=86400');
    },
  },

  // ── Sign-in ───────────────────────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/auth/code',
    handler: async (ctx) => {
      rateLimit(`auth-code:${clientKey(ctx.request)}`, 10, 10 * 60_000);
      const body = await bodyOf(ctx, 1024);
      return requestLoginCode(ctx.deps, requireString(body.email, 'Email', { max: 254 }));
    },
  },
  {
    method: 'POST',
    path: '/auth/verify',
    handler: async (ctx) => {
      rateLimit(`auth-verify:${clientKey(ctx.request)}`, 30, 10 * 60_000);
      const body = await bodyOf(ctx, 1024);
      const result = await verifyLoginCode(
        ctx.deps,
        requireString(body.email, 'Email', { max: 254 }),
        requireString(body.code, 'Code', { min: 6, max: 6 }),
      );
      return json(
        { profile: { id: result.profile.id, email: result.profile.email } },
        200,
        { 'Set-Cookie': sessionCookie(result.token, result.expiresAt, ctx.deps.config.secureCookies) },
      );
    },
  },
  {
    method: 'POST',
    path: '/auth/signout',
    handler: async (ctx) => {
      const token = cookieValue(ctx.request, SESSION_COOKIE);
      if (token) await revokeSession(ctx.deps, token);
      return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(ctx.deps.config.secureCookies) });
    },
  },

  // ── Account ───────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/me', handler: async (ctx) => getMe(ctx.deps, signedIn(ctx)) },
  {
    method: 'PATCH',
    path: '/me',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      const body = await bodyOf(ctx);
      await updateDisplayName(ctx.deps, profile.id, optionalString(body.displayName, 'Name', { max: 80 }));
      return getMe(ctx.deps, profile);
    },
  },
  { method: 'GET', path: '/me/addresses', handler: async (ctx) => ({ addresses: await listAddresses(ctx.deps, signedIn(ctx).id) }) },
  {
    method: 'POST',
    path: '/me/addresses',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      const body = await bodyOf(ctx);
      const address = await saveAddress(ctx.deps, profile.id, {
        label: requireString(body.label ?? 'Home', 'Label', { max: 40 }),
        fullName: requireString(body.fullName, 'Full name', { max: 120 }),
        phone: requireString(body.phone, 'Phone', { min: 8, max: 16 }),
        line1: requireString(body.line1, 'Address line 1', { max: 200 }),
        line2: optionalString(body.line2, 'Address line 2', { max: 200 }),
        city: requireString(body.city, 'City', { max: 80 }),
        state: requireString(body.state, 'State', { max: 80 }),
        pincode: requireString(body.pincode, 'Pincode', { min: 6, max: 6 }),
        countryCode: requireString(body.countryCode ?? 'IN', 'Country', { min: 2, max: 2 }).toUpperCase(),
      });
      return json(address, 201);
    },
  },
  {
    method: 'DELETE',
    path: '/me/addresses/:id',
    handler: async (ctx) => {
      await deleteAddress(ctx.deps, signedIn(ctx).id, requireUuid(ctx.params.id, 'Address'));
      return { ok: true };
    },
  },
  {
    method: 'PUT',
    path: '/me/alert-preferences',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      const body = await bodyOf(ctx);
      await setAlertPreferences(ctx.deps, profile.id, {
        pushEnabled: body.pushEnabled === undefined ? undefined : requireBool(body.pushEnabled, 'Browser alerts'),
        emailReminders: body.emailReminders === undefined ? undefined : requireBool(body.emailReminders, 'Email reminders'),
      });
      return getMe(ctx.deps, profile);
    },
  },
  {
    method: 'POST',
    path: '/me/push-subscriptions',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      const body = await bodyOf(ctx, 8192);
      const keys = (body.keys ?? {}) as Record<string, unknown>;
      await registerPushSubscription(ctx.deps, profile.id, {
        endpoint: requireString(body.endpoint, 'Subscription', { max: 2048 }),
        keys: { p256dh: requireString(keys.p256dh, 'Subscription key', { max: 200 }), auth: requireString(keys.auth, 'Subscription key', { max: 200 }) },
      });
      return getMe(ctx.deps, profile);
    },
  },
  {
    method: 'POST',
    path: '/me/alerts/unsubscribe-all',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      await unsubscribeAll(ctx.deps, profile.id);
      return getMe(ctx.deps, profile);
    },
  },

  // ── Reservations and checkout ─────────────────────────────────────────────────
  {
    method: 'POST',
    path: '/reservations',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      rateLimit(`reserve:${profile.id}`, 30, 60_000);
      const body = await bodyOf(ctx, 512);
      return json(await createReservation(ctx.deps, profile.id, requireUuid(body.dropId, 'Drop')), 201);
    },
  },
  {
    method: 'GET',
    path: '/reservations/:id',
    handler: async (ctx) => getReservation(ctx.deps, signedIn(ctx).id, requireUuid(ctx.params.id, 'Reservation')),
  },
  {
    method: 'POST',
    path: '/reservations/:id/release',
    handler: async (ctx) => releaseReservation(ctx.deps, signedIn(ctx).id, requireUuid(ctx.params.id, 'Reservation')),
  },
  {
    method: 'POST',
    path: '/reservations/:id/checkout',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      rateLimit(`checkout:${profile.id}`, 20, 60_000);
      const body = await bodyOf(ctx, 512);
      return createPaymentOrder(ctx.deps, profile.id, requireUuid(ctx.params.id, 'Reservation'), requireUuid(body.addressId, 'Address'));
    },
  },
  {
    method: 'POST',
    path: '/checkout/verify',
    handler: async (ctx) => {
      const profile = signedIn(ctx);
      const body = await bodyOf(ctx, 2048);
      return verifyCheckoutCallback(ctx.deps, profile.id, {
        providerOrderId: requireString(body.providerOrderId, 'Order', { max: 100 }),
        providerPaymentId: requireString(body.providerPaymentId, 'Payment', { max: 100 }),
        signature: requireString(body.signature, 'Signature', { max: 200 }),
      });
    },
  },

  // ── Orders ────────────────────────────────────────────────────────────────────
  { method: 'GET', path: '/orders', handler: async (ctx) => ({ orders: await listMyOrders(ctx.deps, signedIn(ctx).id) }) },
  { method: 'GET', path: '/orders/:id', handler: async (ctx) => getMyOrder(ctx.deps, signedIn(ctx).id, requireUuid(ctx.params.id, 'Order')) },

  // ── Provider callbacks and scheduler ──────────────────────────────────────────
  {
    method: 'POST',
    path: '/webhooks/razorpay',
    external: true,
    handler: async (ctx) => {
      const outcome = await handleRazorpayWebhook(
        ctx.deps,
        await ctx.request.text(),
        ctx.request.headers.get('x-razorpay-signature'),
        ctx.request.headers.get('x-razorpay-event-id'),
      );
      return { ok: true, outcome };
    },
  },
  {
    method: 'POST',
    path: '/jobs/tick',
    external: true,
    handler: async (ctx) => runTick(ctx),
  },
  {
    method: 'GET',
    path: '/jobs/tick',
    external: true,
    handler: async (ctx) => runTick(ctx),
  },

  // ── Administration ────────────────────────────────────────────────────────────
  { method: 'GET', path: '/admin/summary', handler: async (ctx) => { adminOf(ctx); return analyticsSummary(ctx.deps, Number(ctx.search.get('days') ?? 30)); } },
  { method: 'GET', path: '/admin/products', handler: async (ctx) => { adminOf(ctx); return { products: await listProducts(ctx.deps) }; } },
  {
    method: 'POST',
    path: '/admin/products',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const id = await createProduct(ctx.deps, admin.id, productInput(await bodyOf(ctx, 65_536)));
      return json({ id }, 201);
    },
  },
  {
    method: 'PUT',
    path: '/admin/products/:id',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      await updateProduct(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Product'), productInput(await bodyOf(ctx, 65_536)));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/admin/products/:id/images',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const type = (ctx.request.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        throw new AppError(415, 'unsupported_image', 'Upload a JPEG, PNG or WebP image.');
      }
      const bytes = Buffer.from(await ctx.request.arrayBuffer());
      const id = await addProductImage(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Product'), type as 'image/jpeg', bytes);
      return json({ id }, 201);
    },
  },
  {
    method: 'GET',
    path: '/admin/media/:id',
    handler: async (ctx) => {
      adminOf(ctx);
      const [media] = await ctx.deps.db.query<{ content_type: string; bytes: Buffer }>(
        'select content_type, bytes from product_media where id = $1',
        [requireUuid(ctx.params.id, 'Image')],
      );
      if (!media) throw fail.notFound();
      return imageBytes(new Uint8Array(media.bytes), media.content_type, 'private, no-store');
    },
  },
  {
    method: 'POST',
    path: '/admin/products/:id/price-references',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      await addPriceReference(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Product'), {
        condition: requireEnum<Condition>(body.condition, 'Condition', ['new', 'open_box', 'refurbished']),
        amountPaise: requireInt(body.amountPaise, 'Reference price (paise)', { min: 1 }),
        sourceLabel: requireString(body.sourceLabel, 'Source', { max: 160 }),
        sourceUrl: optionalString(body.sourceUrl, 'Source link', { max: 500 }),
        evidenceNote: requireString(body.evidenceNote, 'Evidence note', { max: 1000 }),
        capturedAt: requireInstant(body.capturedAt, 'Captured at'),
      });
      return json({ ok: true }, 201);
    },
  },
  { method: 'GET', path: '/admin/sessions', handler: async (ctx) => { adminOf(ctx); return { sessions: await listSessions(ctx.deps) }; } },
  {
    method: 'POST',
    path: '/admin/sessions',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      const id = await createSession(ctx.deps, admin.id, {
        name: requireString(body.name, 'Session name', { max: 120 }),
        opensAt: requireInstant(body.opensAt, 'Window opens'),
        closesAt: requireInstant(body.closesAt, 'Window closes'),
      });
      return json({ id }, 201);
    },
  },
  // Registered before the ":action" route below, which would otherwise match "drops" as an action.
  {
    method: 'POST',
    path: '/admin/sessions/:id/drops',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const id = await createDrop(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Session'), dropInput(await bodyOf(ctx)));
      return json({ id }, 201);
    },
  },
  {
    method: 'POST',
    path: '/admin/sessions/:id/:action',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const action = requireEnum(ctx.params.action, 'Action', ['publish', 'pause', 'resume'] as const);
      await setSessionStatus(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Session'), action);
      return { ok: true };
    },
  },
  { method: 'GET', path: '/admin/drops/:id', handler: async (ctx) => { adminOf(ctx); return inspectDrop(ctx.deps, requireUuid(ctx.params.id, 'Drop')); } },
  {
    method: 'PUT',
    path: '/admin/drops/:id',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      await updateDrop(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Drop'), dropInput(await bodyOf(ctx)));
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/admin/drops/:id/:action',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const dropId = requireUuid(ctx.params.id, 'Drop');
      const action = requireEnum(ctx.params.action, 'Action', ['schedule', 'pause', 'resume', 'cancel'] as const);
      if (action === 'schedule') return scheduleDrop(ctx.deps, admin.id, dropId);
      if (action === 'pause' || action === 'resume') {
        await setDropPaused(ctx.deps, admin.id, dropId, action === 'pause');
        return { ok: true };
      }
      const body = await bodyOf(ctx);
      return cancelDrop(ctx.deps, admin.id, dropId, {
        reason: requireString(body.reason, 'Reason', { max: 300 }),
        paidOrdersAction: requireEnum(body.paidOrdersAction, 'Paid orders', ['refund', 'keep'] as const),
      });
    },
  },
  {
    method: 'GET',
    path: '/admin/orders',
    handler: async (ctx) => {
      adminOf(ctx);
      return { orders: await listOrders(ctx.deps, { paymentStatus: ctx.search.get('paymentStatus') }) };
    },
  },
  { method: 'GET', path: '/admin/orders/:id', handler: async (ctx) => { adminOf(ctx); return getOrderDetail(ctx.deps, requireUuid(ctx.params.id, 'Order')); } },
  {
    method: 'POST',
    path: '/admin/orders/:id/notes',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      await addOrderNote(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Order'), requireString(body.body, 'Note', { max: 2000 }));
      return json({ ok: true }, 201);
    },
  },
  {
    method: 'PUT',
    path: '/admin/orders/:id/fulfilment',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      await setFulfilment(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Order'), {
        status: requireEnum<FulfilmentStatus>(body.status, 'Status', ['unfulfilled', 'preparing', 'shipped', 'delivered', 'cancelled']),
        carrier: optionalString(body.carrier, 'Carrier', { max: 60 }),
        trackingNumber: optionalString(body.trackingNumber, 'Tracking number', { max: 80 }),
      });
      return { ok: true };
    },
  },
  {
    method: 'POST',
    path: '/admin/orders/:id/refunds',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      const refundId = await requestOrderRefund(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Order'), {
        amountPaise: optionalInt(body.amountPaise, 'Refund amount (paise)', { min: 1 }) ?? undefined,
        reason: requireString(body.reason, 'Reason', { max: 300 }),
      });
      return json({ refundId }, 201);
    },
  },
  { method: 'GET', path: '/admin/cases', handler: async (ctx) => { adminOf(ctx); return { cases: await listCases(ctx.deps) }; } },
  {
    method: 'POST',
    path: '/admin/cases/:id/resolve',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      const body = await bodyOf(ctx);
      await resolveCase(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Case'), requireString(body.note, 'Resolution note', { max: 1000 }));
      return { ok: true };
    },
  },
  { method: 'GET', path: '/admin/jobs', handler: async (ctx) => { adminOf(ctx); return { jobs: await listJobs(ctx.deps) }; } },
  {
    method: 'POST',
    path: '/admin/jobs/:id/retry',
    handler: async (ctx) => {
      const admin = adminOf(ctx);
      await retryJob(ctx.deps, admin.id, requireUuid(ctx.params.id, 'Job'));
      return { ok: true };
    },
  },
  { method: 'GET', path: '/admin/audit', handler: async (ctx) => { adminOf(ctx); return { entries: await listAudit(ctx.deps) }; } },
];

async function runTick(ctx: Ctx): Promise<object> {
  const secret = ctx.deps.config.cronSecret;
  const header = ctx.request.headers.get('authorization') ?? '';
  if (!secret || !constantTimeEqual(header, `Bearer ${secret}`)) {
    throw fail.unauthorized('The scheduler secret is missing or wrong.');
  }
  const swept = await sweep(ctx.deps);
  const dispatched = await dispatchDueJobs(ctx.deps);
  return { swept, dispatched };
}
