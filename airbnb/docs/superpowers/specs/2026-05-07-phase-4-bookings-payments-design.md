# Phase 4: Bookings & Payments — Design Spec

**Date:** 2026-05-07  
**Status:** Approved

---

## Goal

Build the complete booking and payment flow: guests can select dates, pay via Stripe or PayPal, and receive a confirmed booking. Hosts onboard their Stripe Connect Express and PayPal Marketplace accounts to receive payouts. A nightly cron completes past bookings automatically.

---

## Architecture

**Approach:** Next.js API routes handle all payment provider communication. Convex stores all app state. Webhooks from Stripe/PayPal call Convex mutations to update booking status. No payment logic lives inside Convex functions.

```
Guest → Checkout Page
  → Convex createBooking (pending)
  → API route creates Stripe Session / PayPal Order
  → Guest pays on Stripe/PayPal hosted page
  → Webhook → API route → Convex confirmBooking (confirmed)
  → Redirect → /booking-confirmation/[bookingId]
```

---

## Booking Lifecycle

| Status | When set |
|--------|----------|
| `pending` | `createBooking` mutation fires — before payment |
| `confirmed` | Webhook received — payment captured |
| `cancelled` | `cancelBooking` mutation — either party, triggers full refund |
| `completed` | Nightly cron — checkout date has passed |

**Instant booking only:** `instantBook` flag is ignored in Phase 4 — all bookings go straight to `pending` → payment → `confirmed`. No host-approval request flow.

**Availability check:** `createBooking` queries confirmed bookings for the property and rejects if any overlap with requested dates.

**Abandoned pending bookings:** A cleanup cron deletes `pending` bookings older than 2 hours (guest abandoned checkout without paying).

---

## Pages & Routes

### New pages

| Route | Auth | Description |
|-------|------|-------------|
| `/checkout/[propertyId]` | Required | Date recap, guest count, price breakdown, Stripe or PayPal button |
| `/booking-confirmation/[bookingId]` | Required | Success screen — booking summary, "View my trips" link |
| `/trips` | Required | Guest's bookings — Upcoming / Past / Cancelled tabs |
| `/host/bookings` | Required | Host's bookings — same tabs, shows guest name + payout amount |
| `/host/onboarding/stripe` | Required | Stripe Connect Express onboarding |
| `/host/onboarding/paypal` | Required | PayPal Marketplace onboarding |

All new pages are under `app/(protected)/`. Stripe/PayPal redirect back to the same origin so the auth session remains valid.

### Existing page updates

**`PropertyDetailClient`:**
- Wire `DayPicker` to track selected `checkIn`/`checkOut` dates in state
- Add guest count `+/-` selector (min 1, max `property.maxGuests`)
- Disable already-booked dates on the calendar (from `getBookedDates` query)
- Reserve button builds URL: `/checkout/[propertyId]?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=N`
- Show "Select dates to continue" if no dates selected

**`Navbar`:** "Trips" link already exists — no change needed.

**`/host/properties`:** Add payment setup banner if host has no connected Stripe or PayPal account.

---

## Convex Functions

### `convex/bookings.ts`

**Mutations:**

`createBooking(propertyId, checkIn, checkOut, guests, paymentMethod)`
- Authenticates user
- Fetches property to get `hostId`, `pricePerNight`, `cleaningFee`
- Queries confirmed bookings for the property — throws if any overlap `checkIn`/`checkOut`
- Calculates `totalAmount = pricePerNight * nights + cleaningFee`, `platformFee = totalAmount * 0.05`, `hostPayout = totalAmount - platformFee`
- Creates booking with `status: "pending"`
- Returns `bookingId`

`confirmBooking(bookingId, paymentIntentId?, paypalCaptureId?)`
- Regular mutation called from webhook API routes via the Convex HTTP client
- Security is enforced by the API route: webhook signature is verified before this is called
- Sets `status: "confirmed"`, stores payment ID
- Idempotent: no-ops if booking is already confirmed

`cancelBooking(bookingId, reason)`
- Authenticates user — must be guest or host of this booking
- Sets `status: "cancelled"`, `cancelledBy`, `cancelledAt`, `cancellationReason`
- Does NOT trigger refund directly — caller handles refund via API route

`completeOldBookings` (internalMutation + cron)
- Runs nightly at midnight UTC
- Finds all `confirmed` bookings where `checkOut < today`
- Sets each to `completed`

`cleanupAbandonedBookings` (internalMutation + cron)
- Runs every 2 hours
- Deletes `pending` bookings older than 2 hours

**Queries:**

`getBooking(bookingId)` — single booking, auth required (must be guest or host)

`getGuestBookings()` — all bookings for current user as guest, ordered by checkIn desc

`getHostBookings()` — all bookings for current user as host, ordered by checkIn desc

`getBookedDates(propertyId)` — returns `[{ checkIn, checkOut }]` for all `confirmed` bookings on a property (public — no auth required)

### `convex/stripeAccounts.ts`

`upsertStripeAccount(stripeAccountId, status, chargesEnabled, payoutsEnabled)` — mutation, auth required  
`getStripeAccount()` — query, returns current host's Stripe account or null  
`upsertPaypalAccount(paypalMerchantId, trackingId, status)` — mutation, auth required  
`getPaypalAccount()` — query, returns current host's PayPal account or null

---

## API Routes

### Stripe

**`POST /api/stripe/checkout`**  
Body: `{ bookingId: string }`  
- Fetches booking + property from Convex
- Fetches host's Stripe connected account ID from Convex
- Creates `stripe.checkout.sessions.create` with:
  - `payment_method_types: ["card"]`
  - `line_items` showing nightly rate + cleaning fee
  - `payment_intent_data.application_fee_amount` = platformFee (cents)
  - `payment_intent_data.transfer_data.destination` = host's Stripe account ID
  - `metadata: { bookingId }`
  - `success_url`: `/booking-confirmation/{bookingId}`
  - `cancel_url`: `/checkout/{propertyId}`
- Returns `{ url }` — client redirects to Stripe hosted page

**`POST /api/stripe/connect`**  
Auth required (Clerk session)  
- Creates `stripe.accounts.create({ type: "express" })`
- Creates `stripe.accountLinks.create` with `refresh_url` and `return_url`
- Returns `{ url }` — client redirects to Stripe onboarding

**`GET /api/stripe/connect/callback`**  
- Stripe redirects here after host completes onboarding
- Retrieves account via `stripe.accounts.retrieve`
- Calls Convex `upsertStripeAccount`
- Redirects to `/host/onboarding/stripe`

**`POST /api/webhooks/stripe`**  
- Verifies signature: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
- `checkout.session.completed` → calls Convex `confirmBooking(bookingId, paymentIntentId)`
- `account.updated` → calls Convex `upsertStripeAccount`

### PayPal

**`POST /api/paypal/order`**  
Body: `{ bookingId: string }`  
- Creates PayPal order with `purchase_units` including `platform_fees` for the 5% cut
- Sets `payee.merchant_id` to host's PayPal merchant ID
- Returns `{ orderId }` — client uses PayPal JS SDK to approve

**`POST /api/paypal/capture`**  
Body: `{ orderId: string, bookingId: string }`  
- Captures the PayPal order
- Calls Convex `confirmBooking(bookingId, undefined, captureId)`
- Returns `{ success: true }`

**`POST /api/webhooks/paypal`**  
- Verifies HMAC-SHA256 signature
- `PAYMENT.CAPTURE.COMPLETED` → calls Convex `confirmBooking`
- `PAYMENT.CAPTURE.DENIED` → calls Convex `cancelBooking`

**`POST /api/paypal/connect`**  
- Creates PayPal merchant onboarding link via PayPal Partner Referrals API
- Returns `{ url }` — client redirects to PayPal onboarding

---

## Host Onboarding

### `/host/onboarding/stripe`

Shows one of three states:
- **Not connected:** "Connect Stripe account" button → POST `/api/stripe/connect` → redirect
- **Connected:** Green badge, account details, "Disconnect" option (future)
- **Restricted:** Yellow warning, "Complete verification" link

### `/host/onboarding/paypal`

Shows one of two states:
- **Not connected:** "Connect PayPal account" button → POST `/api/paypal/connect` → redirect
- **Connected:** Green badge

### Onboarding banner on `/host/properties`

If host has neither Stripe nor PayPal connected, show a banner:
> "Set up payments to receive booking payouts — [Connect Stripe] [Connect PayPal]"

---

## Checkout Page (`/checkout/[propertyId]`)

**URL params:** `checkIn`, `checkOut`, `guests` (all required — redirect to property page if missing)

**Layout:**
- Left: property thumbnail, dates recap, guest count display, price breakdown (nights × rate + cleaning fee + 5% service fee = total)
- Right: payment section — two buttons "Pay with Card" (Stripe) and "Pay with PayPal"

**Flow:**
1. Page loads → calls Convex `getBookedDates` to verify dates still available
2. Guest clicks "Pay with Card":
   - POST Convex `createBooking` → get `bookingId`
   - POST `/api/stripe/checkout` with `bookingId` → get Stripe URL
   - `window.location.href = stripeUrl`
3. Guest clicks "Pay with PayPal":
   - POST Convex `createBooking` → get `bookingId`
   - POST `/api/paypal/order` → get `orderId`
   - Render PayPal JS SDK button with `orderId`
   - On approval → POST `/api/paypal/capture` → redirect to `/booking-confirmation/[bookingId]`

**Error states:**
- Dates no longer available → show "These dates were just booked, please select new dates" with link back
- Host not onboarded → show "This host hasn't set up payments yet"

---

## Guest Trips Page (`/trips`)

Three tabs: **Upcoming** | **Past** | **Cancelled**

Each booking card shows:
- Property cover image + title
- Dates, guest count
- Total paid
- Status badge
- "Cancel" button (Upcoming only, calls `cancelBooking` + refund API)

---

## Host Bookings Page (`/host/bookings`)

Three tabs: **Upcoming** | **Past** | **Cancelled**

Each booking card shows:
- Property title
- Guest name (from users table)
- Dates
- Host payout amount (total − platform fee)
- Status badge
- "Cancel" button (Upcoming only)

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Dates overlap at booking creation | Convex mutation throws — checkout page shows "Dates just booked" |
| Stripe payment fails | Stripe redirects to `cancel_url` — booking stays `pending`, cleaned up by cron |
| PayPal capture fails | `/api/paypal/capture` returns error — UI shows retry message |
| Host not onboarded | Checkout page checks Convex before creating booking — shows setup message |
| Webhook arrives twice | `confirmBooking` is idempotent — checks current status before updating |
| Refund fails | Log the error, flag booking for manual review (future: admin panel) |

---

## Environment Variables Needed

```
# Stripe (already in .env.local)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PLATFORM_FEE_PERCENT=5

# PayPal (needs filling in)
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_WEBHOOK_ID=
```

---

## Out of Scope (Phase 4)

- Host-approval request flow (instantBook = false) — all bookings auto-confirm on payment
- Reviews — Phase 7
- Notifications / email — Phase 6
- Admin panel for failed refunds
- Partial refunds
- Multi-currency support
