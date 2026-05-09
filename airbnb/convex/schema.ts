// airbnb/convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("guest"), v.literal("host"), v.literal("both")),
    stripeCustomerId: v.optional(v.string()),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"]),

  properties: defineTable({
    hostId: v.id("users"),
    title: v.string(),
    description: v.string(),
    type: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("unlisted"),
    ),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    country: v.string(),
    lat: v.number(),
    lng: v.number(),
    pricePerNight: v.number(),
    cleaningFee: v.number(),
    maxGuests: v.number(),
    bedrooms: v.number(),
    beds: v.number(),
    bathrooms: v.number(),
    amenities: v.array(v.string()),
    houseRules: v.array(v.string()),
    checkInTime: v.string(),
    checkOutTime: v.string(),
    minNights: v.number(),
    maxNights: v.number(),
    instantBook: v.boolean(),
    coverImageUrl: v.string(),
    coverImagePublicId: v.string(),
    avgRating: v.number(),
    reviewCount: v.number(),
  })
    .index("by_host_id", ["hostId"])
    .index("by_status", ["status"])
    .index("by_city_and_status", ["city", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "type"],
    }),

  propertyImages: defineTable({
    propertyId: v.id("properties"),
    cloudinaryPublicId: v.string(),
    url: v.string(),
    order: v.number(),
    isCover: v.boolean(),
  }).index("by_property_id", ["propertyId"]),

  bookings: defineTable({
    propertyId: v.id("properties"),
    guestId: v.id("users"),
    hostId: v.id("users"),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    totalAmount: v.number(),
    platformFee: v.number(),
    hostPayout: v.number(),
    paymentMethod: v.union(v.literal("stripe"), v.literal("paypal")),
    paymentIntentId: v.optional(v.string()),
    paypalOrderId: v.optional(v.string()),
    paypalCaptureId: v.optional(v.string()),
    cancelledBy: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
  })
    .index("by_guest_id", ["guestId"])
    .index("by_host_id", ["hostId"])
    .index("by_property_id", ["propertyId"])
    .index("by_property_and_status", ["propertyId", "status"])
    .index("by_status", ["status"]),

  stripeAccounts: defineTable({
    userId: v.id("users"),
    stripeAccountId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("restricted"),
    ),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  }).index("by_user_id", ["userId"]),

  paypalAccounts: defineTable({
    userId: v.id("users"),
    paypalMerchantId: v.string(),
    trackingId: v.string(),
    status: v.union(v.literal("pending"), v.literal("active")),
  }).index("by_user_id", ["userId"]),

  reviews: defineTable({
    bookingId: v.id("bookings"),
    propertyId: v.id("properties"),
    guestId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
  })
    .index("by_booking_id", ["bookingId"])
    .index("by_property_id", ["propertyId"]),

  wishlists: defineTable({
    userId: v.id("users"),
    propertyId: v.id("properties"),
  }).index("by_user_and_property", ["userId", "propertyId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    relatedId: v.optional(v.string()),
  }).index("by_user_id", ["userId"]),

  // Tracks one-time operations like seed
  config: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
