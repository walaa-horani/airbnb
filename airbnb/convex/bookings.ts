// airbnb/convex/bookings.ts
import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export const createBooking = mutation({
  args: {
    propertyId: v.id("properties"),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    paymentMethod: v.union(v.literal("stripe"), v.literal("paypal")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) throw new Error("User not found");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.status !== "published") throw new Error("Property not available");

    const confirmed = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .collect();

    if (
      confirmed.some((b) =>
        datesOverlap(args.checkIn, args.checkOut, b.checkIn, b.checkOut),
      )
    ) {
      throw new Error("These dates are no longer available");
    }

    const nights = Math.round(
      (new Date(args.checkOut).getTime() - new Date(args.checkIn).getTime()) /
        86400000,
    );
    const totalAmount = property.pricePerNight * nights + property.cleaningFee;
    const platformFee = Math.round(totalAmount * 0.05);
    const hostPayout = totalAmount - platformFee;

    return ctx.db.insert("bookings", {
      propertyId: args.propertyId,
      guestId: user._id,
      hostId: property.hostId,
      checkIn: args.checkIn,
      checkOut: args.checkOut,
      guests: args.guests,
      status: "pending",
      totalAmount,
      platformFee,
      hostPayout,
      paymentMethod: args.paymentMethod,
    });
  },
});

export const confirmBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    paymentIntentId: v.optional(v.string()),
    paypalCaptureId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new Error("Booking not found");
    if (booking.status === "confirmed") return;
    await ctx.db.patch(args.bookingId, {
      status: "confirmed",
      ...(args.paymentIntentId && { paymentIntentId: args.paymentIntentId }),
      ...(args.paypalCaptureId && { paypalCaptureId: args.paypalCaptureId }),
    });
  },
});

export const cancelBooking = mutation({
  args: {
    bookingId: v.id("bookings"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
    if (booking.guestId !== user._id && booking.hostId !== user._id)
      throw new Error("Unauthorized");

    await ctx.db.patch(args.bookingId, {
      status: "cancelled",
      cancelledBy: user._id === booking.guestId ? "guest" : "host",
      cancelledAt: Date.now(),
      cancellationReason: args.reason,
    });
  },
});

export const getBooking = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) return null;
    if (booking.guestId !== user._id && booking.hostId !== user._id)
      return null;
    return booking;
  },
});

export const getBookingById = query({
  args: { bookingId: v.id("bookings") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.bookingId);
  },
});

export const getGuestBookings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    return ctx.db
      .query("bookings")
      .withIndex("by_guest_id", (q) => q.eq("guestId", user._id))
      .order("desc")
      .collect();
  },
});

export const getHostBookings = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    return ctx.db
      .query("bookings")
      .withIndex("by_host_id", (q) => q.eq("hostId", user._id))
      .order("desc")
      .collect();
  },
});

export const getBookedDates = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .collect();
    return bookings.map((b) => ({ checkIn: b.checkIn, checkOut: b.checkOut }));
  },
});

export const completeOldBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_status", (q) => q.eq("status", "confirmed"))
      .collect();
    for (const booking of bookings) {
      if (booking.checkOut < today) {
        await ctx.db.patch(booking._id, { status: "completed" });
      }
    }
  },
});

export const cleanupAbandonedBookings = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const bookings = await ctx.db
      .query("bookings")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();
    for (const booking of bookings) {
      if (booking._creationTime < cutoff) {
        // Mark as cancelled (not deleted) to preserve audit trail.
        // Hard-deleting risks losing a booking that was paid but whose webhook
        // hasn't fired yet — the PaymentIntent would exist with no matching record.
        await ctx.db.patch(booking._id, {
          status: "cancelled",
          cancelledBy: "guest",
          cancelledAt: Date.now(),
          cancellationReason: "Payment not completed within 2 hours",
        });
      }
    }
  },
});

export const confirmBookingFromWebhook = internalMutation({
  args: {
    bookingId: v.string(),
    paymentIntentId: v.string(),
  },
  handler: async (ctx, args) => {
    const booking = await ctx.db.get(args.bookingId as Id<"bookings">);
    if (!booking || booking.status === "confirmed") return;
    await ctx.db.patch(booking._id, {
      status: "confirmed",
      paymentIntentId: args.paymentIntentId,
    });
  },
});
