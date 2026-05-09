// airbnb/convex/stripeAccounts.ts
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getMyStripeAccount = query({
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
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();
  },
});

// Called from Next.js API route after creating the Stripe account
export const upsertStripeAccount = mutation({
  args: {
    stripeAccountId: v.string(),
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
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", user._id))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { stripeAccountId: args.stripeAccountId });
      return existing._id;
    }

    return await ctx.db.insert("stripeAccounts", {
      userId: user._id,
      stripeAccountId: args.stripeAccountId,
      status: "pending",
      chargesEnabled: false,
      payoutsEnabled: false,
    });
  },
});

// Called by Stripe webhook to sync account status
export const updateStripeAccountByStripeId = internalMutation({
  args: {
    stripeAccountId: v.string(),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("stripeAccounts")
      .filter((q) => q.eq(q.field("stripeAccountId"), args.stripeAccountId))
      .unique();

    if (!account) return null;

    const status =
      args.chargesEnabled && args.payoutsEnabled
        ? "active"
        : args.chargesEnabled
          ? "restricted"
          : "pending";

    await ctx.db.patch(account._id, {
      chargesEnabled: args.chargesEnabled,
      payoutsEnabled: args.payoutsEnabled,
      status,
    });

    return account._id;
  },
});

export const getStripeAccountByStripeId = internalQuery({
  args: { stripeAccountId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stripeAccounts")
      .filter((q) => q.eq(q.field("stripeAccountId"), args.stripeAccountId))
      .unique();
  },
});

export const getStripeAccountForHost = query({
  args: { hostId: v.id("users") },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("stripeAccounts")
      .withIndex("by_user_id", (q) => q.eq("userId", args.hostId))
      .unique();
    if (!account) return null;
    return { stripeAccountId: account.stripeAccountId, chargesEnabled: account.chargesEnabled };
  },
});
