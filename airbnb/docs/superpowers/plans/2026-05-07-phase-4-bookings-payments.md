# Phase 4: Bookings & Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full booking and payment loop — guests select dates, pay via Stripe or PayPal, receive a confirmed booking; hosts onboard Stripe Connect Express and PayPal Marketplace to receive payouts.

**Architecture:** Next.js API routes handle all Stripe/PayPal communication. Convex stores all app state. Webhooks call Convex public mutations via `ConvexHttpClient`. Guests create a `pending` booking before redirecting to the payment provider; webhooks confirm it. A nightly cron marks past confirmed bookings as `completed`.

**Tech Stack:** Stripe v3 Node SDK, PayPal REST API (direct fetch), @paypal/react-paypal-js, Convex, Next.js 16 App Router, Clerk v6, date-fns, shadcn/ui, Tailwind v4

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/bookings.ts` | All booking mutations and queries |
| Create | `convex/stripeAccounts.ts` | Stripe Connect + PayPal account mutations and queries |
| Create | `convex/crons.ts` | Scheduled jobs: complete old bookings, cleanup abandoned |
| Create | `lib/stripe.ts` | Stripe singleton |
| Create | `lib/paypal.ts` | PayPal REST API helpers |
| Create | `app/api/stripe/checkout/route.ts` | Create Stripe Checkout Session |
| Create | `app/api/stripe/connect/route.ts` | Create Stripe Connect onboarding link |
| Create | `app/api/stripe/connect/callback/route.ts` | Handle Stripe Connect return |
| Create | `app/api/webhooks/stripe/route.ts` | Stripe event handler |
| Create | `app/api/paypal/order/route.ts` | Create PayPal order |
| Create | `app/api/paypal/capture/route.ts` | Capture PayPal order |
| Create | `app/api/paypal/connect/route.ts` | Create PayPal merchant onboarding link |
| Create | `app/api/webhooks/paypal/route.ts` | PayPal event handler |
| Modify | `app/properties/[id]/PropertyDetailClient.tsx` | Wire DayPicker, guest count, booked dates, Reserve URL |
| Create | `app/(protected)/checkout/[propertyId]/page.tsx` | Server wrapper |
| Create | `app/(protected)/checkout/[propertyId]/CheckoutClient.tsx` | Checkout UI + payment buttons |
| Create | `app/(protected)/booking-confirmation/[bookingId]/page.tsx` | Server wrapper |
| Create | `app/(protected)/booking-confirmation/[bookingId]/BookingConfirmationClient.tsx` | Confirmation UI |
| Create | `app/(protected)/trips/page.tsx` | Guest bookings list |
| Create | `app/(protected)/host/bookings/page.tsx` | Host bookings list |
| Create | `app/(protected)/host/onboarding/stripe/page.tsx` | Stripe Connect onboarding UI |
| Create | `app/(protected)/host/onboarding/paypal/page.tsx` | PayPal onboarding UI |
| Modify | `app/(protected)/host/properties/page.tsx` | Add payment setup banner |
| Create | `app/api/bookings/refund/route.ts` | Issue Stripe or PayPal refund by bookingId |

---

## Task 1: Install dependencies

**Files:** `package.json` (via pnpm)

- [ ] **Step 1: Install Stripe and PayPal packages**

```bash
cd airbnb && pnpm add stripe @paypal/react-paypal-js
```

Expected: both packages added to `dependencies`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd airbnb && pnpm tsc --noEmit 2>&1 | grep -v ".next/dev/types" | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: install stripe and @paypal/react-paypal-js"
```

---

## Task 2: Convex bookings functions

**Files:**
- Create: `airbnb/convex/bookings.ts`

- [ ] **Step 1: Create the file**

```ts
// airbnb/convex/bookings.ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";

function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const createBooking = mutation({
  args: {
    propertyId: v.id("properties"),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    paymentMethod: v.union(v.literal("stripe"), v.literal("paypal")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.status !== "published") throw new Error("Property not available");

    const confirmed = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .collect();

    if (
      confirmed.some((b) =>
        datesOverlap(args.checkIn, args.checkOut, b.checkIn, b.checkOut),
      )
    ) {
      throw new Error("These dates are no longer available");
    }

    const nights = Math.round(
      (new Date(args.checkOut).getTime() - new Date(args.checkIn).getTime()) /
        86400000,
    );
    const totalAmount = property.pricePerNight * nights + property.cleaningFee;
    const platformFee = Math.round(totalAmount * 0.05);
    const hostPayout = totalAmount - platformFee;

    return ctx.db.insert("bookings", {
      propertyId: args.propertyId,
      guestId: user._id,
      hostId: property.hostId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guests: args.guests,
      status: "pending",
      totalAmount,
      platformFee,
      hostPayout,
      paymentMethod: args.paymentMethod,
    });
  },
});

export const confirmBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    paymentIntentId: v.optional(v.string()),
    paypalCaptureId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status === "confirmed") return; // idempotent
    await ctx.db.patch(args.bookingId, {
      status: "confirmed",
      ...(args.paymentIntentId && { paymentIntentId: args.paymentIntentId }),
      ...(args.paypalCaptureId && { paypalCaptureId: args.paypalCaptureId }),
    });
  },
});

export const cancelBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.guestId !== user._id && booking.hostId !== user._id)
      throw new Error("Unauthorized");

    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancelledBy: user._id === booking.guestId ? "guest" : "host",
      cancelledAt: Date.now(),
      cancellationReason: args.reason,
    });
  },
});

export const getBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    if (booking.guestId !== user._id && booking.hostId !== user._id)
      return null;
    return booking;
  },
});

export const getBookingById = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.bookingId);
  },
});

export const getGuestBookings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    return ctx.db
      .query("bookings")
      .withIndex("by_guest_id", (q) => q.eq("guestId", user._id))
      .order("desc")
      .collect();
  },
});

export const getHostBookings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    return ctx.db
      .query("bookings")
      .withIndex("by_host_id", (q) => q.eq("hostId", user._id))
      .order("desc")
      .collect();
  },
});

export const getBookedDates = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .collect();
    return bookings.map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }));
  },
});

export const completeOldBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .collect();
    for (const booking of bookings) {
      if (booking.checkOut < today) {
        await ctx.db.patch(booking._id, { status: "completed" });
      }
    }
  },
});

export const cleanupAbandonedBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const booking of bookings) {
      if (booking._creationTime < cutoff) {
        await ctx.db.delete(booking._id);
      }
    }
  },
});
```

- [ ] **Step 2: Sync Convex and verify**

```bash
cd airbnb && npx convex dev --once
```

Expected: "Convex functions ready" — no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/bookings.ts convex/_generated/
git commit -m "feat: add Convex bookings mutations and queries"
```

---

## Task 3: Convex account functions

**Files:**
- Create: `airbnb/convex/stripeAccounts.ts`

- [ ] **Step 1: Create the file**

```ts
// airbnb/convex/stripeAccounts.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const upsertStripeAccount = mutation({
  args: {
    stripeAccountId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("restricted"),
    ),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        stripeAccountId: args.stripeAccountId,
        status: args.status,
        chargesEnabled: args.chargesEnabled,
        payoutsEnabled: args.payoutsEnabled,
      });
    } else {
      await ctx.db.insert("stripeAccounts", {
        userId: user._id,
        stripeAccountId: args.stripeAccountId,
        status: args.status,
        chargesEnabled: args.chargesEnabled,
        payoutsEnabled: args.payoutsEnabled,
      });
    }
  },
});

export const getStripeAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    return ctx.db
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
  },
});

export const getStripeAccountByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const upsertPaypalAccount = mutation({
  args: {
    paypalMerchantId: v.string(),
    trackingId: v.string(),
    status: v.union(v.literal("pending"), v.literal("active")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const existing = await ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        paypalMerchantId: args.paypalMerchantId,
        trackingId: args.trackingId,
        status: args.status,
      });
    } else {
      await ctx.db.insert("paypalAccounts", {
        userId: user._id,
        paypalMerchantId: args.paypalMerchantId,
        trackingId: args.trackingId,
        status: args.status,
      });
    }
  },
});

export const getPaypalAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    return ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .first();
  },
});

export const getPaypalAccountByUserId = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .first();
  },
});
```

- [ ] **Step 2: Sync Convex**

```bash
cd airbnb && npx convex dev --once
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add convex/stripeAccounts.ts convex/_generated/
git commit -m "feat: add Stripe and PayPal account Convex functions"
```

---

## Task 4: Convex crons

**Files:**
- Create: `airbnb/convex/crons.ts`

- [ ] **Step 1: Create the file**

```ts
// airbnb/convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "complete old bookings",
  { hourUTC: 0, minuteUTC: 5 },
  internal.bookings.completeOldBookings,
);

crons.interval(
  "cleanup abandoned bookings",
  { hours: 2 },
  internal.bookings.cleanupAbandonedBookings,
);

export default crons;
```

- [ ] **Step 2: Sync Convex**

```bash
cd airbnb && npx convex dev --once
```

Expected: cron jobs appear in Convex dashboard under Scheduled Functions.

- [ ] **Step 3: Commit**

```bash
git add convex/crons.ts convex/_generated/
git commit -m "feat: add crons for booking completion and abandoned booking cleanup"
```

---

## Task 5: Payment provider utilities

**Files:**
- Create: `airbnb/lib/stripe.ts`
- Create: `airbnb/lib/paypal.ts`

- [ ] **Step 1: Create lib/stripe.ts**

```ts
// airbnb/lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-04-30",
});
```

- [ ] **Step 2: Create lib/paypal.ts**

```ts
// airbnb/lib/paypal.ts
const BASE =
  process.env.NODE_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
      ).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  return data.access_token as string;
}

export async function createPayPalOrder(params: {
  totalCents: number;
  platformFeeCents: number;
  merchantId: string;
  bookingId: string;
}): Promise<string> {
  const token = await getToken();
  const total = (params.totalCents / 100).toFixed(2);
  const fee = (params.platformFeeCents / 100).toFixed(2);

  const res = await fetch(`${BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: { currency_code: "USD", value: total },
          payee: { merchant_id: params.merchantId },
          payment_instruction: {
            disbursement_mode: "INSTANT",
            platform_fees: [
              { amount: { currency_code: "USD", value: fee } },
            ],
          },
          custom_id: params.bookingId,
        },
      ],
    }),
  });
  const data = await res.json();
  if (!data.id) throw new Error(`PayPal order creation failed: ${JSON.stringify(data)}`);
  return data.id as string;
}

export async function capturePayPalOrder(
  orderId: string,
): Promise<{ captureId: string; bookingId: string }> {
  const token = await getToken();
  const res = await fetch(`${BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return { captureId: capture?.id as string, bookingId: unit?.custom_id as string };
}

export async function refundPayPalCapture(captureId: string): Promise<void> {
  const token = await getToken();
  await fetch(`${BASE}/v2/payments/captures/${captureId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
}

export async function createPartnerReferral(params: {
  trackingId: string;
  returnUrl: string;
}): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${BASE}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      tracking_id: params.trackingId,
      operations: [
        {
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: { features: ["PAYMENT", "REFUND"] },
            },
          },
        },
      ],
      products: ["EXPRESS_CHECKOUT"],
      partner_config_override: {
        return_url: params.returnUrl,
        return_url_description: "Return to StayFinder after PayPal setup",
      },
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
    }),
  });
  const data = await res.json();
  const link = (data.links as Array<{ rel: string; href: string }> | undefined)?.find(
    (l) => l.rel === "action_url",
  );
  if (!link) throw new Error(`PayPal partner referral failed: ${JSON.stringify(data)}`);
  return link.href;
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd airbnb && pnpm tsc --noEmit 2>&1 | grep -v ".next/dev/types" | head -20
```

Expected: no errors from `lib/stripe.ts` or `lib/paypal.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/stripe.ts lib/paypal.ts
git commit -m "feat: add Stripe and PayPal provider utility modules"
```

---

## Task 6: Stripe API routes

**Files:**
- Create: `airbnb/app/api/stripe/checkout/route.ts`
- Create: `airbnb/app/api/stripe/connect/route.ts`
- Create: `airbnb/app/api/stripe/connect/callback/route.ts`

- [ ] **Step 1: Create app/api/stripe/checkout/route.ts**

```ts
// airbnb/app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { stripe } from "@/lib/stripe";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bookingId } = (await req.json()) as { bookingId: string };

    const booking = await convex.query(api.bookings.getBookingById, {
      bookingId: bookingId as Id<"bookings">,
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const property = await convex.query(api.properties.getProperty, {
      propertyId: booking.propertyId,
    });
    if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const stripeAccount = await convex.query(api.stripeAccounts.getStripeAccountByUserId, {
      userId: booking.hostId,
    });
    if (!stripeAccount?.stripeAccountId) {
      return NextResponse.json({ error: "Host has not connected Stripe" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: property.title,
              description: `${booking.checkIn} → ${booking.checkOut} · ${booking.guests} guest${booking.guests !== 1 ? "s" : ""}`,
            },
            unit_amount: booking.totalAmount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: booking.platformFee,
        transfer_data: { destination: stripeAccount.stripeAccountId },
      },
      metadata: { bookingId },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/booking-confirmation/${bookingId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/${booking.propertyId}`,
      mode: "payment",
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create app/api/stripe/connect/route.ts**

```ts
// airbnb/app/api/stripe/connect/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const account = await stripe.accounts.create({ type: "express" });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/host/onboarding/stripe`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe/connect/callback?accountId=${account.id}`,
      type: "account_onboarding",
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (err) {
    console.error("[stripe/connect]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create app/api/stripe/connect/callback/route.ts**

```ts
// airbnb/app/api/stripe/connect/callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function GET(req: NextRequest) {
  try {
    const { userId, getToken } = await auth();
    if (!userId) return NextResponse.redirect(new URL("/sign-in", req.url));

    const accountId = req.nextUrl.searchParams.get("accountId");
    if (!accountId) return NextResponse.redirect(new URL("/host/onboarding/stripe", req.url));

    const account = await stripe.accounts.retrieve(accountId);

    const token = await getToken({ template: "convex" });
    const authedConvex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
    authedConvex.setAuth(token!);

    await authedConvex.mutation(api.stripeAccounts.upsertStripeAccount, {
      stripeAccountId: account.id,
      status: account.charges_enabled ? "active" : "pending",
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
    });

    return NextResponse.redirect(new URL("/host/onboarding/stripe", req.url));
  } catch (err) {
    console.error("[stripe/connect/callback]", err);
    return NextResponse.redirect(new URL("/host/onboarding/stripe", req.url));
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/stripe/
git commit -m "feat: add Stripe checkout and Connect Express API routes"
```

---

## Task 7: Stripe webhook

**Files:**
- Create: `airbnb/app/api/webhooks/stripe/route.ts`

- [ ] **Step 1: Create the file**

```ts
// airbnb/app/api/webhooks/stripe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[stripe/webhook] signature failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const bookingId = session.metadata?.bookingId;
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id;

      if (bookingId) {
        await convex.mutation(api.bookings.confirmBooking, {
          bookingId: bookingId as Id<"bookings">,
          paymentIntentId: paymentIntentId ?? undefined,
        });
      }
    }

    if (event.type === "account.updated") {
      // account.updated events don't carry user context — handled via callback route
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

export const config = { api: { bodyParser: false } };
```

- [ ] **Step 2: Commit**

```bash
git add app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe webhook handler"
```

---

## Task 8: PayPal API routes

**Files:**
- Create: `airbnb/app/api/paypal/order/route.ts`
- Create: `airbnb/app/api/paypal/capture/route.ts`
- Create: `airbnb/app/api/paypal/connect/route.ts`

- [ ] **Step 1: Create app/api/paypal/order/route.ts**

```ts
// airbnb/app/api/paypal/order/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { createPayPalOrder } from "@/lib/paypal";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bookingId } = (await req.json()) as { bookingId: string };

    const booking = await convex.query(api.bookings.getBookingById, {
      bookingId: bookingId as Id<"bookings">,
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    const paypalAccount = await convex.query(api.stripeAccounts.getPaypalAccountByUserId, {
      userId: booking.hostId,
    });
    if (!paypalAccount?.paypalMerchantId) {
      return NextResponse.json({ error: "Host has not connected PayPal" }, { status: 400 });
    }

    const orderId = await createPayPalOrder({
      totalCents: booking.totalAmount,
      platformFeeCents: booking.platformFee,
      merchantId: paypalAccount.paypalMerchantId,
      bookingId,
    });

    return NextResponse.json({ orderId });
  } catch (err) {
    console.error("[paypal/order]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create app/api/paypal/capture/route.ts**

```ts
// airbnb/app/api/paypal/capture/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { capturePayPalOrder } from "@/lib/paypal";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { orderId, bookingId } = (await req.json()) as {
      orderId: string;
      bookingId: string;
    };

    const { captureId } = await capturePayPalOrder(orderId);

    await convex.mutation(api.bookings.confirmBooking, {
      bookingId: bookingId as Id<"bookings">,
      paypalCaptureId: captureId,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[paypal/capture]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create app/api/paypal/connect/route.ts**

```ts
// airbnb/app/api/paypal/connect/route.ts
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createPartnerReferral } from "@/lib/paypal";
import { randomUUID } from "crypto";

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const trackingId = randomUUID();
    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL}/host/onboarding/paypal?trackingId=${trackingId}`;

    const url = await createPartnerReferral({ trackingId, returnUrl });
    return NextResponse.json({ url, trackingId });
  } catch (err) {
    console.error("[paypal/connect]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/paypal/
git commit -m "feat: add PayPal order, capture, and connect API routes"
```

---

## Task 9: PayPal webhook

**Files:**
- Create: `airbnb/app/api/webhooks/paypal/route.ts`

- [ ] **Step 1: Create the file**

```ts
// airbnb/app/api/webhooks/paypal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const eventType = body.event_type as string;

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const resource = body.resource;
      const bookingId = resource?.custom_id as string | undefined;
      const captureId = resource?.id as string | undefined;

      if (bookingId && captureId) {
        await convex.mutation(api.bookings.confirmBooking, {
          bookingId: bookingId as Id<"bookings">,
          paypalCaptureId: captureId,
        });
      }
    }

    if (eventType === "PAYMENT.CAPTURE.DENIED") {
      const bookingId = body.resource?.custom_id as string | undefined;
      if (bookingId) {
        await convex.mutation(api.bookings.cancelBooking, {
          bookingId: bookingId as Id<"bookings">,
          reason: "PayPal payment denied",
        });
      }
    }
  } catch (err) {
    console.error("[paypal/webhook]", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/webhooks/paypal/route.ts
git commit -m "feat: add PayPal webhook handler"
```

---

## Task 10: Update PropertyDetailClient

Wire the date picker, add guest count selector, show booked dates, fix Reserve button URL.

**Files:**
- Modify: `airbnb/app/properties/[id]/PropertyDetailClient.tsx`

- [ ] **Step 1: Read the current file**

Read `airbnb/app/properties/[id]/PropertyDetailClient.tsx` to confirm current state before editing.

- [ ] **Step 2: Replace the full file**

```tsx
// airbnb/app/properties/[id]/PropertyDetailClient.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MapPin, Users, BedDouble, Bath, Clock, Star, Minus, Plus } from "lucide-react";
import { PropertyMap } from "@/components/map/PropertyMap";
import { format, differenceInCalendarDays } from "date-fns";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function PropertyDetailClient({ property }: { property: Doc<"properties"> }) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState(1);

  const images = useQuery(api.propertyImages.getPropertyImages, {
    propertyId: property._id,
  });
  const bookedDates = useQuery(api.bookings.getBookedDates, {
    propertyId: property._id,
  });

  const allImages = images ?? [];
  const lightboxSlides = allImages.map((img) => ({ src: img.url }));

  const disabledDates =
    bookedDates?.flatMap(({ checkIn, checkOut }) => {
      const dates: Date[] = [];
      const start = new Date(checkIn);
      const end = new Date(checkOut);
      for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
        dates.push(new Date(d));
      }
      return dates;
    }) ?? [];

  const nights =
    dateRange?.from && dateRange?.to
      ? differenceInCalendarDays(dateRange.to, dateRange.from)
      : 0;

  const subtotal = nights > 0 ? property.pricePerNight * nights : property.pricePerNight;
  const serviceFee = Math.round((subtotal + property.cleaningFee) * 0.05);
  const total = subtotal + property.cleaningFee + serviceFee;

  function handleReserve() {
    if (!dateRange?.from || !dateRange?.to) return;
    const params = new URLSearchParams({
      checkIn: format(dateRange.from, "yyyy-MM-dd"),
      checkOut: format(dateRange.to, "yyyy-MM-dd"),
      guests: String(guests),
    });
    router.push(`/checkout/${property._id}?${params.toString()}`);
  }

  const canReserve = !!dateRange?.from && !!dateRange?.to && nights > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">{property.title}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
        {property.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Star className="h-4 w-4 fill-current" />
            {property.avgRating.toFixed(1)}
            <span className="text-muted-foreground font-normal">
              ({property.reviewCount} reviews)
            </span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          {property.city}, {property.country}
        </span>
        <Badge variant="outline" className="capitalize">
          {property.type}
        </Badge>
      </div>

      {/* Gallery */}
      <div
        className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden mb-8 cursor-pointer h-[400px]"
        onClick={() => allImages.length > 0 && setLightboxIndex(0)}
      >
        <div className="col-span-2 row-span-2 relative">
          {property.coverImageUrl ? (
            <Image
              src={property.coverImageUrl}
              alt={property.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground">No image</span>
            </div>
          )}
        </div>
        {allImages.slice(1, 5).map((img, i) => (
          <div key={img._id} className="relative">
            <Image src={img.url} alt="" fill className="object-cover" />
            {i === 3 && allImages.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-medium">+{allImages.length - 5} more</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-8">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {property.maxGuests} guests
            </span>
            <span className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" />
              {property.bedrooms} bedroom{property.bedrooms !== 1 ? "s" : ""} ·{" "}
              {property.beds} bed{property.beds !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <Bath className="h-4 w-4" />
              {property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              Check-in {property.checkInTime} · Check-out {property.checkOutTime}
            </span>
          </div>

          <Separator />

          <div>
            <h2 className="text-lg font-semibold mb-3">About this place</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
              {property.description}
            </p>
          </div>

          <Separator />

          {property.amenities.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">What this place offers</h2>
              <div className="grid grid-cols-2 gap-2">
                {property.amenities.map((amenity) => (
                  <span key={amenity} className="flex items-center gap-2 text-sm py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator />

          <div>
            <h2 className="text-lg font-semibold mb-3">Availability</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Select your check-in and check-out dates.
            </p>
            <DayPicker
              mode="range"
              selected={dateRange}
              onSelect={setDateRange}
              disabled={[{ before: new Date() }, ...disabledDates]}
              className="border rounded-xl p-4"
            />
          </div>

          <Separator />

          {property.houseRules.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">House rules</h2>
              <ul className="space-y-2">
                {property.houseRules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div>
            <h2 className="text-lg font-semibold mb-3">Location</h2>
            <p className="text-sm text-muted-foreground mb-3">
              {property.address}, {property.city}, {property.country}
            </p>
            {property.lat !== 0 && property.lng !== 0 ? (
              <PropertyMap lat={property.lat} lng={property.lng} />
            ) : (
              <div className="h-72 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-sm">
                {property.city}, {property.country}
              </div>
            )}
          </div>
        </div>

        {/* Booking widget */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl border p-6 shadow-sm space-y-4">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{formatCents(property.pricePerNight)}</span>
              <span className="text-muted-foreground">/ night</span>
            </div>

            {property.reviewCount > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-current" />
                <span className="font-medium">{property.avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground">({property.reviewCount} reviews)</span>
              </div>
            )}

            <Separator />

            {/* Guest count */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Guests</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  disabled={guests <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{guests}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.min(property.maxGuests, g + 1))}
                  disabled={guests >= property.maxGuests}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {formatCents(property.pricePerNight)} ×{" "}
                  {nights > 0 ? `${nights} night${nights !== 1 ? "s" : ""}` : "1 night"}
                </span>
                <span>{formatCents(nights > 0 ? property.pricePerNight * nights : property.pricePerNight)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cleaning fee</span>
                <span>{formatCents(property.cleaningFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service fee</span>
                <span>{formatCents(serviceFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCents(total)}</span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleReserve}
              disabled={!canReserve}
            >
              {canReserve ? "Reserve" : "Select dates to continue"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd airbnb && pnpm tsc --noEmit 2>&1 | grep -v ".next/dev/types" | head -20
```

Expected: no errors from PropertyDetailClient.tsx.

- [ ] **Step 4: Commit**

```bash
git add app/properties/[id]/PropertyDetailClient.tsx
git commit -m "feat: wire date picker, guest count, and booked dates on property detail"
```

---

## Task 11: Checkout page

**Files:**
- Create: `airbnb/app/(protected)/checkout/[propertyId]/page.tsx`
- Create: `airbnb/app/(protected)/checkout/[propertyId]/CheckoutClient.tsx`

- [ ] **Step 1: Create page.tsx**

```tsx
// airbnb/app/(protected)/checkout/[propertyId]/page.tsx
import { CheckoutClient } from "./CheckoutClient";

interface Props {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { propertyId } = await params;
  const { checkIn, checkOut, guests } = await searchParams;
  return (
    <CheckoutClient
      propertyId={propertyId}
      checkIn={checkIn ?? ""}
      checkOut={checkOut ?? ""}
      guests={Number(guests ?? 1)}
    />
  );
}
```

- [ ] **Step 2: Create CheckoutClient.tsx**

```tsx
// airbnb/app/(protected)/checkout/[propertyId]/CheckoutClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { differenceInCalendarDays } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel";

const PayPalScriptProvider = dynamic(
  () => import("@paypal/react-paypal-js").then((m) => m.PayPalScriptProvider),
  { ssr: false },
);
const PayPalButtons = dynamic(
  () => import("@paypal/react-paypal-js").then((m) => m.PayPalButtons),
  { ssr: false },
);

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

interface Props {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}

export function CheckoutClient({ propertyId, checkIn, checkOut, guests }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const property = useQuery(api.properties.getProperty, {
    propertyId: propertyId as Id<"properties">,
  });

  const createBooking = useMutation(api.bookings.createBooking);

  if (!checkIn || !checkOut) {
    router.replace(`/properties/${propertyId}`);
    return null;
  }

  if (property === undefined) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <Navbar />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-3xl px-4">
        <Navbar />
        <p className="py-12 text-center text-muted-foreground">Property not found.</p>
      </div>
    );
  }

  const nights = differenceInCalendarDays(new Date(checkOut), new Date(checkIn));
  const subtotal = property.pricePerNight * nights;
  const serviceFee = Math.round((subtotal + property.cleaningFee) * 0.05);
  const total = subtotal + property.cleaningFee + serviceFee;

  async function handleStripe() {
    setLoading(true);
    setError("");
    try {
      const bookingId = await createBooking({
        propertyId: propertyId as Id<"properties">,
        checkIn,
        checkOut,
        guests,
        paymentMethod: "stripe",
      });

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Stripe error");
      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  async function createPayPalOrder() {
    const bookingId = await createBooking({
      propertyId: propertyId as Id<"properties">,
      checkIn,
      checkOut,
      guests,
      paymentMethod: "paypal",
    });

    const res = await fetch("/api/paypal/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "PayPal error");
    (window as Window & { __currentBookingId?: string }).__currentBookingId = bookingId;
    return data.orderId as string;
  }

  async function onPayPalApprove(data: { orderID: string }) {
    const bookingId = (window as Window & { __currentBookingId?: string }).__currentBookingId;
    const res = await fetch("/api/paypal/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: data.orderID, bookingId }),
    });
    if (res.ok) {
      router.push(`/booking-confirmation/${bookingId}`);
    } else {
      setError("PayPal capture failed. Please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4">
      <Navbar />
      <h1 className="text-2xl font-bold mb-6">Confirm and pay</h1>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Left: booking summary */}
        <div className="space-y-6">
          <div className="flex gap-4">
            {property.coverImageUrl && (
              <div className="relative h-24 w-32 flex-shrink-0 rounded-lg overflow-hidden">
                <Image
                  src={property.coverImageUrl}
                  alt={property.title}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div>
              <p className="font-semibold">{property.title}</p>
              <p className="text-sm text-muted-foreground capitalize">{property.type}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span className="font-medium">{checkIn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span className="font-medium">{checkOut}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Guests</span>
              <span className="font-medium">{guests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">
                {nights} night{nights !== 1 ? "s" : ""}
              </span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {formatCents(property.pricePerNight)} × {nights} night{nights !== 1 ? "s" : ""}
              </span>
              <span>{formatCents(subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cleaning fee</span>
              <span>{formatCents(property.cleaningFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Service fee (5%)</span>
              <span>{formatCents(serviceFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-base">
              <span>Total</span>
              <span>{formatCents(total)}</span>
            </div>
          </div>
        </div>

        {/* Right: payment buttons */}
        <div className="space-y-4">
          <h2 className="font-semibold">Pay with</h2>

          {error && (
            <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              {error}
            </p>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={handleStripe}
            disabled={loading}
          >
            {loading ? "Redirecting…" : "Pay with Card (Stripe)"}
          </Button>

          <div className="relative">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-2 text-xs text-muted-foreground">
              or
            </span>
          </div>

          <PayPalScriptProvider
            options={{ clientId: process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "" }}
          >
            <PayPalButtons
              style={{ layout: "vertical", shape: "rect" }}
              createOrder={createPayPalOrder}
              onApprove={onPayPalApprove}
              onError={() => setError("PayPal encountered an error. Please try again.")}
            />
          </PayPalScriptProvider>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/checkout/
git commit -m "feat: checkout page with Stripe and PayPal payment buttons"
```

---

## Task 12: Booking confirmation page

**Files:**
- Create: `airbnb/app/(protected)/booking-confirmation/[bookingId]/page.tsx`
- Create: `airbnb/app/(protected)/booking-confirmation/[bookingId]/BookingConfirmationClient.tsx`

- [ ] **Step 1: Create page.tsx**

```tsx
// airbnb/app/(protected)/booking-confirmation/[bookingId]/page.tsx
import { BookingConfirmationClient } from "./BookingConfirmationClient";

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default async function BookingConfirmationPage({ params }: Props) {
  const { bookingId } = await params;
  return <BookingConfirmationClient bookingId={bookingId} />;
}
```

- [ ] **Step 2: Create BookingConfirmationClient.tsx**

```tsx
// airbnb/app/(protected)/booking-confirmation/[bookingId]/BookingConfirmationClient.tsx
"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function BookingConfirmationClient({ bookingId }: { bookingId: string }) {
  const booking = useQuery(api.bookings.getBooking, {
    bookingId: bookingId as Id<"bookings">,
  });

  return (
    <div className="mx-auto max-w-xl px-4">
      <Navbar />

      {booking === undefined && (
        <div className="py-24 text-center space-y-3">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" />
          <p className="font-medium">Processing your booking…</p>
          <p className="text-sm text-muted-foreground">
            This usually takes a few seconds.
          </p>
        </div>
      )}

      {booking?.status === "pending" && (
        <div className="py-24 text-center space-y-3">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground animate-pulse" />
          <p className="font-medium">Confirming your payment…</p>
          <p className="text-sm text-muted-foreground">
            Waiting for payment confirmation. This page will update automatically.
          </p>
        </div>
      )}

      {booking?.status === "confirmed" && (
        <div className="py-12 text-center space-y-6">
          <CheckCircle2 className="h-16 w-16 mx-auto text-green-500" />
          <div>
            <h1 className="text-2xl font-bold">Booking confirmed!</h1>
            <p className="text-muted-foreground mt-1">
              You&apos;re all set. Have a great stay.
            </p>
          </div>

          <div className="rounded-xl border p-6 text-left space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-in</span>
              <span className="font-medium">{booking.checkIn}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check-out</span>
              <span className="font-medium">{booking.checkOut}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Guests</span>
              <span className="font-medium">{booking.guests}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total paid</span>
              <span className="font-semibold">{formatCents(booking.totalAmount)}</span>
            </div>
          </div>

          <Button asChild className="w-full">
            <Link href="/trips">View my trips</Link>
          </Button>
        </div>
      )}

      {booking === null && (
        <div className="py-24 text-center">
          <p className="text-muted-foreground">Booking not found.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/(protected)/booking-confirmation/
git commit -m "feat: booking confirmation page"
```

---

## Task 13: Guest trips page

**Files:**
- Create: `airbnb/app/(protected)/trips/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/app/(protected)/trips/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { Id } from "@/convex/_generated/dataModel";
import type { Doc } from "@/convex/_generated/dataModel";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Payment pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  cancelled: "destructive",
  completed: "outline",
};

type Tab = "upcoming" | "past" | "cancelled";

function BookingCard({
  booking,
  onCancel,
}: {
  booking: Doc<"bookings">;
  onCancel: (id: Id<"bookings">) => void;
}) {
  const property = useQuery(api.properties.getProperty, {
    propertyId: booking.propertyId,
  });

  return (
    <div className="flex gap-4 rounded-xl border p-4">
      {property?.coverImageUrl && (
        <div className="relative h-24 w-32 flex-shrink-0 rounded-lg overflow-hidden">
          <Image src={property.coverImageUrl} alt={property?.title ?? ""} fill className="object-cover" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <Link
          href={`/properties/${booking.propertyId}`}
          className="font-semibold hover:underline line-clamp-1"
        >
          {property?.title ?? "Loading…"}
        </Link>
        <p className="text-sm text-muted-foreground mt-0.5">
          {booking.checkIn} → {booking.checkOut} · {booking.guests} guest
          {booking.guests !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Badge variant={STATUS_VARIANT[booking.status]}>
            {STATUS_LABEL[booking.status]}
          </Badge>
          <span className="text-sm font-medium">{formatCents(booking.totalAmount)}</span>
        </div>
      </div>
      {booking.status === "confirmed" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start flex-shrink-0"
          onClick={() => onCancel(booking._id)}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

export default function TripsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const bookings = useQuery(api.bookings.getGuestBookings, {});
  const cancelBooking = useMutation(api.bookings.cancelBooking);

  const today = new Date().toISOString().split("T")[0];

  const filtered = (bookings ?? []).filter((b) => {
    if (tab === "cancelled") return b.status === "cancelled";
    if (tab === "past") return b.status === "completed" || (b.status === "confirmed" && b.checkOut < today);
    return (b.status === "pending" || b.status === "confirmed") && b.checkOut >= today;
  });

  async function handleCancel(bookingId: Id<"bookings">) {
    if (!confirm("Are you sure you want to cancel this booking? A full refund will be issued.")) return;
    await cancelBooking({ bookingId, reason: "Guest cancelled" });
    await fetch("/api/bookings/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4">
      <Navbar />
      <h1 className="text-2xl font-bold mb-6">Your trips</h1>

      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {bookings === undefined && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {bookings !== undefined && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="font-medium">No {tab} trips</p>
          {tab === "upcoming" && (
            <Button asChild className="mt-4">
              <Link href="/search">Find a place to stay</Link>
            </Button>
          )}
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((b) => (
          <div key={b._id}>
            <BookingCard booking={b} onCancel={handleCancel} />
          </div>
        ))}
      </div>

      {filtered.length > 0 && <Separator className="my-6" />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(protected)/trips/page.tsx
git commit -m "feat: guest trips page with upcoming/past/cancelled tabs"
```

---

## Task 14: Host bookings page

**Files:**
- Create: `airbnb/app/(protected)/host/bookings/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/app/(protected)/host/bookings/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Id, Doc } from "@/convex/_generated/dataModel";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Awaiting payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "default",
  cancelled: "destructive",
  completed: "outline",
};

type Tab = "upcoming" | "past" | "cancelled";

function BookingRow({
  booking,
  onCancel,
}: {
  booking: Doc<"bookings">;
  onCancel: (id: Id<"bookings">) => void;
}) {
  const property = useQuery(api.properties.getProperty, { propertyId: booking.propertyId });
  const guest = useQuery(api.users.getUserById, { userId: booking.guestId });

  return (
    <div className="flex items-center gap-4 rounded-xl border p-4">
      <div className="flex-1 min-w-0">
        <Link
          href={`/properties/${booking.propertyId}`}
          className="font-semibold hover:underline"
        >
          {property?.title ?? "Loading…"}
        </Link>
        <p className="text-sm text-muted-foreground mt-0.5">
          Guest: {guest?.name ?? "…"} · {booking.checkIn} → {booking.checkOut} · {booking.guests} guest
          {booking.guests !== 1 ? "s" : ""}
        </p>
        <div className="flex items-center gap-3 mt-2">
          <Badge variant={STATUS_VARIANT[booking.status]}>
            {STATUS_LABEL[booking.status]}
          </Badge>
          <span className="text-sm">
            Payout: <span className="font-medium">{formatCents(booking.hostPayout)}</span>
          </span>
        </div>
      </div>
      {booking.status === "confirmed" && (
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0"
          onClick={() => onCancel(booking._id)}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

export default function HostBookingsPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const bookings = useQuery(api.bookings.getHostBookings, {});
  const cancelBooking = useMutation(api.bookings.cancelBooking);

  const today = new Date().toISOString().split("T")[0];

  const filtered = (bookings ?? []).filter((b) => {
    if (tab === "cancelled") return b.status === "cancelled";
    if (tab === "past") return b.status === "completed" || (b.status === "confirmed" && b.checkOut < today);
    return (b.status === "pending" || b.status === "confirmed") && b.checkOut >= today;
  });

  async function handleCancel(bookingId: Id<"bookings">) {
    if (!confirm("Cancel this booking? The guest will receive a full refund.")) return;
    await cancelBooking({ bookingId, reason: "Host cancelled" });
    await fetch("/api/bookings/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId }),
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "upcoming", label: "Upcoming" },
    { id: "past", label: "Past" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4">
      <Navbar />
      <h1 className="text-2xl font-bold mb-6">Bookings</h1>

      <div className="flex gap-1 mb-6 border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {bookings === undefined && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      )}

      {bookings !== undefined && filtered.length === 0 && (
        <div className="py-12 text-center">
          <p className="font-medium">No {tab} bookings</p>
        </div>
      )}

      <div className="space-y-4">
        {filtered.map((b) => (
          <BookingRow key={b._id} booking={b} onCancel={handleCancel} />
        ))}
      </div>
    </div>
  );
}
```

Note: `api.users.getUserById` needs to be added to `convex/users.ts` in Step 2 below.

- [ ] **Step 2: Add getUserById to convex/users.ts**

Open `airbnb/convex/users.ts` (read it first to find the end of the file), then append:

```ts
export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.userId);
  },
});
```

Ensure `query` and `v` are already imported at the top — they should be if other queries exist there. If the file doesn't import `v`, add `import { v } from "convex/values";`.

- [ ] **Step 3: Sync Convex**

```bash
cd airbnb && npx convex dev --once
```

- [ ] **Step 4: Commit**

```bash
git add app/(protected)/host/bookings/page.tsx convex/users.ts convex/_generated/
git commit -m "feat: host bookings page and getUserById query"
```

---

## Task 15: Host Stripe onboarding page

**Files:**
- Create: `airbnb/app/(protected)/host/onboarding/stripe/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/app/(protected)/host/onboarding/stripe/page.tsx
"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, CreditCard } from "lucide-react";

export default function StripeOnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const stripeAccount = useQuery(api.stripeAccounts.getStripeAccount, {});

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stripe/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to connect");
      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const isConnected = stripeAccount?.status === "active" && stripeAccount.chargesEnabled;
  const isRestricted = stripeAccount?.status === "restricted" || (stripeAccount && !stripeAccount.chargesEnabled);

  return (
    <div className="mx-auto max-w-xl px-4">
      <Navbar />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Connect Stripe</h1>
          <p className="text-muted-foreground mt-1">
            Accept card payments and receive automatic payouts to your bank account.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            {error}
          </p>
        )}

        {stripeAccount === undefined && (
          <div className="h-24 bg-muted animate-pulse rounded-xl" />
        )}

        {isConnected && (
          <div className="rounded-xl border p-6 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-semibold">Connected</span>
              <Badge variant="default">Active</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Your Stripe account is connected. You&apos;ll receive payouts automatically after each booking.
            </p>
          </div>
        )}

        {isRestricted && (
          <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
              <span className="font-semibold text-yellow-800">Verification required</span>
            </div>
            <p className="text-sm text-yellow-700">
              Stripe needs more information to enable payouts.
            </p>
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              Complete verification
            </Button>
          </div>
        )}

        {!stripeAccount && stripeAccount !== undefined && (
          <div className="rounded-xl border p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">Not connected</p>
                <p className="text-sm text-muted-foreground">
                  Connect your Stripe account to receive payments.
                </p>
              </div>
            </div>
            <Button onClick={handleConnect} disabled={loading} className="w-full">
              {loading ? "Redirecting to Stripe…" : "Connect Stripe account"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(protected)/host/onboarding/stripe/page.tsx
git commit -m "feat: host Stripe Connect onboarding page"
```

---

## Task 16: Host PayPal onboarding page

**Files:**
- Create: `airbnb/app/(protected)/host/onboarding/paypal/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/app/(protected)/host/onboarding/paypal/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

export default function PayPalOnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const paypalAccount = useQuery(api.stripeAccounts.getPaypalAccount, {});
  const upsertPaypal = useMutation(api.stripeAccounts.upsertPaypalAccount);

  const merchantIdInPayPal = searchParams.get("merchantIdInPayPal");
  const trackingId = searchParams.get("trackingId");

  useEffect(() => {
    if (merchantIdInPayPal && trackingId) {
      upsertPaypal({
        paypalMerchantId: merchantIdInPayPal,
        trackingId,
        status: "active",
      }).catch(console.error);
    }
  }, [merchantIdInPayPal, trackingId, upsertPaypal]);

  async function handleConnect() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/paypal/connect", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to connect");
      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  const isConnected = paypalAccount?.status === "active";

  return (
    <div className="mx-auto max-w-xl px-4">
      <Navbar />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Connect PayPal</h1>
          <p className="text-muted-foreground mt-1">
            Accept PayPal payments and receive automatic payouts.
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            {error}
          </p>
        )}

        {paypalAccount === undefined && (
          <div className="h-24 bg-muted animate-pulse rounded-xl" />
        )}

        {isConnected && (
          <div className="rounded-xl border p-6 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="font-semibold">Connected</span>
              <Badge variant="default">Active</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Your PayPal account is connected. Guests can now pay with PayPal.
            </p>
          </div>
        )}

        {!isConnected && paypalAccount !== undefined && (
          <div className="rounded-xl border p-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your PayPal business account to receive payments from guests.
            </p>
            <Button onClick={handleConnect} disabled={loading} className="w-full">
              {loading ? "Redirecting to PayPal…" : "Connect PayPal account"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/(protected)/host/onboarding/paypal/page.tsx
git commit -m "feat: host PayPal Marketplace onboarding page"
```

---

## Task 17: Payment setup banner on host properties page

Add a banner when the host has no payment method connected.

**Files:**
- Modify: `airbnb/app/(protected)/host/properties/page.tsx`

- [ ] **Step 1: Read the current file**

Read `airbnb/app/(protected)/host/properties/page.tsx` to find the right insertion point (just before or after `<Navbar />`).

- [ ] **Step 2: Add imports at the top of the file**

After the existing imports, add:

```tsx
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
```

Note: `useQuery` may already be imported. Check before adding.

- [ ] **Step 3: Add the banner inside the component**

Inside the page component, add the query and banner just after the `<Navbar />` line:

```tsx
const stripeAccount = useQuery(api.stripeAccounts.getStripeAccount, {});
const paypalAccount = useQuery(api.stripeAccounts.getPaypalAccount, {});

const hasPayment =
  stripeAccount?.chargesEnabled || paypalAccount?.status === "active";
const accountsLoaded = stripeAccount !== undefined && paypalAccount !== undefined;
```

Then just after `<Navbar />`:

```tsx
{accountsLoaded && !hasPayment && (
  <div className="mb-6 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
    <p className="text-sm font-medium text-yellow-800">
      Set up payments to receive booking payouts
    </p>
    <div className="mt-2 flex gap-3">
      <Link
        href="/host/onboarding/stripe"
        className="text-sm font-medium text-yellow-700 underline hover:text-yellow-900"
      >
        Connect Stripe
      </Link>
      <Link
        href="/host/onboarding/paypal"
        className="text-sm font-medium text-yellow-700 underline hover:text-yellow-900"
      >
        Connect PayPal
      </Link>
    </div>
  </div>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd airbnb && pnpm tsc --noEmit 2>&1 | grep -v ".next/dev/types" | head -30
```

Expected: no new errors.

- [ ] **Step 5: Final sync and commit**

```bash
cd airbnb && npx convex dev --once
git add app/(protected)/host/properties/page.tsx
git commit -m "feat: payment setup banner on host properties page"
```

---

## Done

Phase 4 is complete when:
- Guest can select dates on property detail, click Reserve, complete Stripe card payment or PayPal payment, and land on a confirmed booking confirmation page
- `/trips` shows the guest's bookings with cancel option
- `/host/bookings` shows the host's incoming bookings
- Hosts can connect Stripe via `/host/onboarding/stripe`
- Hosts can connect PayPal via `/host/onboarding/paypal`
- Booked dates show as disabled on the property calendar
- Nightly cron completes old bookings; 2-hour cron cleans abandoned pending bookings

## Environment variables to fill in before testing

```
# Already set:
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Need filling in:
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_WEBHOOK_ID=
```

For local Stripe webhook testing, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

---

## Task 18: Refund API route

Called after `cancelBooking` mutation — issues the actual Stripe or PayPal refund.

**Files:**
- Create: `airbnb/app/api/bookings/refund/route.ts`

- [ ] **Step 1: Add a refund helper to lib/paypal.ts**

The `refundPayPalCapture` function is already defined in `lib/paypal.ts` from Task 5 — no change needed.

- [ ] **Step 2: Create app/api/bookings/refund/route.ts**

```ts
// airbnb/app/api/bookings/refund/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { stripe } from "@/lib/stripe";
import { refundPayPalCapture } from "@/lib/paypal";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bookingId } = (await req.json()) as { bookingId: string };

    const booking = await convex.query(api.bookings.getBookingById, {
      bookingId: bookingId as Id<"bookings">,
    });
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

    if (booking.paymentMethod === "stripe" && booking.paymentIntentId) {
      await stripe.refunds.create({ payment_intent: booking.paymentIntentId });
    } else if (booking.paymentMethod === "paypal" && booking.paypalCaptureId) {
      await refundPayPalCapture(booking.paypalCaptureId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[bookings/refund]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/bookings/refund/route.ts
git commit -m "feat: add refund API route for cancellations"
```
