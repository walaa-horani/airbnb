// POST  – creates (or retrieves existing) Stripe Express account and returns an onboarding URL
// GET   – returns a fresh account link for an already-created account (refresh flow)
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

function getAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (!url) throw new Error("NEXT_PUBLIC_APP_URL env var is not set");
  return url;
}

// Create a Stripe Express account and return the onboarding URL
export async function POST(req: NextRequest) {
  // ConvexHttpClient is per-request to prevent auth token leaking between concurrent requests
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });

  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    return NextResponse.json({ error: "Token error" }, { status: 401 });
  }
  convex.setAuth(token);

  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch {
    return NextResponse.json({ error: "Server misconfiguration: missing APP_URL" }, { status: 500 });
  }

  const existing = await convex.query(api.stripeAccounts.getMyStripeAccount, {});

  let stripeAccountId: string;

  if (existing?.stripeAccountId) {
    stripeAccountId = existing.stripeAccountId;
  } else {
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });
    stripeAccountId = account.id;
    await convex.mutation(api.stripeAccounts.upsertStripeAccount, { stripeAccountId });
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/api/stripe/connect?refresh=1`,
    return_url: `${appUrl}/host/payouts?stripe=return`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}

// Called when Stripe redirects back with ?refresh=1 (link expired)
export async function GET(req: NextRequest) {
  // ConvexHttpClient is per-request to prevent auth token leaking between concurrent requests
  const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: "2026-04-22.dahlia",
  });

  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch {
    return NextResponse.redirect("/sign-in");
  }

  const { userId, getToken } = await auth();
  if (!userId) {
    return NextResponse.redirect(`${appUrl}/sign-in`);
  }

  const token = await getToken({ template: "convex" });
  if (!token) {
    return NextResponse.redirect(`${appUrl}/host/payouts?error=token`);
  }
  convex.setAuth(token);

  const existing = await convex.query(api.stripeAccounts.getMyStripeAccount, {});

  if (!existing?.stripeAccountId) {
    return NextResponse.redirect(`${appUrl}/host/payouts?error=no_account`);
  }

  const accountLink = await stripe.accountLinks.create({
    account: existing.stripeAccountId,
    refresh_url: `${appUrl}/api/stripe/connect?refresh=1`,
    return_url: `${appUrl}/host/payouts?stripe=return`,
    type: "account_onboarding",
  });

  return NextResponse.redirect(accountLink.url);
}
