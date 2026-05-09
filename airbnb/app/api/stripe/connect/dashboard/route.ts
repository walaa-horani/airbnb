// Returns a Stripe Express dashboard login link for the connected account
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

export async function GET() {
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

  const account = await convex.query(api.stripeAccounts.getMyStripeAccount, {});

  if (!account?.stripeAccountId) {
    return NextResponse.json({ error: "No connected account" }, { status: 400 });
  }

  const loginLink = await stripe.accounts.createLoginLink(account.stripeAccountId);
  return NextResponse.json({ url: loginLink.url });
}
