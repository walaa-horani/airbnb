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

  const { bookingId } = (await req.json()) as { bookingId: string };
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
    render(
      BookingConfirmedGuest({
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
      }),
    ),
    render(
      NewBookingHost({
        hostName: host.name,
        guestName: guest.name,
        propertyTitle: property.title,
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        nights,
        hostPayout: booking.hostPayout,
        bookingId: booking._id,
      }),
    ),
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
