// app/api/paypal/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { auth } from "@clerk/nextjs/server";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const apiBase =
  process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";

async function getPayPalToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID!}:${process.env.PAYPAL_CLIENT_SECRET!}`,
  ).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function POST(req: NextRequest) {
  const { userId, getToken } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const token = await getToken({ template: "convex" });
  if (!token)
    return NextResponse.json({ error: "Token error" }, { status: 401 });
  convex.setAuth(token);

  const trackingId = `host-${userId}-${Date.now()}`;

  let accessToken: string;
  try {
    accessToken = await getPayPalToken();
  } catch {
    return NextResponse.json(
      { error: "Failed to authenticate with PayPal" },
      { status: 500 },
    );
  }

  const res = await fetch(`${apiBase}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tracking_id: trackingId,
      operations: [
        {
          operation: "API_INTEGRATION",
          api_integration_preference: {
            rest_api_integration: {
              integration_method: "PAYPAL",
              integration_type: "THIRD_PARTY",
              third_party_details: { features: ["PAYMENT", "REFUND"] },
            },
          },
        },
      ],
      products: ["EXPRESS_CHECKOUT"],
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
      partner_config_override: {
        return_url: `${appUrl}/api/paypal/connect/return?trackingId=${trackingId}`,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("PayPal partner-referrals error:", err);
    return NextResponse.json(
      { error: "Failed to create PayPal referral" },
      { status: 500 },
    );
  }

  const data = (await res.json()) as {
    links: Array<{ rel: string; href: string }>;
  };
  const actionLink = data.links.find((l) => l.rel === "action_url");
  if (!actionLink) {
    return NextResponse.json(
      { error: "No action URL returned by PayPal" },
      { status: 500 },
    );
  }

  await convex.mutation(api.paypalAccounts.upsertPayPalAccount, {
    paypalMerchantId: "",
    trackingId,
    status: "pending",
  });

  return NextResponse.json({ url: actionLink.href });
}
