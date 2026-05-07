// airbnb/convex/webhooks/clerk.ts
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const clerkWebhook = httpAction(async (ctx, req) => {
  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();

  const result = await ctx.runAction(internal.webhooks.clerkNode.verifyAndProcess, {
    body,
    svixId,
    svixTimestamp,
    svixSignature,
  });

  if (!result.ok) {
    return new Response(result.error, { status: result.status });
  }

  return new Response("OK", { status: 200 });
});
