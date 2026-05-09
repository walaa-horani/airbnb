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
