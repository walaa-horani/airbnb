# Phase 6: Wishlists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let guests save properties to a wishlist with a heart button on every property card, and view all saved properties at `/wishlists`.

**Architecture:** A heart button overlay sits in the top-right corner of every `PropertyCard` image. When authenticated, clicking it calls a `toggleWishlist` mutation and the heart fills/unfills optimistically. Unauthenticated users see a greyed heart that does nothing. The `/wishlists` page queries all saved properties for the current user and renders them as a grid of `PropertyCard`s. A "Wishlists" link with a Heart icon is added to the Navbar.

**Tech Stack:** Next.js App Router, Convex, Tailwind v4, shadcn/ui, lucide-react (Heart icon)

**Key facts from codebase:**
- `wishlists` table in schema: `{ userId, propertyId }` with index `by_user_and_property` on `["userId", "propertyId"]`
- `PropertyCard` is already a `"use client"` component in `components/properties/PropertyCard.tsx`
- Navbar uses `<Authenticated>` from `convex/react` to show auth-gated links — pattern to follow for "Wishlists" link
- `useConvexAuth` from `convex/react` gives `{ isAuthenticated }` without needing a full user query
- Prices stored in cents — `PropertyCard` already handles display formatting

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `convex/wishlists.ts` | `toggleWishlist` mutation, `isWishlisted` query, `getUserWishlists` query |
| Modify | `components/properties/PropertyCard.tsx` | Add heart button overlay |
| Create | `app/(protected)/wishlists/page.tsx` | Saved properties grid page |
| Modify | `components/Navbar.tsx` | Add "Wishlists" link with Heart icon |

---

## Task 1: Convex wishlists backend

**Files:**
- Create: `convex/wishlists.ts`

- [ ] **Step 1: Create `convex/wishlists.ts`**

```ts
// convex/wishlists.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const toggleWishlist = mutation({
  args: { propertyId: v.id("properties") },
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

    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return false;
    } else {
      await ctx.db.insert("wishlists", {
        userId: user._id,
        propertyId: args.propertyId,
      });
      return true;
    }
  },
});

export const isWishlisted = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return false;
    const existing = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) =>
        q.eq("userId", user._id).eq("propertyId", args.propertyId),
      )
      .unique();
    return !!existing;
  },
});

export const getUserWishlists = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return [];
    const wishlists = await ctx.db
      .query("wishlists")
      .withIndex("by_user_and_property", (q) => q.eq("userId", user._id))
      .collect();
    const properties = await Promise.all(
      wishlists.map((w) => ctx.db.get(w.propertyId)),
    );
    return properties.filter((p) => p !== null);
  },
});
```

- [ ] **Step 2: Push to Convex**

```bash
cd c:\dev\airbnb2\airbnb && npx convex dev --once
```

Expected: deploys cleanly, three new functions visible.

- [ ] **Step 3: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/convex/wishlists.ts && git commit -m "feat: wishlists Convex backend (toggleWishlist, isWishlisted, getUserWishlists)"
```

---

## Task 2: Heart button on PropertyCard

Adds a heart button overlay to every property card image. Authenticated users can toggle; unauthenticated users see an inert grey heart.

**Files:**
- Modify: `components/properties/PropertyCard.tsx`

- [ ] **Step 1: Read the current file**

Read `c:\dev\airbnb2\airbnb\components\properties\PropertyCard.tsx`

- [ ] **Step 2: Replace full file contents**

```tsx
// components/properties/PropertyCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Heart } from "lucide-react";
import { useState } from "react";

interface PropertyCardProps {
  property: Doc<"properties">;
  showActions?: boolean;
  onDelete?: (id: string) => void;
}

function WishlistButton({ propertyId }: { propertyId: Id<"properties"> }) {
  const { isAuthenticated } = useConvexAuth();
  const wishlisted = useQuery(
    api.wishlists.isWishlisted,
    isAuthenticated ? { propertyId } : "skip",
  );
  const toggleWishlist = useMutation(api.wishlists.toggleWishlist);
  const [pending, setPending] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated || pending) return;
    setPending(true);
    try {
      await toggleWishlist({ propertyId });
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="absolute top-2 right-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition-colors"
      aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
    >
      <Heart
        className={`h-4 w-4 transition-colors ${
          wishlisted ? "fill-red-500 text-red-500" : "text-gray-600"
        }`}
      />
    </button>
  );
}

export function PropertyCard({ property, showActions, onDelete }: PropertyCardProps) {
  const priceDisplay = `$${(property.pricePerNight / 100).toFixed(0)}`;

  return (
    <div className="group relative">
      <Link href={`/properties/${property._id}`}>
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
          {property.coverImageUrl ? (
            <Image
              src={property.coverImageUrl}
              alt={property.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <span className="text-muted-foreground text-sm">No image</span>
            </div>
          )}
          {property.status !== "published" && (
            <Badge
              variant="secondary"
              className="absolute top-2 left-2 capitalize"
            >
              {property.status}
            </Badge>
          )}
          <WishlistButton propertyId={property._id} />
        </div>

        <div className="mt-2 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium leading-tight line-clamp-1">{property.title}</p>
            {property.reviewCount > 0 && (
              <span className="text-sm shrink-0">
                ★ {property.avgRating.toFixed(1)}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {property.city}, {property.country}
          </p>
          <p className="text-sm">
            <span className="font-semibold">{priceDisplay}</span>
            <span className="text-muted-foreground"> / night</span>
          </p>
        </div>
      </Link>

      {showActions && (
        <div className="mt-2 flex gap-2">
          <Link
            href={`/host/properties/${property._id}/edit`}
            className="flex-1 rounded-lg border py-1.5 text-center text-xs font-medium hover:bg-muted transition-colors"
          >
            Edit
          </Link>
          <button
            onClick={() => onDelete?.(property._id)}
            className="flex-1 rounded-lg border border-destructive/30 py-1.5 text-center text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd c:\dev\airbnb2\airbnb && npx tsc --noEmit 2>&1 | grep -E "PropertyCard" | head -10
```

Expected: no errors in this file.

- [ ] **Step 4: Commit**

```bash
cd c:\dev\airbnb2 && git add airbnb/components/properties/PropertyCard.tsx && git commit -m "feat: heart button wishlist toggle on property cards"
```

---

## Task 3: Wishlists page + Navbar link

**Files:**
- Create: `app/(protected)/wishlists/page.tsx`
- Modify: `components/Navbar.tsx`

- [ ] **Step 1: Read Navbar.tsx**

Read `c:\dev\airbnb2\airbnb\components\Navbar.tsx` to confirm current structure before editing.

- [ ] **Step 2: Create `app/(protected)/wishlists/page.tsx`**

```tsx
// app/(protected)/wishlists/page.tsx
"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

export default function WishlistsPage() {
  const properties = useQuery(api.wishlists.getUserWishlists, {});

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-8">Saved homes</h1>

      {properties === undefined && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="aspect-[4/3] rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {properties?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium">No saved homes yet</p>
          <p className="text-muted-foreground mt-1">
            Tap the heart on any property to save it here.
          </p>
          <Link href="/search" className={buttonVariants({ className: "mt-4" })}>
            Explore homes
          </Link>
        </div>
      )}

      {properties && properties.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {properties.map((property) => (
            <PropertyCard key={property._id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add "Wishlists" link to Navbar**

In `components/Navbar.tsx`, add `Heart` to the lucide-react import:
```tsx
import { PlusCircle, LayoutList, Plane, Search, Calendar, Heart } from "lucide-react";
```

Then in `AuthenticatedNav`, add the Wishlists link **after** the Trips link and **before** My listings:
```tsx
      <Link
        href="/wishlists"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Heart className="h-4 w-4" />
        Wishlists
      </Link>
```

- [ ] **Step 4: TypeScript check**

```bash
cd c:\dev\airbnb2\airbnb && npx tsc --noEmit 2>&1 | grep -E "wishlists|Navbar" | head -10
```

Fix any errors. Pre-existing errors elsewhere are OK.

- [ ] **Step 5: Commit**

```bash
cd c:\dev\airbnb2 && git add "airbnb/app/(protected)/wishlists/page.tsx" airbnb/components/Navbar.tsx && git commit -m "feat: wishlists page and navbar link"
```

---

## Done

Phase 6 is complete when:
- Heart button appears on every property card (top-right of image) ✓
- Clicking heart when logged in fills it red and saves to wishlist ✓
- Clicking again removes from wishlist ✓
- Unauthenticated users see the heart but clicking does nothing ✓
- `/wishlists` shows all saved properties as a card grid ✓
- Removing a heart from the wishlists page disappears from the grid reactively ✓
- "Wishlists" link visible in Navbar when logged in ✓
