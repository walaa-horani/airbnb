# Phase 7: Email Notifications & Cancellation Refunds

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send transactional emails via Resend + React Email for booking confirmations and cancellations, and issue Stripe refunds automatically when a booking is cancelled.

**Architecture:**
- React Email templates live in `airbnb/emails/`
- Email rendering + sending happens in Next.js API routes (Node.js, full React Email support)
- **Booking confirmed emails** → triggered from the booking confirmation page when it detects `redirect_status=succeeded` (client calls `/api/emails/booking-confirmed`)
- **Cancellation + refund** → new `/api/bookings/cancel` route handles: (1) cancel in Convex, (2) Stripe refund if `paymentIntentId` exists, (3) send cancellation emails to guest + host
- Trips page "Cancel" button switches from direct Convex mutation to calling `/api/bookings/cancel`

**Tech Stack:** Next.js 16 App Router, Resend, React Email, Stripe, Convex, Clerk

**Key facts:**
- `getUserById` query exists and returns full user (name, email) — no auth required
- `getBookingById` query exists and returns booking without auth
- `cancelBooking` mutation exists — keeps status update in Convex
- `paymentIntentId` is stored on bookings after Stripe payment
- Prices in cents throughout

**Env vars to add:**
- `RESEND_API_KEY` — from resend.com dashboard
- `RESEND_FROM_EMAIL` — e.g. `Airbnb Clone <onboarding@resend.dev>`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Install | `resend @react-email/components @react-email/render` | Email packages |
| Create | `emails/BookingConfirmedGuest.tsx` | Guest booking confirmation template |
| Create | `emails/NewBookingHost.tsx` | Host new reservation notification template |
| Create | `emails/BookingCancelledGuest.tsx` | Guest cancellation + refund info template |
| Create | `emails/BookingCancelledHost.tsx` | Host cancellation notification template |
| Create | `app/api/emails/booking-confirmed/route.ts` | Render + send confirmation emails |
| Create | `app/api/bookings/cancel/route.ts` | Cancel in Convex + Stripe refund + send emails |
| Modify | `app/(protected)/booking-confirmation/[bookingId]/page.tsx` | Call email route on payment success |
| Modify | `app/(protected)/trips/page.tsx` | Cancel button calls API route |

---

## Task 1: Install email packages

**Files:**
- Modify: `package.json` (via pnpm)

- [ ] **Step 1: Install packages**

```bash
cd airbnb && pnpm add resend @react-email/components @react-email/render
```

Expected: all three packages added to `dependencies`.

- [ ] **Step 2: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/package.json airbnb/pnpm-lock.yaml && git commit -m "feat: install resend and react-email packages"
```

---

## Task 2: Create React Email templates

Four email templates. All are simple, clean, and mobile-friendly.

**Files:**
- Create: `emails/BookingConfirmedGuest.tsx`
- Create: `emails/NewBookingHost.tsx`
- Create: `emails/BookingCancelledGuest.tsx`
- Create: `emails/BookingCancelledHost.tsx`

- [ ] **Step 1: Create `emails/BookingConfirmedGuest.tsx`**

```tsx
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  guestName: string;
  propertyTitle: string;
  propertyCity: string;
  propertyCountry: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  totalAmount: number; // cents
  bookingId: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export default function BookingConfirmedGuest({
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  propertyCity = "Paris",
  propertyCountry = "France",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  guests = 2,
  nights = 4,
  totalAmount = 40000,
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your booking at {propertyTitle} is confirmed!</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              Booking confirmed! 🎉
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {guestName}, your trip is all set.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Heading as="h2" style={{ fontSize: 18, color: "#111827" }}>{propertyTitle}</Heading>
            <Text style={{ color: "#6b7280", marginTop: 4 }}>{propertyCity}, {propertyCountry}</Text>

            <Row style={{ marginTop: 20 }}>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Text style={{ color: "#6b7280", marginTop: 16 }}>
              {guests} guest{guests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column><Text style={{ fontWeight: 600, color: "#111827" }}>Total paid</Text></Column>
              <Column style={{ textAlign: "right" }}><Text style={{ fontWeight: 600, color: "#111827" }}>{formatCents(totalAmount)}</Text></Column>
            </Row>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Booking ID: {bookingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 2: Create `emails/NewBookingHost.tsx`**

```tsx
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  hostName: string;
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  hostPayout: number; // cents
  bookingId: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

export default function NewBookingHost({
  hostName = "Host",
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  guests = 2,
  nights = 4,
  hostPayout = 38000,
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>New reservation at {propertyTitle} from {guestName}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              New reservation! 🏠
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {hostName}, {guestName} just booked your property.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Heading as="h2" style={{ fontSize: 18, color: "#111827" }}>{propertyTitle}</Heading>

            <Row style={{ marginTop: 20 }}>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", fontWeight: 600, color: "#111827" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Text style={{ color: "#6b7280", marginTop: 16 }}>
              {guests} guest{guests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column><Text style={{ fontWeight: 600, color: "#111827" }}>Your payout</Text></Column>
              <Column style={{ textAlign: "right" }}>
                <Text style={{ fontWeight: 700, color: "#16a34a", fontSize: 18 }}>{formatCents(hostPayout)}</Text>
              </Column>
            </Row>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Booking ID: {bookingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 3: Create `emails/BookingCancelledGuest.tsx`**

```tsx
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  refundAmount: number; // cents, 0 if no refund
  bookingId: string;
}

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function BookingCancelledGuest({
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  refundAmount = 40000,
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Your booking at {propertyTitle} has been cancelled</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              Booking cancelled
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {guestName}, your booking at <strong>{propertyTitle}</strong> has been cancelled.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            {refundAmount > 0 ? (
              <Section style={{ backgroundColor: "#f0fdf4", borderRadius: 8, padding: "16px 20px", border: "1px solid #bbf7d0" }}>
                <Text style={{ margin: 0, fontWeight: 600, color: "#166534" }}>
                  Refund of {formatCents(refundAmount)} issued
                </Text>
                <Text style={{ margin: "8px 0 0", color: "#16a34a", fontSize: 14 }}>
                  Your refund will appear on your original payment method within 5–10 business days.
                </Text>
              </Section>
            ) : (
              <Text style={{ color: "#6b7280" }}>No refund is applicable for this cancellation.</Text>
            )}

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Booking ID: {bookingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 4: Create `emails/BookingCancelledHost.tsx`**

```tsx
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text, Row, Column,
} from "@react-email/components";

interface Props {
  hostName: string;
  guestName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  bookingId: string;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function BookingCancelledHost({
  hostName = "Host",
  guestName = "Guest",
  propertyTitle = "Beautiful Home",
  checkIn = "2026-06-01",
  checkOut = "2026-06-05",
  bookingId = "abc123",
}: Props) {
  return (
    <Html>
      <Head />
      <Preview>Reservation cancelled: {guestName} at {propertyTitle}</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "sans-serif", margin: 0, padding: 0 }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: "40px 20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: 12, padding: "32px 40px", border: "1px solid #e5e7eb" }}>
            <Heading style={{ color: "#111827", fontSize: 24, marginBottom: 8 }}>
              Reservation cancelled
            </Heading>
            <Text style={{ color: "#6b7280", marginTop: 0 }}>
              Hi {hostName}, {guestName}&apos;s reservation at <strong>{propertyTitle}</strong> has been cancelled.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Row>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-in</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkIn)}</Text>
              </Column>
              <Column>
                <Text style={{ margin: 0, fontSize: 12, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Check-out</Text>
                <Text style={{ margin: "4px 0 0", color: "#6b7280" }}>{formatDate(checkOut)}</Text>
              </Column>
            </Row>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#6b7280", fontSize: 14 }}>
              These dates are now available again on your calendar.
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0" }} />

            <Text style={{ color: "#9ca3af", fontSize: 12, textAlign: "center" }}>
              Booking ID: {bookingId}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/emails/ && git commit -m "feat: add React Email templates for booking confirmations and cancellations"
```

---

## Task 3: Create the booking-confirmed email API route

Called from the booking confirmation page after successful Stripe redirect. Looks up booking data from Convex and sends two emails: guest confirmation + host notification.

**Files:**
- Create: `app/api/emails/booking-confirmed/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/emails/booking-confirmed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Resend } from "resend";
import { render } from "@react-email/render";
import BookingConfirmedGuest from "@/emails/BookingConfirmedGuest";
import NewBookingHost from "@/emails/NewBookingHost";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "Airbnb Clone <onboarding@resend.dev>";

export async function POST(req: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  convex.setAuth(token);

  const { bookingId } = await req.json() as { bookingId: string };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const booking = await convex.query(api.bookings.getBookingById, {
    bookingId: bookingId as Id<"bookings">,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const [property, guest, host] = await Promise.all([
    convex.query(api.properties.getProperty, { propertyId: booking.propertyId }),
    convex.query(api.users.getUserById, { userId: booking.guestId }),
    convex.query(api.users.getUserById, { userId: booking.hostId }),
  ]);

  if (!property || !guest || !host) {
    return NextResponse.json({ error: "Missing booking data" }, { status: 404 });
  }

  const nights = Math.round(
    (new Date(booking.checkOut).getTime() - new Date(booking.checkIn).getTime()) / 86400000,
  );

  const [guestHtml, hostHtml] = await Promise.all([
    render(BookingConfirmedGuest({
      guestName: guest.name,
      propertyTitle: property.title,
      propertyCity: property.city,
      propertyCountry: property.country,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guests: booking.guests,
      nights,
      totalAmount: booking.totalAmount,
      bookingId: booking._id,
    })),
    render(NewBookingHost({
      hostName: host.name,
      guestName: guest.name,
      propertyTitle: property.title,
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      guests: booking.guests,
      nights,
      hostPayout: booking.hostPayout,
      bookingId: booking._id,
    })),
  ]);

  await Promise.all([
    resend.emails.send({
      from: FROM,
      to: [guest.email],
      subject: `Booking confirmed: ${property.title}`,
      html: guestHtml,
    }),
    resend.emails.send({
      from: FROM,
      to: [host.email],
      subject: `New reservation: ${property.title}`,
      html: hostHtml,
    }),
  ]);

  return NextResponse.json({ sent: true });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep -E "booking-confirmed" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/api/emails/" && git commit -m "feat: add /api/emails/booking-confirmed route to send confirmation emails"
```

---

## Task 4: Create the cancel + refund API route

Handles the full cancellation flow: cancel in Convex → Stripe refund → send emails.

**Files:**
- Create: `app/api/bookings/cancel/route.ts`

- [ ] **Step 1: Create the route**

```ts
// app/api/bookings/cancel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Stripe from "stripe";
import { Resend } from "resend";
import { render } from "@react-email/render";
import BookingCancelledGuest from "@/emails/BookingCancelledGuest";
import BookingCancelledHost from "@/emails/BookingCancelledHost";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "Airbnb Clone <onboarding@resend.dev>";

export async function POST(req: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  convex.setAuth(token);

  const { bookingId, reason } = await req.json() as { bookingId: string; reason?: string };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  // Fetch booking (no-auth query — the mutation will enforce ownership)
  const booking = await convex.query(api.bookings.getBookingById, {
    bookingId: bookingId as Id<"bookings">,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Cancel in Convex (mutation enforces ownership)
  await convex.mutation(api.bookings.cancelBooking, {
    bookingId: bookingId as Id<"bookings">,
    reason: reason ?? "Cancelled by user",
  });

  // Issue Stripe refund if payment was made
  let refundAmount = 0;
  if (booking.paymentIntentId && booking.status === "confirmed") {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: booking.paymentIntentId,
      });
      refundAmount = refund.amount;
    } catch (err) {
      console.error("Stripe refund error:", err);
      // Don't block the cancellation if refund fails — log and continue
    }
  }

  // Fetch related data for emails
  const [property, guest, host] = await Promise.all([
    convex.query(api.properties.getProperty, { propertyId: booking.propertyId }),
    convex.query(api.users.getUserById, { userId: booking.guestId }),
    convex.query(api.users.getUserById, { userId: booking.hostId }),
  ]);

  if (property && guest && host) {
    const [guestHtml, hostHtml] = await Promise.all([
      render(BookingCancelledGuest({
        guestName: guest.name,
        propertyTitle: property.title,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        refundAmount,
        bookingId: booking._id,
      })),
      render(BookingCancelledHost({
        hostName: host.name,
        guestName: guest.name,
        propertyTitle: property.title,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        bookingId: booking._id,
      })),
    ]);

    await Promise.all([
      resend.emails.send({
        from: FROM,
        to: [guest.email],
        subject: `Booking cancelled: ${property.title}`,
        html: guestHtml,
      }),
      resend.emails.send({
        from: FROM,
        to: [host.email],
        subject: `Reservation cancelled: ${property.title}`,
        html: hostHtml,
      }),
    ]).catch((err) => console.error("Email send error:", err));
  }

  return NextResponse.json({ cancelled: true, refundAmount });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep -E "bookings/cancel" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/api/bookings/" && git commit -m "feat: add /api/bookings/cancel route with Stripe refund and cancellation emails"
```

---

## Task 5: Trigger confirmation email from booking confirmation page

After Stripe redirects back with `redirect_status=succeeded`, call the email endpoint once.

**Files:**
- Modify: `app/(protected)/booking-confirmation/[bookingId]/page.tsx`

- [ ] **Step 1: Read the current file**

Read `c:\dev\airbnb2\airbnb\app\(protected)\booking-confirmation\[bookingId]\page.tsx` to see the current `ConfirmationContent` component.

- [ ] **Step 2: Add email trigger effect**

In `ConfirmationContent`, add a `useRef` import and add this effect after the existing state/query declarations:

After the existing imports line, ensure `useEffect` and `useRef` are imported from React:
```tsx
import { use, Suspense, useEffect, useRef } from "react";
```

Inside `ConfirmationContent`, after the `const searchParams = useSearchParams();` and `const redirectStatus = ...` lines, add:

```tsx
  const emailSent = useRef(false);
  useEffect(() => {
    if (redirectStatus === "succeeded" && booking && !emailSent.current) {
      emailSent.current = true;
      fetch("/api/emails/booking-confirmed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking._id }),
      }).catch(() => {/* silent — email is best-effort */});
    }
  }, [redirectStatus, booking]);
```

- [ ] **Step 3: TypeScript check**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep -E "booking-confirmation" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/(protected)/booking-confirmation/" && git commit -m "feat: trigger booking confirmation email from confirmation page"
```

---

## Task 6: Update trips page to use cancel API route

Switch the cancel handler from calling the Convex mutation directly to calling `/api/bookings/cancel`, which handles refund + emails.

**Files:**
- Modify: `app/(protected)/trips/page.tsx`

- [ ] **Step 1: Read the current file**

Read `c:\dev\airbnb2\airbnb\app\(protected)\trips\page.tsx`.

- [ ] **Step 2: Replace the cancel handler and remove useMutation for cancel**

Find the `cancelBooking` mutation line:
```tsx
  const cancelBooking = useMutation(api.bookings.cancelBooking);
```
Remove it (we'll call the API route instead).

Find the `handleCancel` function:
```tsx
  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      await cancelBooking({ bookingId: cancelId, reason: "Cancelled by guest" });
    } finally {
      setCancelId(null);
      setCancelling(false);
    }
  };
```

Replace it with:
```tsx
  const handleCancel = async () => {
    if (!cancelId) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: cancelId, reason: "Cancelled by guest" }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? "Failed to cancel booking");
      }
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setCancelId(null);
      setCancelling(false);
    }
  };
```

Also remove `useMutation` from the convex/react import if it's no longer used after removing `cancelBooking`. Check if `submitReview` still uses `useMutation` — if so, keep the import.

- [ ] **Step 3: TypeScript check**

```bash
cd airbnb && npx tsc --noEmit 2>&1 | grep -E "trips" | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/(protected)/trips/page.tsx" && git commit -m "feat: trips cancel button calls refund API route instead of Convex mutation directly"
```

---

## Task 7: Add env vars and test end-to-end

- [ ] **Step 1: Add env vars to `.env.local`**

Open `airbnb/.env.local` and add:
```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=Airbnb Clone <onboarding@resend.dev>
```

Get the API key from https://resend.com/api-keys (create a free account if needed).

- [ ] **Step 2: Test booking confirmation email**

1. Start the dev server: `cd airbnb && pnpm dev`
2. Book a property with Stripe test card `4242 4242 4242 4242`
3. After payment, land on the confirmation page
4. Check your inbox (the guest email in Clerk) — should receive the confirmation email
5. Check the host email — should receive the "New reservation" email

- [ ] **Step 3: Test cancellation + refund**

1. Go to `/trips`
2. Find a confirmed booking (status "Confirmed")
3. Click "Cancel" → confirm in the dialog
4. Expected in Stripe Dashboard → Payments: the original charge shows a refund
5. Expected in email: guest receives cancellation + refund email, host receives cancellation email
6. Expected in UI: booking status changes to "Cancelled"

- [ ] **Step 4: Test pending booking cancellation (no refund)**

1. Create a new booking but **don't complete payment** (stay at the Stripe Elements stage, then navigate away)
2. Wait for the 2-hour TTL cron OR manually cancel from trips page
3. Expected: no Stripe refund attempted (no `paymentIntentId`), cancellation emails still sent

---

## Done

Phase 7 is complete when:
- Guest receives confirmation email after successful Stripe payment ✓
- Host receives new reservation notification after successful payment ✓
- Cancelling a confirmed booking issues a Stripe refund ✓
- Guest receives cancellation + refund email ✓
- Host receives cancellation notification email ✓
- Cancelling a pending (unpaid) booking sends emails but no refund attempt ✓
