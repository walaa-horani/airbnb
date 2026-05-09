// convex/wishlists.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const toggleWishlist = mutation({
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

    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    } else {
      await ctx.db.insert("wishlists", {
        userId: user._id,
        propertyId: args.propertyId,
      });
      return true;
    }
  },
});

export const isWishlisted = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return false;
    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();
    return !!existing;
  },
});

export const getUserWishlists = query({
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
    const wishlists = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) => q.eq("userId", user._id))
      .collect();
    const properties = await Promise.all(
      wishlists.map((w) => ctx.db.get(w.propertyId)),
    );
    return properties.filter((p) => p !== null);
  },
});
