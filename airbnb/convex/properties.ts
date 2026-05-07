// airbnb/convex/properties.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ── Queries ──────────────────────────────────────────────────────────────────

export const getProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

export const getPropertiesByHost = query({
  args: { paginationOpts: paginationOptsValidator },
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

    return await ctx.db
      .query("properties")
      .withIndex("by_host_id", (q) => q.eq("hostId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getPublishedProperties = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

const propertyFields = {
  title: v.string(),
  description: v.string(),
  type: v.string(),
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
};

export const createProperty = mutation({
  args: propertyFields,
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

    if (user.role === "guest") {
      await ctx.db.patch(user._id, { role: "host" });
    }

    return await ctx.db.insert("properties", {
      ...args,
      hostId: user._id,
      status: "draft",
      avgRating: 0,
      reviewCount: 0,
    });
  },
});

export const updateProperty = mutation({
  args: {
    propertyId: v.id("properties"),
    ...propertyFields,
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
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    const { propertyId, ...fields } = args;
    await ctx.db.patch(propertyId, fields);
    return propertyId;
  },
});

export const publishProperty = mutation({
  args: { propertyId: v.id("properties") },
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
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.propertyId, { status: "published" });
  },
});

export const unpublishProperty = mutation({
  args: { propertyId: v.id("properties") },
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
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.propertyId, { status: "unlisted" });
  },
});

export const deleteProperty = mutation({
  args: { propertyId: v.id("properties") },
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
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    const activeBookings = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .take(1);

    if (activeBookings.length > 0) {
      await ctx.db.patch(args.propertyId, { status: "unlisted" });
      return { deleted: false, unlisted: true };
    }

    const images = await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    for (const image of images) {
      await ctx.db.delete(image._id);
    }

    await ctx.db.delete(args.propertyId);
    return { deleted: true, unlisted: false };
  },
});
