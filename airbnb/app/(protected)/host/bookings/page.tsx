"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        <Link href={`/booking-confirmation/${booking._id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
          View details
        </Link>
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
