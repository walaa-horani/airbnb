// airbnb/convex/propertyImages.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPropertyImages = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", args.propertyId))
      .order("asc")
      .collect();
  },
});

export const addPropertyImage = mutation({
  args: {
    propertyId: v.id("properties"),
    cloudinaryPublicId: v.string(),
    url: v.string(),
    order: v.number(),
    isCover: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    const imageId = await ctx.db.insert("propertyImages", args);

    if (args.isCover) {
      await ctx.db.patch(args.propertyId, {
        coverImageUrl: args.url,
        coverImagePublicId: args.cloudinaryPublicId,
      });
    }

    return imageId;
  },
});

export const removePropertyImage = mutation({
  args: { imageId: v.id("propertyImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const image = await ctx.db.get(args.imageId);
    if (!image) throw new Error("Image not found");

    const property = await ctx.db.get(image.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.delete(args.imageId);

    if (image.isCover) {
      const next = await ctx.db
        .query("propertyImages")
        .withIndex("by_property_id", (q) => q.eq("propertyId", image.propertyId))
        .first();

      if (next) {
        await ctx.db.patch(next._id, { isCover: true });
        await ctx.db.patch(image.propertyId, {
          coverImageUrl: next.url,
          coverImagePublicId: next.cloudinaryPublicId,
        });
      } else {
        await ctx.db.patch(image.propertyId, {
          coverImageUrl: "",
          coverImagePublicId: "",
        });
      }
    }
  },
});

export const setCoverImage = mutation({
  args: { imageId: v.id("propertyImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const image = await ctx.db.get(args.imageId);
    if (!image) throw new Error("Image not found");

    const property = await ctx.db.get(image.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    const currentCover = await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", image.propertyId))
      .filter((q) => q.eq(q.field("isCover"), true))
      .first();

    if (currentCover) {
      await ctx.db.patch(currentCover._id, { isCover: false });
    }

    await ctx.db.patch(args.imageId, { isCover: true });
    await ctx.db.patch(image.propertyId, {
      coverImageUrl: image.url,
      coverImagePublicId: image.cloudinaryPublicId,
    });
  },
});

export const reorderPropertyImages = mutation({
  args: {
    propertyId: v.id("properties"),
    orderedImageIds: v.array(v.id("propertyImages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    for (let i = 0; i < args.orderedImageIds.length; i++) {
      await ctx.db.patch(args.orderedImageIds[i], { order: i });
    }
  },
});
