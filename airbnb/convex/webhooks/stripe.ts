import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const idx = part.indexOf("=");
    if (idx !== -1) parts[part.slice(0, idx)] = part.slice(idx + 1);
  }
  const timestamp = parts["t"];
  const v1 = parts["v1"];
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison to prevent timing attacks on webhook signature
  if (expectedHex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

export const stripeWebhook = httpAction(async (ctx, req) => {
  const body = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");

  if (!signatureHeader) return new Response("No signature", { status: 400 });

  const valid = await verifyStripeSignature(
    body,
    signatureHeader,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
  if (!valid) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  if (event.type === "account.updated") {
    const account = event.data.object as {
      id: string;
      charges_enabled: boolean;
      payouts_enabled: boolean;
    };
    await ctx.runMutation(
      internal.stripeAccounts.updateStripeAccountByStripeId,
      {
        stripeAccountId: account.id,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      },
    );
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as {
      id: string;
      metadata: Record<string, string>;
    };
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      await ctx.runMutation(internal.bookings.confirmBookingFromWebhook, {
        bookingId,
        paymentIntentId: pi.id,
      });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
