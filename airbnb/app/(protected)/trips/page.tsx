"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, MapPin } from "lucide-react";
import { useState } from "react";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s + "T12:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_BADGE: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "Pending", variant: "secondary" },
  confirmed: { label: "Confirmed", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

export default function TripsPage() {
  const bookings = useQuery(api.bookings.getGuestBookings, {});
  const cancelBooking = useMutation(api.bookings.cancelBooking);
  const [cancelId, setCancelId] = useState<Id<"bookings"> | null>(null);
  const [cancelling, setCancelling] = useState(false);

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
          <p className="text-muted-foreground mt-1">
            When you book a place, it will appear here.
          </p>
          <Link
            href="/search"
            className={buttonVariants({ className: "mt-4" })}
          >
            Find a place
          </Link>
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

      {/* Simple inline confirm dialog */}
      {cancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl border p-6 max-w-sm w-full space-y-4">
            <h2 className="text-lg font-semibold">Cancel this trip?</h2>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. Please check the cancellation policy
              before proceeding.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setCancelId(null)}
                disabled={cancelling}
              >
                Keep trip
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? "Cancelling…" : "Cancel trip"}
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
  const property = useQuery(api.properties.getProperty, {
    propertyId: booking.propertyId,
  });
  const statusConfig = STATUS_BADGE[booking.status] ?? {
    label: booking.status,
    variant: "secondary" as const,
  };

  return (
    <div className="rounded-xl border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/properties/${booking.propertyId}`}
            className="font-semibold hover:underline line-clamp-1"
          >
            {property?.title ?? (
              <span className="text-muted-foreground text-sm">Loading…</span>
            )}
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
        <span>
          {formatDate(booking.checkIn)} → {formatDate(booking.checkOut)}
        </span>
        <span>
          · {booking.guests} guest{booking.guests !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <span className="font-semibold">{formatCents(booking.totalAmount)}</span>
        <div className="flex gap-2">
          <Link
            href={`/booking-confirmation/${booking._id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Details
          </Link>
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
