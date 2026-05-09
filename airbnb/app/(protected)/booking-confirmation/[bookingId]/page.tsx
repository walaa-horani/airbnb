// app/(protected)/booking-confirmation/[bookingId]/page.tsx
"use client";

import { use, Suspense, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
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

  const emailSent = useRef(false);
  useEffect(() => {
    if (redirectStatus === "succeeded" && booking && !emailSent.current) {
      emailSent.current = true;
      fetch("/api/emails/booking-confirmed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking._id }),
      }).catch(() => {/* email is best-effort */});
    }
  }, [redirectStatus, booking]);

  if (booking === undefined) {
    return (
      <div className="flex items-center justify-center gap-3 py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Loading your booking…</span>
      </div>
    );
  }

  if (redirectStatus === "failed" || redirectStatus === "canceled") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Payment failed</h1>
        <p className="text-muted-foreground mb-6">
          Your payment was not processed. Your booking has not been confirmed.
        </p>
        <Link href={`/properties/${booking?.propertyId ?? ""}`} className={buttonVariants()}>
          Try again
        </Link>
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
        <Link href="/trips" className={buttonVariants()}>
          View my trips
        </Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Back to home
        </Link>
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
