// app/(protected)/checkout/[propertyId]/CheckoutClient.tsx
"use client";

import { useState, useCallback } from "react";
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
import { buttonVariants } from "@/components/ui/button";
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
      const newBookingId = await createBooking({
        propertyId,
        checkIn,
        checkOut,
        guests,
        paymentMethod: "stripe",
      });

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
        <Link href="/" className={buttonVariants({ className: "mt-4" })}>Go home</Link>
      </div>
    );
  }

  if (!checkIn || !checkOut || nights <= 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-lg font-medium">Invalid dates</p>
        <Link href={`/properties/${propertyId}`} className={buttonVariants({ variant: "outline", className: "mt-4" })}>
          ← Back to property
        </Link>
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

      {stage === "summary" && (
        <Button onClick={handleProceed} className="w-full" size="lg">
          Continue to payment
        </Button>
      )}

      {stage === "loading" && (
        <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Preparing your payment…</span>
        </div>
      )}

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
