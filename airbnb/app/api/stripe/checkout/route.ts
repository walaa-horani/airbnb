// app/api/stripe/checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });

  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Token error" }, { status: 401 });
  convex.setAuth(token);

  const { bookingId } = await req.json() as { bookingId: string };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  const booking = await convex.query(api.bookings.getBooking, {
    bookingId: bookingId as Id<"bookings">,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status !== "pending") return NextResponse.json({ error: "Booking already processed" }, { status: 400 });

  const hostAccount = await convex.query(api.stripeAccounts.getStripeAccountForHost, {
    hostId: booking.hostId,
  });
  if (!hostAccount?.chargesEnabled) {
    return NextResponse.json({ error: "Host payment account not ready" }, { status: 400 });
  }

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
