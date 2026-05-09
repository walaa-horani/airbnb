# Phase 4: Bookings & Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests select dates, pay via Stripe, and track their bookings — while hosts see and manage incoming reservations.

**Architecture:** Guest selects dates on the property detail page → navigates to `/checkout/[propertyId]` with dates in URL → confirms details → clicks "Pay" → a Convex mutation creates a pending booking and a Next.js API route creates a Stripe PaymentIntent with `transfer_data` to the host's Connect account → Stripe Elements collects the card → on success Stripe redirects to `/booking-confirmation/[bookingId]` while a Convex HTTP webhook fires `payment_intent.succeeded` to flip the booking to `confirmed`.

**Tech Stack:** Next.js 16 App Router, Convex, Stripe Connect Express, `@stripe/react-stripe-js`, `@stripe/stripe-js`, `react-day-picker` (already installed), Tailwind v4, shadcn/ui

**Key facts from codebase:**
- Prices stored in **cents** (`pricePerNight`, `cleaningFee` are integers in cents)
- `createBooking`, `confirmBooking`, `getGuestBookings`, `getHostBookings`, `getBookedDates` already exist in `convex/bookings.ts`
- `cleanupAbandonedBookings` (2-hour TTL on pending bookings) already exists
- `stripeAccounts` table exists — hosts have `stripeAccountId` after onboarding
- `users.stripeCustomerId` added in pre-Phase-4 work
- Booking widget stub already in `PropertyDetailClient.tsx` with hardcoded "1 night" pricing and `<a href="/checkout/${property._id}">Reserve</a>`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/bookings.ts` | Add `confirmBookingFromWebhook` internalMutation |
| Modify | `convex/stripeAccounts.ts` | Add `getStripeAccountForHost` public query |
| Modify | `convex/users.ts` | Add `setStripeCustomerId` mutation |
| Modify | `convex/webhooks/stripe.ts` | Handle `payment_intent.succeeded` |
| Create | `app/api/stripe/checkout/route.ts` | Create PaymentIntent with Connect transfer |
| Modify | `app/properties/[id]/PropertyDetailClient.tsx` | Wire up date/guest selection → checkout link |
| Create | `app/(protected)/checkout/[propertyId]/page.tsx` | Server wrapper, reads searchParams |
| Create | `app/(protected)/checkout/[propertyId]/CheckoutClient.tsx` | Booking summary + Stripe Elements form |
| Create | `app/(protected)/booking-confirmation/[bookingId]/page.tsx` | Payment success/failure page |
| Create | `app/(protected)/trips/page.tsx` | Guest bookings list |
| Create | `app/(protected)/host/bookings/page.tsx` | Host bookings list |

---

## Task 1: Install Stripe frontend SDK

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install packages**

```bash
cd airbnb && pnpm add @stripe/react-stripe-js @stripe/stripe-js
```

Expected: both packages added to `dependencies`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "@stripe" | head -5
```

Expected: no errors mentioning `@stripe`.

- [ ] **Step 3: Commit**

```bash
git add airbnb/package.json airbnb/pnpm-lock.yaml
git commit -m "feat: install @stripe/react-stripe-js and @stripe/stripe-js"
```

---

## Task 2: Add Convex backend helpers

Three small additions to existing Convex files that the API route and webhook need.

**Files:**
- Modify: `convex/bookings.ts`
- Modify: `convex/stripeAccounts.ts`
- Modify: `convex/users.ts`

- [ ] **Step 1: Add `confirmBookingFromWebhook` to `convex/bookings.ts`**

At the top of the file, add `Id` to the imports:
```ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
```

Then append at the end of `convex/bookings.ts`:

```ts
// Called only from Stripe webhook — never from client
export const confirmBookingFromWebhook = internalMutation({
  args: {
    bookingId: v.string(),
    paymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId as Id<"bookings">);
    if (!booking || booking.status === "confirmed") return;
    await ctx.db.patch(booking._id, {
      status: "confirmed",
      paymentIntentId: args.paymentIntentId,
    });
  },
});
```

- [ ] **Step 2: Add `getStripeAccountForHost` to `convex/stripeAccounts.ts`**

Append at the end of `convex/stripeAccounts.ts`:

```ts
// Used by checkout API route to get the host's Connect account for transfer_data
export const getStripeAccountForHost = query({
  args: { hostId: v.id("users") },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.hostId))
      .unique();
    if (!account) return null;
    return { stripeAccountId: account.stripeAccountId, chargesEnabled: account.chargesEnabled };
  },
});
```

- [ ] **Step 3: Add `setStripeCustomerId` to `convex/users.ts`**

Append at the end of `convex/users.ts`:

```ts
// Called by checkout API route to lazily create a Stripe customer for pre-sync users
export const setStripeCustomerId = mutation({
  args: { stripeCustomerId: v.string() },
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
    await ctx.db.patch(user._id, { stripeCustomerId: args.stripeCustomerId });
  },
});
```

- [ ] **Step 4: Push to Convex and verify types**

```bash
cd airbnb && npx convex dev --once
```

Expected: Convex regenerates `_generated/api.d.ts` with the new functions, no errors.

- [ ] **Step 5: Commit**

```bash
git add airbnb/convex/bookings.ts airbnb/convex/stripeAccounts.ts airbnb/convex/users.ts
git commit -m "feat: add confirmBookingFromWebhook, getStripeAccountForHost, setStripeCustomerId"
```

---

## Task 3: Create `/api/stripe/checkout` route

Creates a Stripe PaymentIntent with `transfer_data` to the host's Connect account.

**Files:**
- Create: `app/api/stripe/checkout/route.ts`

- [ ] **Step 1: Create the file**

```ts
// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-04-22.dahlia",
});

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Token error" }, { status: 401 });
  convex.setAuth(token);

  const { bookingId } = await req.json() as { bookingId: string };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  // Fetch booking and verify it belongs to this guest
  const booking = await convex.query(api.bookings.getBooking, {
    bookingId: bookingId as Id<"bookings">,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status !== "pending") return NextResponse.json({ error: "Booking already processed" }, { status: 400 });

  // Get host's Connect account
  const hostAccount = await convex.query(api.stripeAccounts.getStripeAccountForHost, {
    hostId: booking.hostId,
  });
  if (!hostAccount?.chargesEnabled) {
    return NextResponse.json({ error: "Host payment account not ready" }, { status: 400 });
  }

  // Get or create guest's Stripe customer
  const user = await convex.query(api.users.getCurrentUser, {});
  let stripeCustomerId = user?.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user?.email,
      name: user?.name || undefined,
      metadata: { convexUserId: user?._id ?? "" },
    });
    stripeCustomerId = customer.id;
    await convex.mutation(api.users.setStripeCustomerId, { stripeCustomerId });
  }

  // Create PaymentIntent — charge guest, transfer host's share to their Connect account
  const paymentIntent = await stripe.paymentIntents.create({
    amount: booking.totalAmount,
    currency: "usd",
    customer: stripeCustomerId,
    automatic_payment_methods: { enabled: true },
    transfer_data: {
      destination: hostAccount.stripeAccountId,
      amount: booking.hostPayout,
    },
    metadata: {
      bookingId: booking._id,
      propertyId: booking.propertyId,
      guestId: booking.guestId,
      hostId: booking.hostId,
    },
  });

  return NextResponse.json({ clientSecret: paymentIntent.client_secret });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep "checkout/route" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add airbnb/app/api/stripe/checkout/route.ts
git commit -m "feat: add /api/stripe/checkout route to create PaymentIntent with Connect transfer"
```

---

## Task 4: Update Stripe webhook for `payment_intent.succeeded`

**Files:**
- Modify: `convex/webhooks/stripe.ts`

- [ ] **Step 1: Replace full file contents**

```ts
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  }
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === v1;
}

export const stripeWebhook = httpAction(async (ctx, req) => {
  const body = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");

  if (!signatureHeader) return new Response("No signature", { status: 400 });

  const valid = await verifyStripeSignature(
    body,
    signatureHeader,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  if (event.type === "account.updated") {
    const account = event.data.object as {
      id: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
    };
    await ctx.runMutation(
      internal.stripeAccounts.updateStripeAccountByStripeId,
      {
        stripeAccountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      },
    );
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as {
      id: string;
      metadata: Record<string, string>;
    };
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      await ctx.runMutation(internal.bookings.confirmBookingFromWebhook, {
        bookingId,
        paymentIntentId: pi.id,
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
```

- [ ] **Step 2: Add `payment_intent.succeeded` to Stripe webhook endpoint in Dashboard**

In Stripe Dashboard → Developers → Webhooks → click your endpoint → Edit → add event `payment_intent.succeeded`.

- [ ] **Step 3: Push to Convex**

```bash
cd airbnb && npx convex dev --once
```

Expected: deploys cleanly.

- [ ] **Step 4: Commit**

```bash
git add airbnb/convex/webhooks/stripe.ts
git commit -m "feat: handle payment_intent.succeeded in Stripe webhook to confirm bookings"
```

---

## Task 5: Upgrade property detail booking widget

Wires up the DayPicker for date selection and connects the Reserve button to the checkout URL with the chosen dates and guest count.

**Files:**
- Modify: `app/properties/[id]/PropertyDetailClient.tsx`

- [ ] **Step 1: Replace the booking widget section**

In `PropertyDetailClient.tsx`, the current state has:
- `const [lightboxIndex, setLightboxIndex] = useState(-1);`
- A DayPicker in the left column with no state
- A static booking widget in the right column showing "1 night" hardcoded

Replace the entire file contents with the following:

```tsx
// app/properties/[id]/PropertyDetailClient.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
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

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function PropertyDetailClient({ property }: { property: Doc<"properties"> }) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [range, setRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState(1);

  const images = useQuery(api.propertyImages.getPropertyImages, { propertyId: property._id });
  const bookedDates = useQuery(api.bookings.getBookedDates, { propertyId: property._id });

  const allImages = images ?? [];
  const lightboxSlides = allImages.map((img) => ({ src: img.url }));

  // Build disabled date set from confirmed bookings
  const disabledDates: Date[] = [];
  for (const b of bookedDates ?? []) {
    const start = new Date(b.checkIn);
    const end = new Date(b.checkOut);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      disabledDates.push(new Date(d));
    }
  }

  const checkIn = range?.from;
  const checkOut = range?.to;
  const nights =
    checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
      : 0;

  const subtotal = property.pricePerNight * nights;
  const cleaningFee = nights > 0 ? property.cleaningFee : 0;
  const serviceFee = Math.round((subtotal + cleaningFee) * 0.05);
  const total = subtotal + cleaningFee + serviceFee;

  const checkoutHref =
    checkIn && checkOut && nights >= property.minNights
      ? `/checkout/${property._id}?checkIn=${toDateString(checkIn)}&checkOut=${toDateString(checkOut)}&guests=${guests}`
      : null;

  const reserveDisabled = !checkoutHref || guests > property.maxGuests;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold mb-1">{property.title}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
        {property.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Star className="h-4 w-4 fill-current" />
            {property.avgRating.toFixed(1)}
            <span className="text-muted-foreground font-normal">({property.reviewCount} reviews)</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          {property.city}, {property.country}
        </span>
        <Badge variant="outline" className="capitalize">{property.type}</Badge>
      </div>

      {/* Gallery */}
      <div
        className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden mb-8 cursor-pointer h-[400px]"
        onClick={() => allImages.length > 0 && setLightboxIndex(0)}
      >
        <div className="col-span-2 row-span-2 relative">
          {property.coverImageUrl ? (
            <Image src={property.coverImageUrl} alt={property.title} fill className="object-cover" />
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
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{property.maxGuests} guests</span>
            <span className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" />
              {property.bedrooms} bedroom{property.bedrooms !== 1 ? "s" : ""} · {property.beds} bed{property.beds !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" />{property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Check-in {property.checkInTime} · Check-out {property.checkOutTime}</span>
          </div>

          <Separator />

          <div>
            <h2 className="text-lg font-semibold mb-3">About this place</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{property.description}</p>
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
            <h2 className="text-lg font-semibold mb-3">Select dates</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Minimum stay: {property.minNights} night{property.minNights !== 1 ? "s" : ""}.
            </p>
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
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

            {/* Date summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Check-in</p>
                <p className="font-medium">{checkIn ? toDateString(checkIn) : "—"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Check-out</p>
                <p className="font-medium">{checkOut ? toDateString(checkOut) : "—"}</p>
              </div>
            </div>

            {/* Guest counter */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Guests</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  disabled={guests <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{guests}</span>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.min(property.maxGuests, g + 1))}
                  disabled={guests >= property.maxGuests}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Pricing breakdown — only shown when dates selected */}
            {nights > 0 && (
              <div className="space-y-2 text-sm">
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{formatCents(property.pricePerNight)} × {nights} night{nights !== 1 ? "s" : ""}</span>
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
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCents(total)}</span>
                </div>
              </div>
            )}

            {checkoutHref ? (
              <Button className="w-full" size="lg" asChild>
                <Link href={checkoutHref}>Reserve</Link>
              </Button>
            ) : (
              <Button className="w-full" size="lg" disabled>
                {!checkIn || !checkOut
                  ? "Select dates"
                  : nights < property.minNights
                    ? `Minimum ${property.minNights} nights`
                    : "Reserve"}
              </Button>
            )}

            <p className="text-center text-xs text-muted-foreground">You won&apos;t be charged yet</p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Navigate to any published property. Expected:
- DayPicker shows with booked dates grayed out
- Selecting a date range updates check-in/check-out boxes and pricing breakdown in the widget
- Guest counter respects `maxGuests`
- Reserve button becomes active when valid dates are selected, disabled with "Select dates" message otherwise
- Clicking Reserve navigates to `/checkout/[propertyId]?checkIn=...&checkOut=...&guests=...`

- [ ] **Step 3: Commit**

```bash
git add airbnb/app/properties/[id]/PropertyDetailClient.tsx
git commit -m "feat: wire up booking widget with date selection, guest counter, and dynamic pricing"
```

---

## Task 6: Build the checkout page

A two-stage page: (1) booking summary → (2) Stripe Elements payment form.

**Files:**
- Create: `app/(protected)/checkout/[propertyId]/page.tsx`
- Create: `app/(protected)/checkout/[propertyId]/CheckoutClient.tsx`

- [ ] **Step 1: Create the server wrapper**

```tsx
// app/(protected)/checkout/[propertyId]/page.tsx
import { CheckoutClient } from "./CheckoutClient";
import { Id } from "@/convex/_generated/dataModel";

interface Props {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { propertyId } = await params;
  const { checkIn, checkOut, guests } = await searchParams;
  return (
    <CheckoutClient
      propertyId={propertyId as Id<"properties">}
      checkIn={checkIn ?? ""}
      checkOut={checkOut ?? ""}
      guests={Number(guests ?? 1)}
    />
  );
}
```

- [ ] **Step 2: Create CheckoutClient**

```tsx
// app/(protected)/checkout/[propertyId]/CheckoutClient.tsx
"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

interface Props {
  propertyId: Id<"properties">;
  checkIn: string;
  checkOut: string;
  guests: number;
}

// Inner payment form — rendered inside <Elements> provider
function PaymentForm({ bookingId, amount }: { bookingId: Id<"bookings">; amount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${appUrl}/booking-confirmation/${bookingId}`,
      },
    });

    // Only reaches here if Stripe didn't redirect (i.e. an error occurred)
    if (stripeError) {
      setError(stripeError.message ?? "Payment failed. Please try again.");
      setPaying(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      {error && (
        <p className="text-sm text-red-600 rounded-lg bg-red-50 border border-red-200 p-3">{error}</p>
      )}
      <Button onClick={handlePay} disabled={paying || !stripe} className="w-full" size="lg">
        {paying ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
        ) : (
          `Pay ${formatCents(amount)}`
        )}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Secured by Stripe · Your card is charged immediately
      </p>
    </div>
  );
}

export function CheckoutClient({ propertyId, checkIn, checkOut, guests }: Props) {
  const router = useRouter();
  const property = useQuery(api.properties.getProperty, { propertyId });
  const createBooking = useMutation(api.bookings.createBooking);

  type Stage = "summary" | "loading" | "payment" | "error";
  const [stage, setStage] = useState<Stage>("summary");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [bookingId, setBookingId] = useState<Id<"bookings"> | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const nights =
    checkIn && checkOut
      ? Math.round(
          (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000,
        )
      : 0;

  const handleProceed = useCallback(async () => {
    if (!property || !checkIn || !checkOut) return;
    setStage("loading");
    setErrorMsg(null);

    try {
      // 1. Create pending booking in Convex
      const newBookingId = await createBooking({
        propertyId,
        checkIn,
        checkOut,
        guests,
        paymentMethod: "stripe",
      });

      // 2. Create Stripe PaymentIntent
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: newBookingId }),
      });

      const data = await res.json() as { clientSecret?: string; error?: string };

      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error ?? "Failed to initialize payment");
      }

      setBookingId(newBookingId as Id<"bookings">);
      setClientSecret(data.clientSecret);
      setStage("payment");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
      setStage("error");
    }
  }, [property, checkIn, checkOut, guests, propertyId, createBooking]);

  if (property === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted mb-4" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-lg font-medium">Property not found</p>
        <Button asChild className="mt-4"><Link href="/">Go home</Link></Button>
      </div>
    );
  }

  if (!checkIn || !checkOut || nights <= 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-lg font-medium">Invalid dates</p>
        <Button asChild className="mt-4" variant="outline">
          <Link href={`/properties/${propertyId}`}>← Back to property</Link>
        </Button>
      </div>
    );
  }

  const subtotal = property.pricePerNight * nights;
  const serviceFee = Math.round((subtotal + property.cleaningFee) * 0.05);
  const total = subtotal + property.cleaningFee + serviceFee;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href={`/properties/${propertyId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to property
      </Link>

      <h1 className="text-2xl font-bold mb-6">Confirm and pay</h1>

      {/* Booking summary card */}
      <div className="rounded-xl border p-6 mb-6 space-y-4">
        <h2 className="font-semibold">{property.title}</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Check-in</p>
            <p className="font-medium">{formatDate(checkIn)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Check-out</p>
            <p className="font-medium">{formatDate(checkOut)}</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{guests} guest{guests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}</p>

        <Separator />

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{formatCents(property.pricePerNight)} × {nights} night{nights !== 1 ? "s" : ""}</span>
            <span>{formatCents(subtotal)}</span>
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
          <div className="flex justify-between font-semibold text-base">
            <span>Total (USD)</span>
            <span>{formatCents(total)}</span>
          </div>
        </div>
      </div>

      {/* Stage: summary */}
      {stage === "summary" && (
        <Button onClick={handleProceed} className="w-full" size="lg">
          Continue to payment
        </Button>
      )}

      {/* Stage: loading */}
      {stage === "loading" && (
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Preparing your payment…</span>
        </div>
      )}

      {/* Stage: error */}
      {stage === "error" && (
        <div className="space-y-3">
          <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-800">
            {errorMsg}
          </div>
          <Button variant="outline" onClick={() => setStage("summary")} className="w-full">
            Try again
          </Button>
        </div>
      )}

      {/* Stage: payment */}
      {stage === "payment" && clientSecret && bookingId && (
        <div className="space-y-4">
          <h2 className="font-semibold">Payment details</h2>
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "stripe" },
            }}
          >
            <PaymentForm bookingId={bookingId} amount={total} />
          </Elements>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Test in browser**

1. Go to a published property, select dates, click Reserve
2. Checkout page shows property summary + pricing
3. Click "Continue to payment" — spinner shows, then Stripe Elements form appears
4. Use test card `4242 4242 4242 4242`, any future expiry, any CVC
5. Click Pay → Stripe redirects to `/booking-confirmation/[bookingId]`

- [ ] **Step 4: Commit**

```bash
git add airbnb/app/\(protected\)/checkout/
git commit -m "feat: checkout page with booking summary and Stripe Elements payment form"
```

---

## Task 7: Build booking confirmation page

**Files:**
- Create: `app/(protected)/booking-confirmation/[bookingId]/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/(protected)/booking-confirmation/[bookingId]/page.tsx
"use client";

import { use, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Calendar, Users } from "lucide-react";

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function ConfirmationContent({ bookingId }: { bookingId: Id<"bookings"> }) {
  const booking = useQuery(api.bookings.getBooking, { bookingId });
  const property = useQuery(
    api.properties.getProperty,
    booking ? { propertyId: booking.propertyId } : "skip",
  );
  const searchParams = useSearchParams();
  const redirectStatus = searchParams.get("redirect_status");

  if (booking === undefined) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading your booking…</span>
      </div>
    );
  }

  // Payment explicitly failed
  if (redirectStatus === "failed" || redirectStatus === "canceled") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Payment failed</h1>
        <p className="text-muted-foreground mb-6">
          Your payment was not processed. Your booking has not been confirmed.
        </p>
        <Button asChild>
          <Link href={`/properties/${booking?.propertyId ?? ""}`}>Try again</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="text-center mb-8">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">
          {booking?.status === "confirmed" ? "Booking confirmed!" : "Payment received!"}
        </h1>
        <p className="text-muted-foreground">
          {booking?.status === "confirmed"
            ? "Your stay is booked. Check your email for details."
            : "Your payment is processing. Your booking will be confirmed shortly."}
        </p>
      </div>

      {booking && property && (
        <div className="rounded-xl border p-6 space-y-4 mb-6">
          <h2 className="font-semibold text-lg">{property.title}</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground">Dates</p>
                <p className="font-medium">{formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Users className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-muted-foreground">Guests</p>
                <p className="font-medium">{booking.guests} guest{booking.guests !== 1 ? "s" : ""}</p>
              </div>
            </div>
            <div className="flex justify-between font-semibold border-t pt-3">
              <span>Total paid</span>
              <span>{formatCents(booking.totalAmount)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button asChild>
          <Link href="/trips">View my trips</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </div>
  );
}

interface Props {
  params: Promise<{ bookingId: string }>;
}

export default function BookingConfirmationPage({ params }: Props) {
  const { bookingId } = use(params);
  return (
    <Suspense>
      <ConfirmationContent bookingId={bookingId as Id<"bookings">} />
    </Suspense>
  );
}
```

- [ ] **Step 2: Test in browser**

After completing a test payment (Task 6), you should land here. Expected:
- Green checkmark + "Booking confirmed!" (or "Payment received!" if webhook hasn't fired yet)
- Booking details: property name, dates, guest count, total paid
- "View my trips" and "Back to home" buttons

- [ ] **Step 3: Commit**

```bash
git add "airbnb/app/(protected)/booking-confirmation/"
git commit -m "feat: booking confirmation page with status display"
```

---

## Task 8: Build guest trips page

**Files:**
- Create: `app/(protected)/trips/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/(protected)/trips/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pending",   variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function TripsPage() {
  const bookings = useQuery(api.bookings.getGuestBookings, {});
  const cancelBooking = useMutation(api.bookings.cancelBooking);
  const [cancelId, setCancelId] = useState<Id<"bookings"> | null>(null);

  const handleCancel = async () => {
    if (!cancelId) return;
    await cancelBooking({ bookingId: cancelId, reason: "Cancelled by guest" });
    setCancelId(null);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Your trips</h1>

      {bookings === undefined && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {bookings?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium">No trips yet</p>
          <p className="text-muted-foreground mt-1">When you book a place, it will appear here.</p>
          <Button asChild className="mt-4"><Link href="/search">Find a place</Link></Button>
        </div>
      )}

      <div className="space-y-4">
        {bookings?.map((booking) => (
          <BookingCard
            key={booking._id}
            booking={booking}
            onCancel={() => setCancelId(booking._id)}
          />
        ))}
      </div>

      <AlertDialog open={!!cancelId} onOpenChange={(open) => !open && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Please check the cancellation policy before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep trip</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Cancel trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BookingCard({
  booking,
  onCancel,
}: {
  booking: {
    _id: Id<"bookings">;
    propertyId: Id<"properties">;
    checkIn: string;
    checkOut: string;
    guests: number;
    status: string;
    totalAmount: number;
    paymentMethod: string;
  };
  onCancel: () => void;
}) {
  const property = useQuery(api.properties.getProperty, { propertyId: booking.propertyId });
  const statusConfig = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "secondary" as const };

  return (
    <div className="rounded-xl border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={`/properties/${booking.propertyId}`} className="font-semibold hover:underline line-clamp-1">
            {property?.title ?? <span className="text-muted-foreground text-sm">Loading…</span>}
          </Link>
          {property && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5" />
              {property.city}, {property.country}
            </p>
          )}
        </div>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Calendar className="h-4 w-4" />
        <span>{formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}</span>
        <span>· {booking.guests} guest{booking.guests !== 1 ? "s" : ""}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-semibold">{formatCents(booking.totalAmount)}</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/booking-confirmation/${booking._id}`}>Details</Link>
          </Button>
          {(booking.status === "pending" || booking.status === "confirmed") && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Navigate to `/trips`. Expected:
- List of all bookings for the current user
- Each card shows property name, dates, guest count, total, status badge
- Cancel button appears for pending/confirmed bookings
- Confirm dialog before cancelling

- [ ] **Step 3: Commit**

```bash
git add "airbnb/app/(protected)/trips/page.tsx"
git commit -m "feat: guest trips page with booking list and cancel flow"
```

---

## Task 9: Build host bookings page

**Files:**
- Create: `app/(protected)/host/bookings/page.tsx`

- [ ] **Step 1: Create the file**

```tsx
// app/(protected)/host/bookings/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, DollarSign, Users } from "lucide-react";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending:   { label: "Pending",   variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

function BookingRow({ booking }: {
  booking: {
    _id: Id<"bookings">;
    propertyId: Id<"properties">;
    checkIn: string;
    checkOut: string;
    guests: number;
    status: string;
    totalAmount: number;
    hostPayout: number;
    platformFee: number;
  };
}) {
  const property = useQuery(api.properties.getProperty, { propertyId: booking.propertyId });
  const statusConfig = STATUS_BADGE[booking.status] ?? { label: booking.status, variant: "secondary" as const };

  return (
    <div className="rounded-xl border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link href={`/properties/${booking.propertyId}`} className="font-semibold hover:underline line-clamp-1">
            {property?.title ?? <span className="text-muted-foreground text-sm">Loading…</span>}
          </Link>
        </div>
        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Calendar className="h-4 w-4 shrink-0" />
          <span>{formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4 shrink-0" />
          <span>{booking.guests} guest{booking.guests !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 shrink-0 text-green-600" />
          <span className="font-semibold text-green-700">{formatCents(booking.hostPayout)}</span>
          <span className="text-muted-foreground text-xs">(guest paid {formatCents(booking.totalAmount)})</span>
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/booking-confirmation/${booking._id}`}>View details</Link>
        </Button>
      </div>
    </div>
  );
}

export default function HostBookingsPage() {
  const bookings = useQuery(api.bookings.getHostBookings, {});

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">Reservations</h1>
      <p className="text-muted-foreground mb-8">All bookings across your properties.</p>

      {bookings === undefined && (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {bookings?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium">No reservations yet</p>
          <p className="text-muted-foreground mt-1">When guests book your properties, they&apos;ll appear here.</p>
        </div>
      )}

      <div className="space-y-4">
        {bookings?.map((booking) => (
          <BookingRow key={booking._id} booking={booking} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add "Bookings" link to the host navigation in `components/Navbar.tsx`**

Find:
```tsx
      <Link
        href="/host/properties"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <LayoutList className="h-4 w-4" />
        My listings
      </Link>
```

Replace with:
```tsx
      <Link
        href="/host/properties"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <LayoutList className="h-4 w-4" />
        My listings
      </Link>
      <Link
        href="/host/bookings"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Calendar className="h-4 w-4" />
        Reservations
      </Link>
```

Also add `Calendar` to the lucide import at the top of `Navbar.tsx`:
```tsx
import { PlusCircle, LayoutList, Plane, Search, Calendar } from "lucide-react";
```

- [ ] **Step 3: Test in browser**

Navigate to `/host/bookings`. Expected:
- List of all bookings for the host's properties
- Each row shows property name, dates, guest count, host payout (green), and guest total
- "Reservations" link visible in navbar when logged in

- [ ] **Step 4: Commit**

```bash
git add "airbnb/app/(protected)/host/bookings/page.tsx" airbnb/components/Navbar.tsx
git commit -m "feat: host reservations page and navbar link"
```

---

---

## Task 10: PayPal Connect onboarding for hosts

Mirrors Stripe Connect: hosts connect their PayPal account via PayPal's Partner Referral API so they can receive payouts. The payouts page gets a second "PayPal" section alongside Stripe.

**Environment variables required (must be in `.env.local` before testing):**
- `PAYPAL_CLIENT_ID` — platform app client ID (from PayPal Developer Dashboard)
- `PAYPAL_CLIENT_SECRET` — platform app client secret
- `PAYPAL_PARTNER_ID` — platform's own PayPal Merchant ID (found in PayPal account settings)
- `PAYPAL_API_BASE` — `https://api-m.sandbox.paypal.com` for sandbox, `https://api-m.paypal.com` for production

**Files:**
- Create: `convex/paypalAccounts.ts`
- Create: `app/api/paypal/connect/route.ts`
- Create: `app/api/paypal/connect/return/route.ts`
- Modify: `app/(protected)/host/payouts/page.tsx`

- [ ] **Step 1: Create `convex/paypalAccounts.ts`**

```ts
// convex/paypalAccounts.ts
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyPayPalAccount = query({
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
    return await ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const upsertPayPalAccount = mutation({
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
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        paypalMerchantId: args.paypalMerchantId,
        trackingId: args.trackingId,
        status: args.status,
      });
      return existing._id;
    }

    return await ctx.db.insert("paypalAccounts", {
      userId: user._id,
      paypalMerchantId: args.paypalMerchantId,
      trackingId: args.trackingId,
      status: args.status,
    });
  },
});

export const activatePayPalAccount = internalMutation({
  args: { trackingId: v.string(), merchantId: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("paypalAccounts")
      .filter((q) => q.eq(q.field("trackingId"), args.trackingId))
      .unique();
    if (!account) return;
    await ctx.db.patch(account._id, {
      paypalMerchantId: args.merchantId,
      status: "active",
    });
  },
});
```

- [ ] **Step 2: Push to Convex**

```bash
cd airbnb && npx convex dev --once
```

Expected: deploys cleanly, `api.paypalAccounts.*` functions visible in generated types.

- [ ] **Step 3: Create `app/api/paypal/connect/route.ts`**

```ts
// app/api/paypal/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
const apiBase = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

async function getPayPalToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID!}:${process.env.PAYPAL_CLIENT_SECRET!}`,
  ).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json() as { access_token: string };
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Token error" }, { status: 401 });
  convex.setAuth(token);

  const trackingId = `host-${userId}-${Date.now()}`;
  const accessToken = await getPayPalToken();

  const res = await fetch(`${apiBase}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracking_id: trackingId,
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
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      partner_config_override: {
        return_url: `${appUrl}/api/paypal/connect/return?trackingId=${trackingId}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("PayPal partner-referrals error:", err);
    return NextResponse.json({ error: "Failed to create PayPal referral" }, { status: 500 });
  }

  const data = await res.json() as { links: Array<{ rel: string; href: string }> };
  const actionLink = data.links.find((l) => l.rel === "action_url");
  if (!actionLink) return NextResponse.json({ error: "No action URL returned by PayPal" }, { status: 500 });

  // Store a pending record so we can match on return
  await convex.mutation(api.paypalAccounts.upsertPayPalAccount, {
    paypalMerchantId: "",
    trackingId,
    status: "pending",
  });

  return NextResponse.json({ url: actionLink.href });
}
```

- [ ] **Step 4: Create `app/api/paypal/connect/return/route.ts`**

```ts
// app/api/paypal/connect/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

export async function GET(req: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.redirect(`${appUrl}/sign-in`);
  convex.setAuth(token);

  const { searchParams } = new URL(req.url);
  const trackingId = searchParams.get("trackingId") ?? "";
  const merchantId = searchParams.get("merchantIdInPayPal") ?? "";
  const permissionsGranted = searchParams.get("permissionsGranted") === "true";

  if (merchantId && permissionsGranted) {
    await convex.mutation(api.paypalAccounts.upsertPayPalAccount, {
      paypalMerchantId: merchantId,
      trackingId,
      status: "active",
    });
  }

  return NextResponse.redirect(`${appUrl}/host/payouts?paypal=return`);
}
```

- [ ] **Step 5: Update `app/(protected)/host/payouts/page.tsx` to add PayPal section**

At the top of the file, add the PayPal query and PayPal handler to `PayoutsContent`:

After the existing `stripeAccount` query:
```tsx
  const paypalAccount = useQuery(api.paypalAccounts.getMyPayPalAccount, {});
```

After `const stripeParam = searchParams.get("stripe");` line:
```tsx
  const paypalParam = searchParams.get("paypal");
```

Add a `handleConnectPayPal` handler alongside `handleConnect`:
```tsx
  const handleConnectPayPal = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/paypal/connect", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Failed to start PayPal onboarding.");
        setLoading(false);
      }
    } catch {
      setError("Failed to connect to PayPal. Please try again.");
      setLoading(false);
    }
  };
```

After the Stripe section (and `{stripeAccount && <AccountDetails ... />}` block), add the PayPal section:

```tsx
      {/* ─── PayPal section ─── */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-1">PayPal</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Optionally connect your PayPal account to accept PayPal payments from guests.
        </p>

        {paypalParam === "return" && paypalAccount?.status !== "active" && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <Clock className="h-4 w-4 mt-0.5 shrink-0" />
            <p className="text-sm">
              Thanks for connecting your PayPal account. We&apos;re verifying the connection — this usually takes a moment.
            </p>
          </div>
        )}

        {paypalAccount === undefined ? (
          <Card>
            <CardContent className="py-8">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
            </CardContent>
          </Card>
        ) : paypalAccount?.status === "active" ? (
          <Card className="border-green-200 bg-green-50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle className="text-green-900">PayPal connected</CardTitle>
                    <CardDescription className="text-green-700">
                      Merchant ID: {paypalAccount.paypalMerchantId}
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-green-600 hover:bg-green-600">Active</Badge>
              </div>
            </CardHeader>
          </Card>
        ) : paypalAccount?.status === "pending" ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                    <Clock className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <CardTitle>Setup incomplete</CardTitle>
                    <CardDescription>Finish PayPal onboarding to receive payouts</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">Pending</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Button onClick={handleConnectPayPal} disabled={loading} className="w-full">
                {loading ? "Redirecting to PayPal…" : "Complete PayPal setup"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <CreditCard className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <CardTitle>Connect your PayPal account</CardTitle>
                  <CardDescription>Accept PayPal payments from guests</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  Guests pay with their PayPal balance or cards
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  Funds go directly to your PayPal account
                </li>
              </ul>
              <Button onClick={handleConnectPayPal} disabled={loading} className="w-full">
                {loading ? "Redirecting to PayPal…" : "Connect with PayPal"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep -E "paypal|payouts" | head -20
```

Expected: no errors.

- [ ] **Step 7: Test in browser**

Navigate to `/host/payouts`. Expected:
- Stripe section unchanged at top
- PayPal section appears below with "Connect with PayPal" button
- Clicking button redirects to PayPal sandbox onboarding
- After completing, redirects back to `/host/payouts?paypal=return` and shows "PayPal connected" card with merchant ID

Note: For sandbox testing, use PayPal sandbox business account credentials. Set these in `.env.local`:
```
PAYPAL_CLIENT_ID=<sandbox app client ID>
PAYPAL_CLIENT_SECRET=<sandbox app client secret>
PAYPAL_PARTNER_ID=<your sandbox merchant ID>
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
```

- [ ] **Step 8: Commit**

```bash
git add airbnb/convex/paypalAccounts.ts \
  "airbnb/app/api/paypal/" \
  "airbnb/app/(protected)/host/payouts/page.tsx"
git commit -m "feat: PayPal Connect onboarding for hosts"
```

---

## Done

Phase 4 is complete when:
- Guest can select dates on property page, see live pricing, and click Reserve ✓
- Checkout page shows booking summary and Stripe Elements payment form ✓
- Test payment with card `4242 4242 4242 4242` goes through and redirects to confirmation ✓
- Confirmation page shows booking details ✓
- `/trips` shows all guest bookings with cancel option ✓
- `/host/bookings` shows all host reservations with payout amounts ✓
- Stripe webhook confirms booking in Convex after payment ✓
