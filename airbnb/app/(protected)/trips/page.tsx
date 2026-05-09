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
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: cancelId, reason: "Cancelled by guest" }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to cancel booking");
      }
    } catch (err) {
      console.error("Cancel error:", err);
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
        <div className="flex gap-2 items-center">
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
