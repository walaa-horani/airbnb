// airbnb/convex/users.ts
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Called by Clerk webhook — never called from client
export const upsertFromWebhook = internalMutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    tokenIdentifier: v.string(),
    stripeCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        imageUrl: args.imageUrl,
        tokenIdentifier: args.tokenIdentifier,
        // Only set stripeCustomerId if provided and not already set
        ...(args.stripeCustomerId && !existing.stripeCustomerId
          ? { stripeCustomerId: args.stripeCustomerId }
          : {}),
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      tokenIdentifier: args.tokenIdentifier,
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      imageUrl: args.imageUrl,
      role: "guest",
      stripeCustomerId: args.stripeCustomerId,
    });
  },
});

// Returns null when unauthenticated — safe to call from any client component
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
  },
});

// Upgrades a guest to host, or sets role to "both" if already a guest+host
export const becomeHost = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user) throw new Error("User not found");
    if (user.role === "host" || user.role === "both") return user._id;

    await ctx.db.patch(user._id, {
      role: user.role === "guest" ? "host" : "both",
    });

    return user._id;
  },
});

export const getUserById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Returns only the fields needed for emails — safe to call from server-side API routes
export const getUserPublicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { name: user.name, email: user.email, imageUrl: user.imageUrl };
  },
});

export const setStripeCustomerId = mutation({
  args: { stripeCustomerId: v.string() },
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
    await ctx.db.patch(user._id, { stripeCustomerId: args.stripeCustomerId });
  },
});
