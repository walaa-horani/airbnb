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

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-04-22.dahlia" });
const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.RESEND_FROM_EMAIL ?? "Airbnb Clone <onboarding@resend.dev>";

export async function POST(req: NextRequest) {
  // ConvexHttpClient is per-request to prevent auth token leaking between concurrent requests
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  convex.setAuth(token);

  const { bookingId, reason } = (await req.json()) as {
    bookingId: string;
    reason?: string;
  };
  if (!bookingId) return NextResponse.json({ error: "Missing bookingId" }, { status: 400 });

  // getBooking enforces ownership — returns null if caller is not guest or host
  const booking = await convex.query(api.bookings.getBooking, {
    bookingId: bookingId as Id<"bookings">,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Already cancelled" }, { status: 400 });
  }

  // Cancel in Convex — mutation also enforces ownership
  await convex.mutation(api.bookings.cancelBooking, {
    bookingId: bookingId as Id<"bookings">,
    reason: reason ?? "Cancelled by user",
  });

  // Find the PaymentIntent — stored on booking if webhook fired, otherwise search Stripe by metadata
  let paymentIntentId = booking.paymentIntentId ?? null;

  if (!paymentIntentId) {
    try {
      const result = await stripe.paymentIntents.search({
        query: `metadata['bookingId']:'${bookingId}' AND status:'succeeded'`,
      });
      if (result.data.length > 0) paymentIntentId = result.data[0].id;
    } catch (err) {
      console.error("Stripe PI search error:", err);
    }
  }

  let refundAmount = 0;
  if (paymentIntentId) {
    try {
      const refund = await stripe.refunds.create({
        payment_intent: paymentIntentId,
        reverse_transfer: true, // reclaim funds from host's Connect account balance
      });
      refundAmount = refund.amount;
    } catch (err) {
      console.error("Stripe refund error:", err);
    }
  }

  // Fetch only public profile fields for emails (name + email, no PII)
  const [property, guest, host] = await Promise.all([
    convex.query(api.properties.getProperty, { propertyId: booking.propertyId }),
    convex.query(api.users.getUserPublicProfile, { userId: booking.guestId }),
    convex.query(api.users.getUserPublicProfile, { userId: booking.hostId }),
  ]);

  if (property && guest && host) {
    const [guestHtml, hostHtml] = await Promise.all([
      render(
        BookingCancelledGuest({
          guestName: guest.name,
          propertyTitle: property.title,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          refundAmount,
          bookingId: booking._id,
        }),
      ),
      render(
        BookingCancelledHost({
          hostName: host.name,
          guestName: guest.name,
          propertyTitle: property.title,
          checkIn: booking.checkIn,
          checkOut: booking.checkOut,
          bookingId: booking._id,
        }),
      ),
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
