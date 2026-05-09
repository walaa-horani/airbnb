// airbnb/convex/webhooks/clerkNode.ts
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";
import { v } from "convex/values";
import Stripe from "stripe";
import type { WebhookEvent } from "@clerk/backend";

export const verifyAndProcess = internalAction({
  args: {
    body: v.string(),
    svixId: v.string(),
    svixTimestamp: v.string(),
    svixSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return { ok: false as const, error: "CLERK_WEBHOOK_SECRET not configured", status: 500 };
    }

    const wh = new Webhook(webhookSecret);

    let event: WebhookEvent;

    try {
      event = wh.verify(args.body, {
        "svix-id": args.svixId,
        "svix-timestamp": args.svixTimestamp,
        "svix-signature": args.svixSignature,
      }) as WebhookEvent;
    } catch {
      return { ok: false as const, error: "Invalid signature", status: 400 };
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      const { id, email_addresses, first_name, last_name, image_url } = event.data;

      const clerkDomain = process.env.CLERK_FRONTEND_API_URL ?? "";
      const tokenIdentifier = `${clerkDomain}|${id}`;
      const email = email_addresses[0]?.email_address ?? "";
      const name = `${first_name ?? ""} ${last_name ?? ""}`.trim();

      let stripeCustomerId: string | undefined;

      // Create a Stripe customer only on new user registration
      if (event.type === "user.created" && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
            apiVersion: "2026-04-22.dahlia",
          });
          const customer = await stripe.customers.create({
            email,
            name: name || undefined,
            metadata: { clerkId: id },
          });
          stripeCustomerId = customer.id;
        } catch (err) {
          // Non-fatal — user is still created, payment will create customer lazily if needed
          console.error("Failed to create Stripe customer:", err);
        }
      }

      await ctx.runMutation(internal.users.upsertFromWebhook, {
        clerkId: id,
        email,
        name,
        imageUrl: image_url || undefined,
        tokenIdentifier,
        stripeCustomerId,
      });
    }

    return { ok: true as const };
  },
});
