# Airbnb Clone — Design Spec

**Date:** 2026-05-07  
**Status:** Approved  
**Stack:** Next.js 16 · React 19 · Convex · Clerk · Tailwind v4 · shadcn/ui · pnpm

---

## 1. Overview

A full-featured property rental marketplace where hosts list properties and guests book them. The platform charges a 5% service fee on every booking. Hosts receive automatic payouts through Stripe Connect Express or PayPal Marketplace. Guests pay with a card (Stripe) or PayPal.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router | React 19, server components throughout |
| Backend | Convex | Real-time DB, file queries, scheduled actions, HTTP endpoints |
| Auth | Clerk | Google OAuth + Email, proxy mode, no middleware.ts |
| UI | shadcn/ui + Tailwind v4 | Component library on top of Radix primitives |
| Images | Cloudinary | Upload, transform, CDN delivery |
| Maps | Mapbox GL JS | Property map with price pins, geocoding |
| Email | Resend + React Email | Transactional emails via React templates |
| Payments | Stripe Connect Express + PayPal Marketplace | Full marketplace split, auto payouts |
| Package manager | pnpm | Already in use |

---

## 3. Route Structure

### Public
| Route | Description |
|---|---|
| `/` | Homepage with property grid, search bar, category filters, Mapbox toggle |
| `/properties/[id]` | Full property detail page |
| `/search` | Search results with filters |
| `/sign-in` | Clerk-hosted sign-in |
| `/sign-up` | Clerk-hosted sign-up |

### Guest (protected)
| Route | Description |
|---|---|
| `/trips` | Guest hub — Upcoming, Active, Past, Cancelled tabs + Wishlists |
| `/trips/[bookingId]` | Single booking detail |
| `/wishlist` | Saved properties |
| `/checkout/[propertyId]` | Booking checkout with date picker, cost breakdown, payment |
| `/booking-confirmation/[bookingId]` | Post-booking confirmation screen |

### Host (protected)
| Route | Description |
|---|---|
| `/host/dashboard` | Stats, Stripe status, bookings queue, property list, multi-unit calendar |
| `/host/properties` | All listings with edit/delete actions |
| `/host/properties/new` | Create new listing wizard |
| `/host/properties/[id]/edit` | Edit existing listing |
| `/host/bookings` | Incoming bookings with status management |
| `/host/calendar` | Centralized availability calendar across all properties |
| `/host/earnings` | Income and payout history |
| `/host/onboarding/stripe` | Stripe Connect Express onboarding entry point |

### API / Webhooks (Next.js Route Handlers)
| Route | Handler |
|---|---|
| `/api/webhooks/clerk` | Syncs Clerk user events to Convex |
| `/api/webhooks/stripe` | Processes Stripe payment and account events |
| `/api/webhooks/paypal` | Processes PayPal payment and merchant events |
| `/api/stripe/connect` | Creates Stripe Connect account and returns onboarding URL |
| `/api/stripe/checkout` | Creates Stripe Payment Intent |
| `/api/paypal/order` | Creates and captures PayPal Order |

---

## 4. Auth Integration

**Clerk is configured in proxy mode.** No `middleware.ts` file exists. Instead:

- `next.config.ts` rewrites Clerk's frontend API calls through the app's own domain.
- Route protection uses `auth()` from `@clerk/nextjs/server` inside Server Components and Route Handlers.
- Sign-in and sign-up use Clerk's hosted component pages at `/sign-in` and `/sign-up`.
- Supported methods: Google OAuth and Email/Password.

**Clerk → Convex user sync:**

1. Clerk fires `user.created` and `user.updated` webhooks to `/api/webhooks/clerk`.
2. The route handler calls a Convex HTTP endpoint that upserts the `users` table.
3. The `tokenIdentifier` field (from `ctx.auth.getUserIdentity()`) is the canonical user key in all Convex functions. No client-supplied user ID is ever trusted.

**`convex/auth.config.ts`** points to `CLERK_FRONTEND_API_URL` as the JWT domain with `applicationID: "convex"`. This file already exists in the project.

---

## 5. Data Model

All monetary values are stored in **cents** (integers) to avoid floating-point errors. Dates are stored as **`YYYY-MM-DD` strings** for clean availability logic without timezone ambiguity. The platform operates in **USD** only.

### `users`
| Field | Type | Notes |
|---|---|---|
| `tokenIdentifier` | string | Clerk's stable identity key, indexed |
| `clerkId` | string | |
| `email` | string | |
| `name` | string | |
| `imageUrl` | string? | |
| `role` | `"guest" \| "host" \| "both"` | Defaults to `"guest"` on creation |

### `properties`
| Field | Type | Notes |
|---|---|---|
| `hostId` | Id<"users"> | Indexed |
| `title` | string | Full-text search indexed |
| `description` | string | |
| `type` | string | `apartment \| house \| villa \| cabin \| condo \| studio \| ...` |
| `status` | string | `draft \| published \| unlisted` |
| `address`, `city`, `state`, `country` | string | |
| `lat`, `lng` | number | For Mapbox |
| `pricePerNight` | number | Cents |
| `cleaningFee` | number | Cents |
| `maxGuests`, `bedrooms`, `beds`, `bathrooms` | number | |
| `amenities` | string[] | e.g. `["WiFi", "Pool", "Kitchen"]` |
| `houseRules` | string[] | |
| `checkInTime`, `checkOutTime` | string | e.g. `"15:00"` |
| `minNights`, `maxNights` | number | |
| `instantBook` | boolean | |
| `coverImageUrl` | string | Cloudinary URL |
| `coverImagePublicId` | string | Cloudinary public ID |
| `avgRating` | number | Denormalized, updated on review write |
| `reviewCount` | number | Denormalized |

### `propertyImages`
| Field | Type | Notes |
|---|---|---|
| `propertyId` | Id<"properties"> | Indexed |
| `cloudinaryPublicId` | string | |
| `url` | string | Cloudinary delivery URL |
| `order` | number | Display order in gallery |
| `isCover` | boolean | |

### `bookings`
| Field | Type | Notes |
|---|---|---|
| `propertyId` | Id<"properties"> | Indexed |
| `guestId` | Id<"users"> | Indexed |
| `hostId` | Id<"users"> | Indexed |
| `checkIn`, `checkOut` | string | `YYYY-MM-DD` |
| `guests` | number | |
| `status` | string | `pending \| confirmed \| cancelled \| completed` |
| `totalAmount` | number | Cents — full amount charged to guest |
| `platformFee` | number | Cents — 5% of totalAmount |
| `hostPayout` | number | Cents — 95% of totalAmount |
| `paymentMethod` | string | `"stripe" \| "paypal"` |
| `paymentIntentId` | string? | Stripe Payment Intent ID |
| `paypalOrderId` | string? | PayPal Order ID |
| `paypalCaptureId` | string? | Needed for PayPal refunds |
| `cancelledBy` | string? | `"guest" \| "host"` |
| `cancelledAt` | number? | Timestamp |
| `cancellationReason` | string? | |

### `stripeAccounts`
| Field | Type | Notes |
|---|---|---|
| `userId` | Id<"users"> | Unique index |
| `stripeAccountId` | string | |
| `status` | string | `pending \| active \| restricted` |
| `chargesEnabled` | boolean | Must be true to accept bookings |
| `payoutsEnabled` | boolean | |

### `paypalAccounts`
| Field | Type | Notes |
|---|---|---|
| `userId` | Id<"users"> | Unique index |
| `paypalMerchantId` | string | |
| `trackingId` | string | Used to poll onboarding status |
| `status` | string | `pending \| active` |

### `reviews`
| Field | Type | Notes |
|---|---|---|
| `bookingId` | Id<"bookings"> | Unique — one review per booking |
| `propertyId` | Id<"properties"> | Indexed |
| `guestId` | Id<"users"> | |
| `rating` | number | 1–5 |
| `comment` | string | |

### `wishlists`
| Field | Type | Notes |
|---|---|---|
| `userId` | Id<"users"> | Indexed with propertyId |
| `propertyId` | Id<"properties"> | |

### `notifications`
| Field | Type | Notes |
|---|---|---|
| `userId` | Id<"users"> | Indexed |
| `type` | string | `booking_confirmed \| booking_cancelled \| payout_sent \| new_booking \| review_received` |
| `title` | string | |
| `message` | string | |
| `read` | boolean | |
| `relatedId` | string? | Booking or property ID for deep-link |

---

## 6. Property System

### Create / Edit / Delete
- Hosts manage listings through a multi-step form wizard at `/host/properties/new` and `/host/properties/[id]/edit`.
- Fields cover: basic info, location (with Mapbox geocoding), pricing, capacity, amenities (checkbox grid), house rules, check-in/out times, and photos.
- Listings default to `draft` status. Hosts publish explicitly.
- Delete is a soft operation: status → `unlisted`. Hard delete only if no bookings exist.

### Image Upload
- Images upload directly from the browser to Cloudinary using an unsigned upload preset.
- A Convex mutation stores each image's `cloudinaryPublicId`, `url`, and `order` in `propertyImages`.
- The first image is automatically set as cover. Hosts can reorder via drag-and-drop.
- Gallery supports up to 20 images per property.

### Seed Data
- A Convex mutation at `convex/seed.ts` inserts 20 realistic properties with varied types, locations, pricing, amenities, and linked images.
- Seed runs once; a `seedRan` flag in a `config` document prevents duplicate runs.

---

## 7. Search & Filters

### Search inputs
- **Location** — Mapbox Geocoding API autocomplete. Stores lat/lng of selected location.
- **Dates** — Check-in / check-out date range picker.
- **Guests** — Number input.
- **Type** — Property type filter (apartment, house, villa, etc.).
- **Price range** — Min/max slider.

### Query logic
- Convex query filters by `status: "published"` and `city`/`country` text match, then narrows by guest capacity and price range.
- Date availability: excludes properties with confirmed bookings that overlap the requested range.
- Full-text search on `title` uses Convex's built-in search index.
- Results paginate at **10 properties per page** using Convex's `paginate()`.

### Map view
- Mapbox GL JS renders a pin for each property in the current page at its `lat`/`lng`.
- Pins display the `pricePerNight`. Clicking a pin opens a small property card popup.
- Map and grid toggle between each other on mobile; shown side-by-side on desktop.

---

## 8. Property Detail Page

The detail page (`/properties/[id]`) renders:

- **Gallery** — Cover image + 4-image grid. Clicking any image opens `yet-another-react-lightbox` for full-screen browsing.
- **Header** — Title, location, star rating, review count.
- **Capacity row** — Guests, bedrooms, beds, bathrooms.
- **Description** — Full text.
- **Amenities grid** — Icon + label for each amenity.
- **Availability calendar** — `react-day-picker` in range mode. Confirmed booking dates are blocked. Smart logic prevents selecting check-in on another booking's checkout date.
- **House rules** — Ordered list.
- **Location map** — Mapbox embed centered on property lat/lng with a marker.
- **Reviews** — Star average + individual review cards.
- **Sticky booking widget** (desktop sidebar / mobile bottom sheet):
  - Price per night
  - Date range picker (mirrors the calendar above)
  - Guest count selector
  - Cost breakdown: nightly subtotal, cleaning fee, 5% service fee, total
  - Reserve button → `/checkout/[propertyId]` with dates/guests in URL params

---

## 9. Booking & Payment Flow

### Cost calculation
```
subtotal      = pricePerNight × nights
cleaningFee   = property.cleaningFee
serviceFee    = (subtotal + cleaningFee) × 0.05   // platform fee
totalCharged  = subtotal + cleaningFee + serviceFee
hostPayout    = totalCharged - serviceFee          // 95%
```

### Stripe Connect path
1. Guest reaches checkout, selects card payment.
2. A Next.js route handler calls a Convex action that creates a Stripe `PaymentIntent` with `application_fee_amount = serviceFee` and `transfer_data.destination = host.stripeAccountId`.
3. Stripe Elements renders the card form.
4. On `payment_intent.succeeded` webhook → Convex HTTP endpoint → booking status → `confirmed`.
5. Resend sends confirmation emails to both guest and host.

### PayPal Marketplace path
1. Guest selects PayPal at checkout (only shown if host has an active PayPal account).
2. Route handler creates a PayPal Order via Orders API v2 with platform fee in `purchase_units`.
3. Guest completes PayPal approval flow.
4. On `PAYMENT.CAPTURE.COMPLETED` webhook → Convex → booking status → `confirmed`.
5. Resend sends confirmation emails.

### Booking lifecycle
```
pending → confirmed (payment webhook) → completed (Convex cron, midnight after checkout)
                  ↓
             cancelled (guest or host action) → refund triggered → emails sent
```

**`instantBook` flag:** When a property has `instantBook: true`, payment confirmation alone moves the booking to `confirmed` — no separate host approval step. When `false`, the booking stays `pending` after payment and the host sees a "Confirm" button in their bookings queue. Guests cannot cancel a pending booking that is awaiting host confirmation without first contacting support (deferred to a later phase).

### Refunds
- **Stripe:** `stripe.refunds.create({ payment_intent: booking.paymentIntentId })` — full refund.
- **PayPal:** `POST /v2/payments/captures/{captureId}/refund` — full refund.
- Both triggered synchronously when a booking is cancelled. Webhook confirms refund completion.

### Booking completion
- A Convex cron job runs at **00:05 UTC daily**.
- It queries all bookings with `status: "confirmed"` where `checkOut < today`.
- Updates each to `status: "completed"` and sends a Resend email prompting the guest to leave a review.

---

## 10. Host Onboarding

### Stripe Connect Express
1. Host clicks "Connect with Stripe" on the dashboard.
2. Route handler creates a Stripe Express account and returns an Account Link URL.
3. Host completes Stripe's hosted onboarding (bank details, identity, tax).
4. Return URL lands back at `/host/dashboard`.
5. `account.updated` webhook → Convex → updates `stripeAccounts` with `chargesEnabled` / `payoutsEnabled`.
6. Dashboard shows a status pill: **Pending → Restricted → Active**. Hosts cannot receive bookings until `chargesEnabled: true`.

### PayPal Marketplace
1. Host clicks "Connect with PayPal" on the dashboard.
2. Route handler calls PayPal Partner Referrals API v2 with `PAYMENT` and `REFUND` permissions → returns sign-up link.
3. Host completes PayPal's hosted flow to link or create a PayPal Business account.
4. Return URL lands back at `/host/dashboard`.
5. `MERCHANT.ONBOARDING.COMPLETED` webhook → Convex → saves `paypalMerchantId`, sets `status: "active"`.
6. PayPal payment option appears at checkout only for properties whose host has an active PayPal account.

---

## 11. Host Management Hub (`/host/dashboard`)

- **Stats cards:** Total earnings (MTD), active bookings, total listings.
- **Stripe / PayPal status banners:** Prominent CTAs if onboarding is incomplete.
- **Incoming bookings queue:** Paginated list with guest name, property, dates, status, and action buttons (confirm/cancel where applicable).
- **Properties list:** All listings with status badge, quick edit and delete actions.
- **Multi-unit calendar:** Month view showing all properties' bookings colour-coded by property.
- **Earnings:** Payout history with date, amount, payment method, and linked booking.

---

## 12. Guest Experience Hub (`/trips`)

- **Travel timeline tabs:** Upcoming · Active · Past · Cancelled.
- **Booking cards:** Property thumbnail, name, dates, guest count, total paid, and a Cancel button (active on upcoming bookings only).
- **Cancellation flow:** Confirmation modal → triggers refund → updates booking status → emails both parties.
- **Wishlists:** Grid of saved properties with remove option. Heart icon on property cards toggles wishlist membership.

---

## 13. Notifications

### In-app
- `notifications` table stores unread count per user.
- Bell icon in nav shows unread badge. Dropdown lists recent notifications with deep links.

### Email (Resend + React Email)
| Trigger | Recipients | Template |
|---|---|---|
| Booking confirmed | Guest + Host | Booking details, dates, amounts, property link |
| Booking cancelled | Guest + Host | Cancellation reason, refund timeline |
| Booking completed | Guest | Review prompt with link |
| Payout sent | Host | Amount, booking reference |
| New booking request | Host | Guest info, dates, property |

---

## 14. Implementation Phases

The build proceeds in six phases, each independently shippable:

1. **Foundation** — Clerk auth wiring, Convex schema, user sync webhook, shadcn setup, seed data.
2. **Properties** — CRUD, Cloudinary image upload, listing wizard, property detail page.
3. **Search & Discovery** — Search bar, filters, paginated grid, Mapbox map view.
4. **Bookings** — Availability calendar, checkout flow, booking lifecycle, Convex cron.
5. **Payments** — Stripe Connect onboarding + checkout, PayPal Marketplace onboarding + checkout, refunds.
6. **Dashboards & Notifications** — Host hub, guest hub, Resend emails, in-app notifications.
