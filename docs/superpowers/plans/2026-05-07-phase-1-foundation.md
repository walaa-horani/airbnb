# Phase 1: Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up Clerk auth (proxy mode, no middleware), define the full Convex schema, sync users via Clerk webhook, install shadcn/ui, and seed 20 realistic properties for testing.

**Architecture:** Clerk handles auth via proxy rewrites in `next.config.ts` — no `middleware.ts`. The `ConvexClientProvider` uses `ConvexProviderWithAuth` with a custom hook that bridges Clerk's `useAuth` to Convex's expected interface. A Convex HTTP action at `/clerk-webhook` verifies Svix signatures and upserts users via an internal mutation. All 9 schema tables are defined upfront so later phases can build on them without migrations.

**Tech Stack:** Next.js 16 App Router · Convex v1 · Clerk v7 (`@clerk/nextjs`) · shadcn/ui · Tailwind v4 · svix (webhook verification) · pnpm

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `airbnb/next.config.ts` | Modify | Clerk proxy rewrites |
| `airbnb/app/layout.tsx` | Modify | ClerkProvider with proxyUrl |
| `airbnb/components/ConvexClientProvider.tsx` | Modify | ConvexProviderWithAuth + useAuthFromClerk hook |
| `airbnb/convex/schema.ts` | Modify | Full 9-table schema |
| `airbnb/convex/users.ts` | Create | `upsertFromWebhook` (internal), `getCurrentUser` (public), `updateRole` (public) |
| `airbnb/convex/http.ts` | Create | HTTP router wiring |
| `airbnb/convex/webhooks/clerk.ts` | Create | Clerk webhook HTTP action (Node runtime) |
| `airbnb/convex/seed.ts` | Create | Seed mutation — 20 properties + 3 host users |
| `airbnb/app/sign-in/[[...sign-in]]/page.tsx` | Create | Clerk-hosted sign-in page |
| `airbnb/app/sign-up/[[...sign-up]]/page.tsx` | Create | Clerk-hosted sign-up page |
| `airbnb/app/(protected)/layout.tsx` | Create | Server-side auth guard for protected routes |
| `airbnb/lib/auth.ts` | Create | `requireAuth()` helper for server components |
| `airbnb/.env.local` | Create | All required env var keys (values blank) |

---

## Task 1: Install dependencies

**Files:**
- Modify: `airbnb/package.json` (via pnpm)

- [ ] **Step 1: Install svix for webhook verification**

```bash
cd airbnb && pnpm add svix
```

Expected: `svix` added to `dependencies`.

- [ ] **Step 2: Verify convex and clerk versions are correct**

```bash
pnpm list convex @clerk/nextjs @clerk/react
```

Expected output includes:
```
convex 1.x.x
@clerk/nextjs 7.x.x
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add airbnb/package.json airbnb/pnpm-lock.yaml
git commit -m "feat: install svix for webhook verification"
```

---

## Task 2: Create environment variable template

**Files:**
- Create: `airbnb/.env.local`

- [ ] **Step 1: Create .env.local with all required keys**

Create `airbnb/.env.local`:

```bash
# Convex
NEXT_PUBLIC_CONVEX_URL=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
CLERK_FRONTEND_API_URL=
NEXT_PUBLIC_CLERK_PROXY_URL=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Cloudinary (Phase 2)
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=

# Mapbox (Phase 3)
NEXT_PUBLIC_MAPBOX_TOKEN=

# Stripe (Phase 5)
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PLATFORM_FEE_PERCENT=5

# PayPal (Phase 5)
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
NEXT_PUBLIC_PAYPAL_CLIENT_ID=
PAYPAL_WEBHOOK_ID=

# Resend (Phase 6)
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

- [ ] **Step 2: Verify .env.local is gitignored**

```bash
cat airbnb/.gitignore | grep env
```

Expected: `.env*.local` appears in output. If not:

```bash
echo ".env*.local" >> airbnb/.gitignore
```

- [ ] **Step 3: Commit .gitignore if changed**

```bash
git add airbnb/.gitignore
git commit -m "chore: ensure .env.local is gitignored"
```

---

## Task 3: Configure Clerk proxy in next.config.ts

**Files:**
- Modify: `airbnb/next.config.ts`

The Clerk proxy routes all Clerk frontend API calls through the app's own domain, eliminating the need for `middleware.ts`.

- [ ] **Step 1: Replace next.config.ts**

```typescript
// airbnb/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/clerk-proxy/:path*",
        destination: `${process.env.CLERK_FRONTEND_API_URL}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: "res.cloudinary.com" },
      { hostname: "img.clerk.com" },
      { hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 2: Update app/layout.tsx to pass proxyUrl to ClerkProvider**

```tsx
// airbnb/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { ClerkProvider } from "@clerk/nextjs";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "StayFinder — Find your perfect stay",
  description: "Book unique homes and experiences around the world.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider
          proxyUrl={`${process.env.NEXT_PUBLIC_APP_URL}/clerk-proxy`}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          afterSignInUrl="/"
          afterSignUpUrl="/"
        >
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add airbnb/next.config.ts airbnb/app/layout.tsx
git commit -m "feat: configure Clerk proxy mode — no middleware"
```

---

## Task 4: Update ConvexClientProvider for authenticated Convex

**Files:**
- Modify: `airbnb/components/ConvexClientProvider.tsx`

`ConvexProviderWithAuth` requires a hook returning `{ isLoading, isAuthenticated, fetchAccessToken }`. We bridge Clerk's `useAuth` to that interface.

- [ ] **Step 1: Replace ConvexClientProvider.tsx**

```tsx
// airbnb/components/ConvexClientProvider.tsx
"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/nextjs";
import { useCallback } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function useAuthFromClerk() {
  const { isLoaded, isSignedIn, getToken } = useAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      return (await getToken({ template: "convex", skipCache: forceRefreshToken })) ?? null;
    },
    [getToken],
  );

  return {
    isLoading: !isLoaded,
    isAuthenticated: isSignedIn ?? false,
    fetchAccessToken,
  };
}

export default function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromClerk}>
      {children}
    </ConvexProviderWithAuth>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add airbnb/components/ConvexClientProvider.tsx
git commit -m "feat: wire ConvexProviderWithAuth with Clerk useAuth bridge"
```

---

## Task 5: Define the full Convex schema

**Files:**
- Modify: `airbnb/convex/schema.ts`

All 9 tables defined upfront. Monetary values in cents. Dates as `YYYY-MM-DD` strings.

- [ ] **Step 1: Replace schema.ts with full schema**

```typescript
// airbnb/convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    imageUrl: v.optional(v.string()),
    role: v.union(v.literal("guest"), v.literal("host"), v.literal("both")),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_id", ["clerkId"]),

  properties: defineTable({
    hostId: v.id("users"),
    title: v.string(),
    description: v.string(),
    type: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("published"),
      v.literal("unlisted"),
    ),
    address: v.string(),
    city: v.string(),
    state: v.string(),
    country: v.string(),
    lat: v.number(),
    lng: v.number(),
    pricePerNight: v.number(),
    cleaningFee: v.number(),
    maxGuests: v.number(),
    bedrooms: v.number(),
    beds: v.number(),
    bathrooms: v.number(),
    amenities: v.array(v.string()),
    houseRules: v.array(v.string()),
    checkInTime: v.string(),
    checkOutTime: v.string(),
    minNights: v.number(),
    maxNights: v.number(),
    instantBook: v.boolean(),
    coverImageUrl: v.string(),
    coverImagePublicId: v.string(),
    avgRating: v.number(),
    reviewCount: v.number(),
  })
    .index("by_host_id", ["hostId"])
    .index("by_status", ["status"])
    .index("by_city_and_status", ["city", "status"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["status", "type"],
    }),

  propertyImages: defineTable({
    propertyId: v.id("properties"),
    cloudinaryPublicId: v.string(),
    url: v.string(),
    order: v.number(),
    isCover: v.boolean(),
  }).index("by_property_id", ["propertyId"]),

  bookings: defineTable({
    propertyId: v.id("properties"),
    guestId: v.id("users"),
    hostId: v.id("users"),
    checkIn: v.string(),
    checkOut: v.string(),
    guests: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("completed"),
    ),
    totalAmount: v.number(),
    platformFee: v.number(),
    hostPayout: v.number(),
    paymentMethod: v.union(v.literal("stripe"), v.literal("paypal")),
    paymentIntentId: v.optional(v.string()),
    paypalOrderId: v.optional(v.string()),
    paypalCaptureId: v.optional(v.string()),
    cancelledBy: v.optional(v.string()),
    cancelledAt: v.optional(v.number()),
    cancellationReason: v.optional(v.string()),
  })
    .index("by_guest_id", ["guestId"])
    .index("by_host_id", ["hostId"])
    .index("by_property_id", ["propertyId"])
    .index("by_property_and_status", ["propertyId", "status"])
    .index("by_status", ["status"]),

  stripeAccounts: defineTable({
    userId: v.id("users"),
    stripeAccountId: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("restricted"),
    ),
    chargesEnabled: v.boolean(),
    payoutsEnabled: v.boolean(),
  }).index("by_user_id", ["userId"]),

  paypalAccounts: defineTable({
    userId: v.id("users"),
    paypalMerchantId: v.string(),
    trackingId: v.string(),
    status: v.union(v.literal("pending"), v.literal("active")),
  }).index("by_user_id", ["userId"]),

  reviews: defineTable({
    bookingId: v.id("bookings"),
    propertyId: v.id("properties"),
    guestId: v.id("users"),
    rating: v.number(),
    comment: v.string(),
  })
    .index("by_booking_id", ["bookingId"])
    .index("by_property_id", ["propertyId"]),

  wishlists: defineTable({
    userId: v.id("users"),
    propertyId: v.id("properties"),
  }).index("by_user_and_property", ["userId", "propertyId"]),

  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    read: v.boolean(),
    relatedId: v.optional(v.string()),
  }).index("by_user_id", ["userId"]),

  // Tracks one-time operations like seed
  config: defineTable({
    key: v.string(),
    value: v.string(),
  }).index("by_key", ["key"]),
});
```

- [ ] **Step 2: Verify schema compiles by pushing to Convex**

```bash
cd airbnb && npx convex dev --once
```

Expected: Convex reports schema push success, no type errors.

- [ ] **Step 3: Commit**

```bash
cd .. && git add airbnb/convex/schema.ts
git commit -m "feat: define full 10-table Convex schema"
```

---

## Task 6: Create Convex user functions

**Files:**
- Create: `airbnb/convex/users.ts`

- [ ] **Step 1: Create convex/users.ts**

```typescript
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

// Upgrades a guest to host, or sets role to "both" if already host
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
```

- [ ] **Step 2: Commit**

```bash
git add airbnb/convex/users.ts
git commit -m "feat: add Convex user mutations and queries"
```

---

## Task 7: Create Convex HTTP router and Clerk webhook handler

**Files:**
- Create: `airbnb/convex/http.ts`
- Create: `airbnb/convex/webhooks/clerk.ts`

The webhook handler uses the Node.js runtime (for `svix`) and calls `upsertFromWebhook` as an internal mutation.

- [ ] **Step 1: Create convex/webhooks/clerk.ts**

```typescript
// airbnb/convex/webhooks/clerk.ts
"use node";

import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";

export const clerkWebhook = httpAction(async (ctx, req) => {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return new Response("CLERK_WEBHOOK_SECRET not configured", { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
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
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return new Response("Invalid signature", { status: 400 });
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

  return new Response("OK", { status: 200 });
});
```

- [ ] **Step 2: Create convex/http.ts**

```typescript
// airbnb/convex/http.ts
import { httpRouter } from "convex/server";
import { clerkWebhook } from "./webhooks/clerk";

const http = httpRouter();

http.route({
  path: "/clerk-webhook",
  method: "POST",
  handler: clerkWebhook,
});

export default http;
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd airbnb && npx convex dev --once
```

Expected: Convex compiles without errors.

- [ ] **Step 4: Commit**

```bash
cd .. && git add airbnb/convex/http.ts airbnb/convex/webhooks/clerk.ts
git commit -m "feat: Convex HTTP router + Clerk webhook handler"
```

---

## Task 8: Create sign-in and sign-up pages

**Files:**
- Create: `airbnb/app/sign-in/[[...sign-in]]/page.tsx`
- Create: `airbnb/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Create sign-in page**

```tsx
// airbnb/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn />
    </div>
  );
}
```

- [ ] **Step 2: Create sign-up page**

```tsx
// airbnb/app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add airbnb/app/sign-in airbnb/app/sign-up
git commit -m "feat: add Clerk-hosted sign-in and sign-up pages"
```

---

## Task 9: Create auth guard for protected routes

**Files:**
- Create: `airbnb/lib/auth.ts`
- Create: `airbnb/app/(protected)/layout.tsx`

- [ ] **Step 1: Create auth helper**

```typescript
// airbnb/lib/auth.ts
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

// Call at the top of any server component or route handler that requires auth.
// Redirects to /sign-in if the user is not authenticated.
export async function requireAuth() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
}
```

- [ ] **Step 2: Create protected route group layout**

```tsx
// airbnb/app/(protected)/layout.tsx
import { requireAuth } from "@/lib/auth";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  return <>{children}</>;
}
```

- [ ] **Step 3: Commit**

```bash
git add airbnb/lib/auth.ts "airbnb/app/(protected)/layout.tsx"
git commit -m "feat: protected route group layout with requireAuth guard"
```

---

## Task 10: Initialize shadcn/ui

**Files:**
- Create: `airbnb/components/ui/` (via shadcn CLI)
- Create: `airbnb/lib/utils.ts` (via shadcn CLI)
- Create: `airbnb/components.json`

- [ ] **Step 1: Run shadcn init**

```bash
cd airbnb && npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Neutral**
- CSS variables: **Yes**

This creates `components.json`, `lib/utils.ts`, and updates `globals.css`.

- [ ] **Step 2: Install the base components needed for Phase 1**

```bash
npx shadcn@latest add button card badge avatar separator skeleton
```

- [ ] **Step 3: Verify components were created**

```bash
ls components/ui/
```

Expected: `button.tsx`, `card.tsx`, `badge.tsx`, `avatar.tsx`, `separator.tsx`, `skeleton.tsx`

- [ ] **Step 4: Commit**

```bash
cd .. && git add airbnb/components/ui airbnb/lib/utils.ts airbnb/components.json airbnb/app/globals.css
git commit -m "feat: initialize shadcn/ui with base components"
```

---

## Task 11: Create seed data

**Files:**
- Create: `airbnb/convex/seed.ts`

Seeds 3 host users and 20 properties. Uses picsum.photos URLs as image placeholders (replaced with real Cloudinary URLs in Phase 2). The `config` table prevents duplicate runs.

- [ ] **Step 1: Create convex/seed.ts**

```typescript
// airbnb/convex/seed.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";

const SEED_HOSTS = [
  {
    tokenIdentifier: "seed|host1",
    clerkId: "seed_host_1",
    email: "host1@seed.dev",
    name: "Alex Rivera",
    imageUrl: "https://picsum.photos/seed/host1/100/100",
    role: "host" as const,
  },
  {
    tokenIdentifier: "seed|host2",
    clerkId: "seed_host_2",
    email: "host2@seed.dev",
    name: "Priya Patel",
    imageUrl: "https://picsum.photos/seed/host2/100/100",
    role: "host" as const,
  },
  {
    tokenIdentifier: "seed|host3",
    clerkId: "seed_host_3",
    email: "host3@seed.dev",
    name: "Marco Bianchi",
    imageUrl: "https://picsum.photos/seed/host3/100/100",
    role: "host" as const,
  },
];

const SEED_PROPERTIES = [
  {
    title: "Luxury Manhattan Apartment",
    description: "Stunning high-rise apartment in the heart of Manhattan with breathtaking skyline views. Floor-to-ceiling windows, gourmet kitchen, and rooftop access.",
    type: "apartment", city: "New York", state: "NY", country: "USA",
    address: "432 Park Ave, New York, NY 10022",
    lat: 40.7614, lng: -73.9776,
    pricePerNight: 25000, cleaningFee: 5000,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 2,
    amenities: ["WiFi", "Kitchen", "Air conditioning", "Washer", "Dryer", "Gym", "Doorman", "City view"],
    houseRules: ["No smoking", "No pets", "No parties", "Quiet hours after 10pm"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 30, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop1/800/600",
    coverImagePublicId: "seed/prop1",
    hostIndex: 0,
  },
  {
    title: "Miami Beach Oceanfront Condo",
    description: "Wake up to ocean waves in this stunning beachfront condo. Direct beach access, infinity pool, and modern interiors designed for the ultimate Florida getaway.",
    type: "condo", city: "Miami", state: "FL", country: "USA",
    address: "1 Ocean Dr, Miami Beach, FL 33139",
    lat: 25.7825, lng: -80.1300,
    pricePerNight: 18000, cleaningFee: 4000,
    maxGuests: 6, bedrooms: 3, beds: 3, bathrooms: 2,
    amenities: ["WiFi", "Pool", "Beach access", "Kitchen", "Air conditioning", "Parking", "Balcony", "Ocean view"],
    houseRules: ["No smoking", "No parties", "Check-in after 3pm"],
    checkInTime: "15:00", checkOutTime: "10:00",
    minNights: 3, maxNights: 14, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop2/800/600",
    coverImagePublicId: "seed/prop2",
    hostIndex: 0,
  },
  {
    title: "Hollywood Hills Villa",
    description: "Iconic Hollywood Hills villa with panoramic LA views, private pool, home theater, and walking distance to the Griffith Observatory.",
    type: "villa", city: "Los Angeles", state: "CA", country: "USA",
    address: "2850 Outpost Dr, Los Angeles, CA 90068",
    lat: 34.1341, lng: -118.3215,
    pricePerNight: 55000, cleaningFee: 10000,
    maxGuests: 10, bedrooms: 5, beds: 6, bathrooms: 4,
    amenities: ["WiFi", "Pool", "Hot tub", "Home theater", "Kitchen", "BBQ", "Parking", "City view", "Air conditioning"],
    houseRules: ["No smoking indoors", "No events over 10 people", "Pets allowed with approval"],
    checkInTime: "16:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 14, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop3/800/600",
    coverImagePublicId: "seed/prop3",
    hostIndex: 1,
  },
  {
    title: "Chicago Loop Studio",
    description: "Stylish studio in Chicago's vibrant Loop district. Walking distance to Millennium Park, the Art Institute, and all major attractions.",
    type: "studio", city: "Chicago", state: "IL", country: "USA",
    address: "190 S LaSalle St, Chicago, IL 60603",
    lat: 41.8799, lng: -87.6318,
    pricePerNight: 9500, cleaningFee: 2000,
    maxGuests: 2, bedrooms: 0, beds: 1, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Air conditioning", "Washer", "City view", "Elevator"],
    houseRules: ["No smoking", "No pets", "Quiet after 11pm"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 1, maxNights: 30, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop4/800/600",
    coverImagePublicId: "seed/prop4",
    hostIndex: 1,
  },
  {
    title: "Paris Montmartre Artist Apartment",
    description: "Charming 19th-century apartment in Montmartre, steps from Sacré-Cœur. Exposed stone walls, original hardwood floors, and a cosy French aesthetic.",
    type: "apartment", city: "Paris", state: "Île-de-France", country: "France",
    address: "12 Rue Lepic, 75018 Paris",
    lat: 48.8853, lng: 2.3345,
    pricePerNight: 17000, cleaningFee: 3500,
    maxGuests: 3, bedrooms: 1, beds: 2, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Washer", "Heating", "City view"],
    houseRules: ["No smoking", "No parties", "Respect the neighbours"],
    checkInTime: "14:00", checkOutTime: "10:00",
    minNights: 3, maxNights: 21, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop5/800/600",
    coverImagePublicId: "seed/prop5",
    hostIndex: 2,
  },
  {
    title: "London Chelsea Victorian Flat",
    description: "Elegant Victorian flat in Chelsea, one of London's most prestigious neighbourhoods. High ceilings, sash windows, and a beautiful private garden.",
    type: "apartment", city: "London", state: "England", country: "UK",
    address: "45 Sloane Square, London SW1W 8AX",
    lat: 51.4925, lng: -0.1565,
    pricePerNight: 22000, cleaningFee: 5000,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Garden", "Washer", "Dishwasher", "Heating"],
    houseRules: ["No smoking", "No parties", "Pets considered on request"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 30, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop6/800/600",
    coverImagePublicId: "seed/prop6",
    hostIndex: 2,
  },
  {
    title: "Barcelona Gothic Quarter Piso",
    description: "Authentic apartment in the heart of Barcelona's Gothic Quarter. Steps from La Boqueria market and Las Ramblas. Sun-drenched terrace with city views.",
    type: "apartment", city: "Barcelona", state: "Catalonia", country: "Spain",
    address: "Carrer del Bisbe, 08002 Barcelona",
    lat: 41.3825, lng: 2.1769,
    pricePerNight: 12000, cleaningFee: 2500,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 1,
    amenities: ["WiFi", "Air conditioning", "Kitchen", "Washer", "Terrace", "City view"],
    houseRules: ["No smoking", "No parties", "Quiet hours after 11pm"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 21, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop7/800/600",
    coverImagePublicId: "seed/prop7",
    hostIndex: 0,
  },
  {
    title: "Tokyo Shinjuku Modern Studio",
    description: "Sleek minimalist studio in Shinjuku, perfectly positioned for exploring everything Tokyo has to offer. High-speed WiFi and capsule-hotel efficiency with apartment comfort.",
    type: "studio", city: "Tokyo", state: "Tokyo", country: "Japan",
    address: "2-1 Kabukicho, Shinjuku City, Tokyo 160-0021",
    lat: 35.6938, lng: 139.7034,
    pricePerNight: 9000, cleaningFee: 2000,
    maxGuests: 2, bedrooms: 0, beds: 1, bathrooms: 1,
    amenities: ["WiFi", "Air conditioning", "Kitchen", "Washer", "Elevator"],
    houseRules: ["No smoking", "No shoes indoors", "No guests after 11pm"],
    checkInTime: "15:00", checkOutTime: "10:00",
    minNights: 1, maxNights: 14, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop8/800/600",
    coverImagePublicId: "seed/prop8",
    hostIndex: 1,
  },
  {
    title: "Bali Ubud Jungle Villa",
    description: "Breathtaking villa nestled in the Ubud rice terraces. Private infinity pool, open-air dining, daily breakfast included, and a live-in housekeeper.",
    type: "villa", city: "Ubud", state: "Bali", country: "Indonesia",
    address: "Jl. Bisma, Ubud, Gianyar Regency, Bali 80571",
    lat: -8.5069, lng: 115.2625,
    pricePerNight: 28000, cleaningFee: 6000,
    maxGuests: 6, bedrooms: 3, beds: 3, bathrooms: 3,
    amenities: ["WiFi", "Pool", "Kitchen", "Breakfast included", "Air conditioning", "Garden", "Rice field view"],
    houseRules: ["No shoes in bedrooms", "No parties", "Respect local customs"],
    checkInTime: "14:00", checkOutTime: "12:00",
    minNights: 3, maxNights: 30, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop9/800/600",
    coverImagePublicId: "seed/prop9",
    hostIndex: 2,
  },
  {
    title: "Tuscany Farmhouse with Vineyard",
    description: "A restored 16th-century farmhouse surrounded by olive groves and vineyards near Florence. Stone fireplace, cellar tours, and stunning sunset views over the Chianti hills.",
    type: "house", city: "Florence", state: "Tuscany", country: "Italy",
    address: "Via Chiantigiana, 50022 Greve in Chianti FI",
    lat: 43.5840, lng: 11.3139,
    pricePerNight: 32000, cleaningFee: 7000,
    maxGuests: 8, bedrooms: 4, beds: 5, bathrooms: 3,
    amenities: ["WiFi", "Pool", "Kitchen", "BBQ", "Fireplace", "Parking", "Garden", "Wine cellar"],
    houseRules: ["No smoking indoors", "Pets allowed", "Quiet after midnight"],
    checkInTime: "16:00", checkOutTime: "10:00",
    minNights: 4, maxNights: 30, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop10/800/600",
    coverImagePublicId: "seed/prop10",
    hostIndex: 0,
  },
  {
    title: "Sydney Harbour View Apartment",
    description: "Spectacular apartment with unobstructed views of Sydney Harbour and the Opera House. Walk to the Circular Quay and explore the best of Sydney.",
    type: "apartment", city: "Sydney", state: "NSW", country: "Australia",
    address: "1 Macquarie St, Sydney NSW 2000",
    lat: -33.8614, lng: 151.2113,
    pricePerNight: 21000, cleaningFee: 4500,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 2,
    amenities: ["WiFi", "Kitchen", "Air conditioning", "Washer", "Harbour view", "Gym", "Pool"],
    houseRules: ["No smoking", "No parties", "No shoes on carpet"],
    checkInTime: "15:00", checkOutTime: "10:00",
    minNights: 2, maxNights: 21, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop11/800/600",
    coverImagePublicId: "seed/prop11",
    hostIndex: 1,
  },
  {
    title: "Maldives Overwater Bungalow",
    description: "Live the ultimate island dream in a private overwater bungalow with a glass floor, direct lagoon access, and butler service included.",
    type: "house", city: "Malé", state: "Kaafu Atoll", country: "Maldives",
    address: "Veligandu Island, North Ari Atoll, Maldives",
    lat: 4.1755, lng: 72.9649,
    pricePerNight: 65000, cleaningFee: 12000,
    maxGuests: 2, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ["WiFi", "Pool", "Ocean view", "Butler service", "Snorkeling equipment", "Kayak", "Air conditioning"],
    houseRules: ["No smoking on deck", "Couples only", "No outside food/drink"],
    checkInTime: "14:00", checkOutTime: "12:00",
    minNights: 3, maxNights: 14, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop12/800/600",
    coverImagePublicId: "seed/prop12",
    hostIndex: 2,
  },
  {
    title: "Brooklyn Williamsburg Loft",
    description: "Industrial-chic loft in the heart of Williamsburg, Brooklyn. Exposed brick, 14-foot ceilings, and walking distance to the best bars and restaurants in NYC.",
    type: "apartment", city: "New York", state: "NY", country: "USA",
    address: "100 N 7th St, Brooklyn, NY 11249",
    lat: 40.7178, lng: -73.9612,
    pricePerNight: 14000, cleaningFee: 3000,
    maxGuests: 4, bedrooms: 1, beds: 2, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Washer", "Air conditioning", "Rooftop access"],
    houseRules: ["No smoking", "No parties over 8 people", "Pets welcome"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 30, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop13/800/600",
    coverImagePublicId: "seed/prop13",
    hostIndex: 0,
  },
  {
    title: "Aspen Mountain Ski Cabin",
    description: "Cosy ski-in/ski-out cabin at the base of Aspen Mountain. Wood-burning fireplace, hot tub on the deck, and ski storage for your whole group.",
    type: "cabin", city: "Aspen", state: "CO", country: "USA",
    address: "123 Aspen Mountain Rd, Aspen, CO 81611",
    lat: 39.1878, lng: -106.8205,
    pricePerNight: 45000, cleaningFee: 9000,
    maxGuests: 8, bedrooms: 4, beds: 5, bathrooms: 3,
    amenities: ["WiFi", "Hot tub", "Fireplace", "Kitchen", "Ski storage", "Parking", "Mountain view"],
    houseRules: ["No smoking indoors", "Pets allowed", "Ski-in/ski-out etiquette"],
    checkInTime: "16:00", checkOutTime: "10:00",
    minNights: 3, maxNights: 14, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop14/800/600",
    coverImagePublicId: "seed/prop14",
    hostIndex: 1,
  },
  {
    title: "Copenhagen Design Apartment",
    description: "Minimalist Scandinavian apartment in the hip Nørrebro district. Danish design throughout, bicycle included, and steps from the city's best cafés.",
    type: "apartment", city: "Copenhagen", state: "Capital Region", country: "Denmark",
    address: "Nørrebrogade 45, 2200 Copenhagen",
    lat: 55.6889, lng: 12.5479,
    pricePerNight: 15500, cleaningFee: 3000,
    maxGuests: 3, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Washer", "Heating", "Bicycle", "Elevator"],
    houseRules: ["No smoking", "No shoes indoors", "Bicycle must be locked outside"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 21, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop15/800/600",
    coverImagePublicId: "seed/prop15",
    hostIndex: 2,
  },
  {
    title: "Santorini Caldera Cave House",
    description: "Iconic cave house carved into the volcanic cliff in Oia with a private plunge pool and legendary caldera views. Watch the world-famous Santorini sunset from your terrace.",
    type: "house", city: "Santorini", state: "South Aegean", country: "Greece",
    address: "Oia 847 02, Santorini",
    lat: 36.4618, lng: 25.3753,
    pricePerNight: 38000, cleaningFee: 7500,
    maxGuests: 2, bedrooms: 1, beds: 1, bathrooms: 1,
    amenities: ["WiFi", "Plunge pool", "Air conditioning", "Caldera view", "Terrace", "Concierge"],
    houseRules: ["No smoking", "Adults only", "Quiet after midnight"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 3, maxNights: 14, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop16/800/600",
    coverImagePublicId: "seed/prop16",
    hostIndex: 0,
  },
  {
    title: "Dubai Marina Penthouse",
    description: "Lavish penthouse in the Dubai Marina with 360° views of the skyline, private rooftop pool, and concierge service. Walking distance to the beach and world-class dining.",
    type: "apartment", city: "Dubai", state: "Dubai", country: "UAE",
    address: "Dubai Marina Walk, Dubai Marina, Dubai",
    lat: 25.0819, lng: 55.1367,
    pricePerNight: 42000, cleaningFee: 8500,
    maxGuests: 6, bedrooms: 3, beds: 3, bathrooms: 3,
    amenities: ["WiFi", "Pool", "Gym", "Air conditioning", "Kitchen", "Parking", "Concierge", "Marina view"],
    houseRules: ["No smoking", "No parties", "Dress code in lobby"],
    checkInTime: "15:00", checkOutTime: "12:00",
    minNights: 2, maxNights: 30, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop17/800/600",
    coverImagePublicId: "seed/prop17",
    hostIndex: 1,
  },
  {
    title: "Mexico City Condesa Casita",
    description: "Charming casita in Mexico City's tree-lined Condesa neighbourhood. Art Deco architecture, private patio, and within walking distance of dozens of world-class restaurants.",
    type: "house", city: "Mexico City", state: "CDMX", country: "Mexico",
    address: "Av. Ámsterdam 123, Hipódromo, 06100 Ciudad de México",
    lat: 19.4096, lng: -99.1685,
    pricePerNight: 8500, cleaningFee: 2000,
    maxGuests: 4, bedrooms: 2, beds: 2, bathrooms: 1,
    amenities: ["WiFi", "Kitchen", "Air conditioning", "Patio", "Washer", "Parking"],
    houseRules: ["No smoking", "No parties", "Pets welcome"],
    checkInTime: "14:00", checkOutTime: "12:00",
    minNights: 2, maxNights: 30, instantBook: true,
    coverImageUrl: "https://picsum.photos/seed/prop18/800/600",
    coverImagePublicId: "seed/prop18",
    hostIndex: 2,
  },
  {
    title: "Cape Town Clifton Ocean Villa",
    description: "Stunning contemporary villa above Clifton's famous 4th Beach. Infinity pool, wine cellar, home cinema, and panoramic views of the Atlantic Ocean and the Twelve Apostles mountain range.",
    type: "villa", city: "Cape Town", state: "Western Cape", country: "South Africa",
    address: "Clifton, Cape Town, 8005",
    lat: -33.9403, lng: 18.3718,
    pricePerNight: 38000, cleaningFee: 8000,
    maxGuests: 10, bedrooms: 5, beds: 6, bathrooms: 4,
    amenities: ["WiFi", "Pool", "Kitchen", "Home cinema", "Wine cellar", "BBQ", "Parking", "Ocean view"],
    houseRules: ["No smoking indoors", "No events over 15 people", "Quiet after midnight"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 3, maxNights: 21, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop19/800/600",
    coverImagePublicId: "seed/prop19",
    hostIndex: 0,
  },
  {
    title: "Kyoto Traditional Machiya Townhouse",
    description: "A beautifully restored 100-year-old machiya (wooden townhouse) in central Kyoto. Zen garden, tatami rooms, and an authentic Japanese cypress wood bath.",
    type: "house", city: "Kyoto", state: "Kyoto", country: "Japan",
    address: "Nakagyo Ward, Kyoto, 604-8186",
    lat: 35.0116, lng: 135.7681,
    pricePerNight: 17500, cleaningFee: 4000,
    maxGuests: 6, bedrooms: 3, beds: 3, bathrooms: 2,
    amenities: ["WiFi", "Japanese bath", "Zen garden", "Kitchen", "Air conditioning", "Tatami rooms"],
    houseRules: ["No shoes indoors", "No smoking", "Respect the traditional decor", "Quiet after 10pm"],
    checkInTime: "15:00", checkOutTime: "11:00",
    minNights: 2, maxNights: 21, instantBook: false,
    coverImageUrl: "https://picsum.photos/seed/prop20/800/600",
    coverImagePublicId: "seed/prop20",
    hostIndex: 1,
  },
];

export const seedDatabase = mutation({
  args: {},
  handler: async (ctx) => {
    // Guard: only run once
    const existing = await ctx.db
      .query("config")
      .withIndex("by_key", (q) => q.eq("key", "seedRan"))
      .unique();

    if (existing) return { message: "Seed already ran", skipped: true };

    // Create seed host users
    const hostIds = [];
    for (const host of SEED_HOSTS) {
      const id = await ctx.db.insert("users", host);
      hostIds.push(id);
    }

    // Create 20 properties
    for (const prop of SEED_PROPERTIES) {
      const { hostIndex, ...propertyData } = prop;
      await ctx.db.insert("properties", {
        ...propertyData,
        hostId: hostIds[hostIndex],
        avgRating: Math.round((3.5 + Math.random() * 1.5) * 10) / 10,
        reviewCount: Math.floor(Math.random() * 80) + 5,
        status: "published",
      });
    }

    // Mark seed as complete
    await ctx.db.insert("config", { key: "seedRan", value: "true" });

    return { message: "Seed complete", propertiesCreated: SEED_PROPERTIES.length };
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add airbnb/convex/seed.ts
git commit -m "feat: add seed mutation with 20 realistic properties"
```

---

## Task 12: Smoke test the full foundation

- [ ] **Step 1: Start dev server**

```bash
cd airbnb && pnpm dev
```

Expected: Next.js server starts on `http://localhost:3000`. Convex dev server starts and shows schema pushed.

- [ ] **Step 2: Fill in .env.local with real values**

From your Clerk dashboard, copy:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_FRONTEND_API_URL` (the Clerk Frontend API URL — looks like `https://your-clerk-domain.clerk.accounts.dev`)
- Set `NEXT_PUBLIC_CLERK_PROXY_URL` to same value as `CLERK_FRONTEND_API_URL`

From your Convex dashboard:
- `NEXT_PUBLIC_CONVEX_URL`

- [ ] **Step 3: Verify sign-in page renders**

Open `http://localhost:3000/sign-in`. Expected: Clerk's hosted sign-in UI renders without errors.

- [ ] **Step 4: Sign in with Google or email**

Complete sign-in. Expected: Redirects to `/` without errors.

- [ ] **Step 5: Configure Clerk webhook in Clerk dashboard**

In Clerk Dashboard → Webhooks → Add Endpoint:
- URL: `https://<your-convex-deployment>.convex.site/clerk-webhook`
  _(This is the Convex HTTP endpoint — not a Next.js route. Stripe and PayPal webhooks in later phases use Next.js route handlers; Clerk's goes directly to Convex.)_
- Events: `user.created`, `user.updated`
- Copy the signing secret to `CLERK_WEBHOOK_SECRET` in `.env.local` and in Convex dashboard env vars

- [ ] **Step 6: Trigger webhook test from Clerk dashboard**

Click "Send test" for `user.created`. Expected: Convex logs show the webhook fired and a user was upserted in the `users` table.

- [ ] **Step 7: Run the seed mutation**

In the Convex dashboard → Functions → `seed:seedDatabase` → Run. Expected: `{ message: "Seed complete", propertiesCreated: 20 }`.

Verify in the Convex dashboard data browser: 20 documents in `properties`, 3 in `users`.

- [ ] **Step 8: Verify protected routes redirect unauthenticated users**

Sign out, then navigate to `http://localhost:3000/trips`. Expected: Redirected to `/sign-in`.

- [ ] **Step 9: Final commit**

```bash
cd .. && git add -A && git commit -m "feat: Phase 1 foundation complete — auth, schema, webhooks, seed"
```

---

## Phase Overview

| Phase | Plan File | Status |
|---|---|---|
| 1 — Foundation | `2026-05-07-phase-1-foundation.md` | ✅ This file |
| 2 — Properties | `2026-05-07-phase-2-properties.md` | Pending |
| 3 — Search & Discovery | `2026-05-07-phase-3-search.md` | Pending |
| 4 — Bookings | `2026-05-07-phase-4-bookings.md` | Pending |
| 5 — Payments | `2026-05-07-phase-5-payments.md` | Pending |
| 6 — Dashboards & Notifications | `2026-05-07-phase-6-dashboards.md` | Pending |
