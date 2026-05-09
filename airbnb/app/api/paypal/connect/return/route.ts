// app/api/paypal/connect/return/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest) {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return NextResponse.redirect(`${appUrl}/sign-in`);
  convex.setAuth(token);

  const { searchParams } = new URL(req.url);
  const trackingId = searchParams.get("trackingId") ?? "";
  const merchantId = searchParams.get("merchantIdInPayPal") ?? "";
  const permissionsGranted = searchParams.get("permissionsGranted") === "true";

  if (merchantId && permissionsGranted) {
    await convex.mutation(api.paypalAccounts.upsertPayPalAccount, {
      paypalMerchantId: merchantId,
      trackingId,
      status: "active",
    });
  }

  return NextResponse.redirect(`${appUrl}/host/payouts?paypal=return`);
}
