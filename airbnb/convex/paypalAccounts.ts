import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyPayPalAccount = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return null;
    return await ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const upsertPayPalAccount = mutation({
  args: {
    paypalMerchantId: v.string(),
    trackingId: v.string(),
    status: v.union(v.literal("pending"), v.literal("active")),
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

    const existing = await ctx.db
      .query("paypalAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        paypalMerchantId: args.paypalMerchantId,
        trackingId: args.trackingId,
        status: args.status,
      });
      return existing._id;
    }

    return await ctx.db.insert("paypalAccounts", {
      userId: user._id,
      paypalMerchantId: args.paypalMerchantId,
      trackingId: args.trackingId,
      status: args.status,
    });
  },
});
