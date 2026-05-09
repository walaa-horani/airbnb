# Phase 5: Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests leave a star rating + comment after a completed stay, and display reviews on property pages with live average rating.

**Architecture:** A Convex daily cron flips past confirmed bookings to "completed". Guests see a "Leave a review" button on completed trips in `/trips` — clicking opens an inline modal with a 1–5 star picker and a comment box. On submit, the review is saved and the property's `avgRating`/`reviewCount` are updated atomically. The property detail page gains a reviews section below house rules.

**Tech Stack:** Next.js App Router, Convex (mutations, queries, cronJobs), Tailwind v4, shadcn/ui, lucide-react (Star icon — already imported)

**Key facts from codebase:**
- `reviews` table already defined in `convex/schema.ts` with indexes `by_booking_id` and `by_property_id`
- `completeOldBookings` internalMutation already exists in `convex/bookings.ts` — just needs a cron to call it
- `Star` icon already imported in `PropertyDetailClient.tsx`
- `buttonVariants` pattern used throughout (no `asChild` on Button)
- No `convex/crons.ts` exists yet

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/crons.ts` | Daily cron that calls `completeOldBookings` |
| Create | `convex/reviews.ts` | `submitReview` mutation, `getPropertyReviews` query, `getReviewByBooking` query |
| Modify | `app/(protected)/trips/page.tsx` | "Leave a review" button + inline review modal |
| Modify | `app/properties/[id]/PropertyDetailClient.tsx` | Reviews section below house rules |

---

## Task 1: Daily cron to complete past bookings

Bookings need status `"completed"` before a guest can review. The mutation already exists — we just need to schedule it.

**Files:**
- Create: `convex/crons.ts`

- [ ] **Step 1: Create `convex/crons.ts`**

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "complete old bookings",
  { hourUTC: 0, minuteUTC: 0 },
  internal.bookings.completeOldBookings,
);

export default crons;
```

- [ ] **Step 2: Push to Convex**

```bash
cd c:\dev\airbnb2\airbnb && npx convex dev --once
```

Expected: deploys cleanly, output mentions the cron job registered.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/convex/crons.ts && git commit -m "feat: daily cron to mark past confirmed bookings as completed"
```

---

## Task 2: Convex reviews backend

**Files:**
- Create: `convex/reviews.ts`

- [ ] **Step 1: Create `convex/reviews.ts`**

```ts
// convex/reviews.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submitReview = mutation({
  args: {
    bookingId: v.id("bookings"),
    rating: v.number(),
    comment: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.rating < 1 || args.rating > 5) throw new Error("Rating must be 1–5");

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
    if (booking.guestId !== user._id) throw new Error("Not your booking");
    if (booking.status !== "completed") throw new Error("Booking not completed yet");

    const existing = await ctx.db
      .query("reviews")
      .withIndex("by_booking_id", (q) => q.eq("bookingId", args.bookingId))
      .unique();
    if (existing) throw new Error("You already reviewed this stay");

    await ctx.db.insert("reviews", {
      bookingId: args.bookingId,
      propertyId: booking.propertyId,
      guestId: user._id,
      rating: args.rating,
      comment: args.comment,
    });

    const property = await ctx.db.get(booking.propertyId);
    if (property) {
      const newCount = property.reviewCount + 1;
      const newAvg = (property.avgRating * property.reviewCount + args.rating) / newCount;
      await ctx.db.patch(property._id, {
        avgRating: Math.round(newAvg * 10) / 10,
        reviewCount: newCount,
      });
    }
  },
});

export const getPropertyReviews = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_property_id", (q) => q.eq("propertyId", args.propertyId))
      .order("desc")
      .collect();

    return Promise.all(
      reviews.map(async (review) => {
        const guest = await ctx.db.get(review.guestId);
        return {
          ...review,
          guestName: guest?.name ?? "Guest",
          guestImage: guest?.imageUrl ?? null,
        };
      }),
    );
  },
});

export const getReviewByBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("reviews")
      .withIndex("by_booking_id", (q) => q.eq("bookingId", args.bookingId))
      .unique();
  },
});
```

- [ ] **Step 2: Push to Convex**

```bash
cd c:\dev\airbnb2\airbnb && npx convex dev --once
```

Expected: deploys cleanly, three new functions visible in generated types.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/convex/reviews.ts && git commit -m "feat: add reviews Convex backend (submitReview, getPropertyReviews, getReviewByBooking)"
```

---

## Task 3: "Leave a review" UI in trips page

Adds a "Review" button to completed booking cards and an inline review modal with a star picker.

**Files:**
- Modify: `app/(protected)/trips/page.tsx`

- [ ] **Step 1: Replace full file contents**

```tsx
// app/(protected)/trips/page.tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin, Star } from "lucide-react";
import { useState } from "react";

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

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="p-0.5 focus:outline-none"
        >
          <Star
            className={`h-7 w-7 transition-colors ${
              n <= (hovered || value)
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function TripsPage() {
  const bookings = useQuery(api.bookings.getGuestBookings, {});
  const cancelBooking = useMutation(api.bookings.cancelBooking);
  const submitReview = useMutation(api.reviews.submitReview);

  const [cancelId, setCancelId] = useState<Id<"bookings"> | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reviewBookingId, setReviewBookingId] = useState<Id<"bookings"> | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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

  const openReview = (id: Id<"bookings">) => {
    setReviewBookingId(id);
    setRating(0);
    setComment("");
    setReviewError(null);
  };

  const handleSubmitReview = async () => {
    if (!reviewBookingId || rating === 0) return;
    setSubmitting(true);
    setReviewError(null);
    try {
      await submitReview({ bookingId: reviewBookingId, rating, comment });
      setReviewBookingId(null);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
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
          <Link href="/search" className={buttonVariants({ className: "mt-4" })}>Find a place</Link>
        </div>
      )}

      <div className="space-y-4">
        {bookings?.map((booking) => (
          <BookingCard
            key={booking._id}
            booking={booking}
            onCancel={() => setCancelId(booking._id)}
            onReview={() => openReview(booking._id)}
          />
        ))}
      </div>

      {/* Cancel dialog */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">Cancel this trip?</h2>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Please check the cancellation policy before proceeding.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setCancelId(null)} disabled={cancelling}>Keep trip</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel trip"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewBookingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">Leave a review</h2>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Your rating</p>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-2">Your comment</p>
              <textarea
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={4}
                placeholder="How was your stay?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            {reviewError && (
              <p className="text-sm text-red-600">{reviewError}</p>
            )}
            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setReviewBookingId(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmitReview} disabled={submitting || rating === 0}>
                {submitting ? "Submitting…" : "Submit review"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BookingCard({
  booking,
  onCancel,
  onReview,
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
  onReview: () => void;
}) {
  const property = useQuery(api.properties.getProperty, { propertyId: booking.propertyId });
  const existingReview = useQuery(
    api.reviews.getReviewByBooking,
    { bookingId: booking._id },
  );
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
          <Link href={`/booking-confirmation/${booking._id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Details
          </Link>
          {(booking.status === "pending" || booking.status === "confirmed") && (
            <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {booking.status === "completed" && existingReview === null && (
            <Button size="sm" onClick={onReview}>
              Leave a review
            </Button>
          )}
          {booking.status === "completed" && existingReview && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span>{existingReview.rating}/5 reviewed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd c:\dev\airbnb2\airbnb && npx tsc --noEmit 2>&1 | grep -E "trips" | head -10
```

Expected: no errors in this file. Pre-existing errors elsewhere are OK.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/(protected)/trips/page.tsx" && git commit -m "feat: leave a review button and modal in trips page"
```

---

## Task 4: Reviews section on property detail page

Adds a reviews list below house rules, showing reviewer name, star rating, comment, and date.

**Files:**
- Modify: `app/properties/[id]/PropertyDetailClient.tsx`

- [ ] **Step 1: Read the current file**

Read `c:\dev\airbnb2\airbnb\app\properties\[id]\PropertyDetailClient.tsx` in full to find the exact insertion point (after the house rules section and its `<Separator />`).

- [ ] **Step 2: Add the reviews query**

After the existing `const bookedDates = useQuery(...)` line, add:

```tsx
  const reviews = useQuery(api.reviews.getPropertyReviews, { propertyId: property._id });
```

- [ ] **Step 3: Add the reviews section**

After the house rules block (the `{property.houseRules.length > 0 && (...)}` section and its following `<Separator />`), add:

```tsx
          {/* Reviews */}
          {(reviews?.length ?? 0) > 0 && (
            <>
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">Reviews</h2>
                  <span className="flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{property.avgRating.toFixed(1)}</span>
                    <span className="text-muted-foreground">({property.reviewCount})</span>
                  </span>
                </div>
                <div className="space-y-5">
                  {reviews?.map((review) => (
                    <div key={review._id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {review.guestImage ? (
                            <img src={review.guestImage} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                              {review.guestName[0]?.toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm font-medium">{review.guestName}</span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`h-3.5 w-3.5 ${n <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}
```

- [ ] **Step 4: TypeScript check**

```bash
cd c:\dev\airbnb2\airbnb && npx tsc --noEmit 2>&1 | grep -E "PropertyDetailClient" | head -10
```

Expected: no errors in this file.

- [ ] **Step 5: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/properties/[id]/PropertyDetailClient.tsx" && git commit -m "feat: reviews section on property detail page"
```

---

## Testing Phase 5

Since the cron runs at midnight UTC, you need to manually trigger `completeOldBookings` to test reviews:

1. Go to **Convex Dashboard** → your project → **Functions**
2. Find `bookings:completeOldBookings` → click **Run** (no args needed)
3. Your confirmed bookings with past checkout dates will flip to "Completed"
4. Go to `/trips` → the booking now shows "Leave a review" button
5. Click it → select stars → write a comment → Submit
6. Go to the property page → scroll to reviews section → your review appears
7. The star rating in the header updates automatically

---

## Done

Phase 5 is complete when:
- Daily cron registered in Convex ✓
- Completed bookings show "Leave a review" button in `/trips` ✓
- Star picker works (hover + click) ✓
- Review modal submits and closes ✓
- Already-reviewed bookings show "X/5 reviewed" instead of button ✓
- Property detail page shows reviews section with names, stars, comments ✓
- `avgRating` and `reviewCount` update after each review ✓
