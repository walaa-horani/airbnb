// airbnb/convex/webhooks/clerkNode.ts
"use node";

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";
import { v } from "convex/values";

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

    let event: {
      type: string;
      data: {
        id: string;
        email_addresses: Array<{ email_address: string }>;
        first_name: string | null;
        last_name: string | null;
        image_url: string;
      };
    };

    try {
      event = wh.verify(args.body, {
        "svix-id": args.svixId,
        "svix-timestamp": args.svixTimestamp,
        "svix-signature": args.svixSignature,
      }) as typeof event;
    } catch {
      return { ok: false as const, error: "Invalid signature", status: 400 };
    }

    if (event.type === "user.created" || event.type === "user.updated") {
      const { id, email_addresses, first_name, last_name, image_url } = event.data;

      const clerkDomain = process.env.CLERK_FRONTEND_API_URL ?? "";
      const tokenIdentifier = `${clerkDomain}|${id}`;

      await ctx.runMutation(internal.users.upsertFromWebhook, {
        clerkId: id,
        email: email_addresses[0]?.email_address ?? "",
        name: `${first_name ?? ""} ${last_name ?? ""}`.trim(),
        imageUrl: image_url || undefined,
        tokenIdentifier,
      });
    }

    return { ok: true as const };
  },
});
