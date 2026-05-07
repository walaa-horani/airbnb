# Phase 2: Properties — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full property lifecycle — Convex CRUD, Cloudinary image uploads, a multi-step host listing wizard, and the public property detail page.

**Architecture:** Property data lives in Convex (`properties` + `propertyImages` tables). Images upload directly from the browser to Cloudinary using an unsigned upload preset; only the returned `url` and `publicId` are stored in Convex. The listing wizard is a client-side multi-step form using `react-hook-form` + `zod`. The property detail page is a server component that fetches data then passes to client components for interactivity.

**Tech Stack:** Convex · Cloudinary (unsigned upload) · react-hook-form · zod · yet-another-react-lightbox · react-day-picker · date-fns · shadcn/ui (additional components) · Next.js App Router

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `airbnb/convex/properties.ts` | Create | Property CRUD mutations + queries |
| `airbnb/convex/propertyImages.ts` | Create | Image add/remove/reorder mutations + queries |
| `airbnb/lib/cloudinary.ts` | Create | Cloudinary upload helper |
| `airbnb/lib/property-types.ts` | Create | Property type/amenity constants |
| `airbnb/components/properties/PropertyCard.tsx` | Create | Card for grid/list display |
| `airbnb/components/properties/ImageUploader.tsx` | Create | Cloudinary multi-image upload UI |
| `airbnb/components/properties/PropertyGallery.tsx` | Create | Cover + grid + lightbox |
| `airbnb/components/properties/AmenitiesGrid.tsx` | Create | Amenities checkbox grid |
| `airbnb/components/properties/BookingWidget.tsx` | Create | Static pricing widget (no booking logic yet) |
| `airbnb/components/properties/wizard/PropertyWizard.tsx` | Create | Multi-step form controller |
| `airbnb/components/properties/wizard/steps/BasicInfoStep.tsx` | Create | Title, description, type |
| `airbnb/components/properties/wizard/steps/LocationStep.tsx` | Create | Address, city, country, lat/lng |
| `airbnb/components/properties/wizard/steps/DetailsStep.tsx` | Create | Guests, rooms, check-in times |
| `airbnb/components/properties/wizard/steps/AmenitiesStep.tsx` | Create | Amenities + house rules |
| `airbnb/components/properties/wizard/steps/PhotosStep.tsx` | Create | Cloudinary image upload |
| `airbnb/components/properties/wizard/steps/PricingStep.tsx` | Create | pricePerNight, cleaningFee |
| `airbnb/app/(protected)/host/properties/page.tsx` | Create | Host's property list |
| `airbnb/app/(protected)/host/properties/new/page.tsx` | Create | Create wizard page |
| `airbnb/app/(protected)/host/properties/[id]/edit/page.tsx` | Create | Edit wizard page |
| `airbnb/app/properties/[id]/page.tsx` | Create | Public property detail page |
| `airbnb/app/properties/[id]/PropertyDetailClient.tsx` | Create | Client-side interactivity (gallery, tabs) |

---

## Task 1: Install Phase 2 dependencies

**Files:** `airbnb/package.json` (via pnpm)

- [ ] **Step 1: Install all Phase 2 packages**

```bash
cd c:/dev/airbnb2/airbnb && pnpm add react-hook-form zod @hookform/resolvers yet-another-react-lightbox react-day-picker date-fns
```

- [ ] **Step 2: Install additional shadcn components**

```bash
npx shadcn@latest add dialog form input textarea select checkbox label tabs scroll-area alert-dialog dropdown-menu --yes
```

- [ ] **Step 3: Verify**

```bash
pnpm list react-hook-form zod yet-another-react-lightbox react-day-picker
```

Expected: all four listed with versions.

- [ ] **Step 4: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/package.json airbnb/pnpm-lock.yaml airbnb/components/ui
git commit -m "feat: install Phase 2 deps — react-hook-form, zod, lightbox, day-picker, shadcn components"
```

---

## Task 2: Create property type constants and Cloudinary helper

**Files:**
- Create: `airbnb/lib/property-types.ts`
- Create: `airbnb/lib/cloudinary.ts`

- [ ] **Step 1: Create `airbnb/lib/property-types.ts`**

```typescript
// airbnb/lib/property-types.ts
export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "house", label: "House" },
  { value: "villa", label: "Villa" },
  { value: "cabin", label: "Cabin" },
  { value: "condo", label: "Condo" },
  { value: "studio", label: "Studio" },
  { value: "loft", label: "Loft" },
  { value: "cottage", label: "Cottage" },
  { value: "townhouse", label: "Townhouse" },
  { value: "bungalow", label: "Bungalow" },
] as const;

export const AMENITIES = [
  "WiFi",
  "Kitchen",
  "Air conditioning",
  "Heating",
  "Washer",
  "Dryer",
  "Dishwasher",
  "Pool",
  "Hot tub",
  "Gym",
  "Fireplace",
  "BBQ",
  "Parking",
  "Elevator",
  "Beach access",
  "Garden",
  "Balcony",
  "Terrace",
  "City view",
  "Ocean view",
  "Mountain view",
  "Ski-in/ski-out",
  "Breakfast included",
  "Butler service",
  "Concierge",
  "Pet-friendly",
  "Wheelchair accessible",
  "Smoke detector",
  "Carbon monoxide detector",
  "First aid kit",
] as const;
```

- [ ] **Step 2: Create `airbnb/lib/cloudinary.ts`**

```typescript
// airbnb/lib/cloudinary.ts

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  width: number;
  height: number;
}

// Uploads a single file to Cloudinary using unsigned upload preset.
// Returns public_id and secure_url.
export async function uploadToCloudinary(file: File): Promise<CloudinaryUploadResult> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary environment variables are not configured.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "stayfinder/properties");

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: "POST", body: formData },
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Cloudinary upload failed: ${JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    publicId: data.public_id as string,
    url: data.secure_url as string,
    width: data.width as number,
    height: data.height as number,
  };
}

// Returns a Cloudinary transformation URL for a given public_id.
// w/h are optional resize parameters.
export function cloudinaryUrl(
  publicId: string,
  opts: { width?: number; height?: number; crop?: string } = {},
): string {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
  const transforms = [
    opts.width && `w_${opts.width}`,
    opts.height && `h_${opts.height}`,
    opts.crop && `c_${opts.crop}`,
    "q_auto",
    "f_auto",
  ]
    .filter(Boolean)
    .join(",");

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms}/${publicId}`;
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/lib/property-types.ts airbnb/lib/cloudinary.ts
git commit -m "feat: property type constants and Cloudinary upload helper"
```

---

## Task 3: Convex property functions

**Files:**
- Create: `airbnb/convex/properties.ts`

- [ ] **Step 1: Create `airbnb/convex/properties.ts`**

```typescript
// airbnb/convex/properties.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ── Queries ──────────────────────────────────────────────────────────────────

export const getProperty = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.propertyId);
  },
});

export const getPropertiesByHost = query({
  args: { paginationOpts: paginationOptsValidator },
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

    return await ctx.db
      .query("properties")
      .withIndex("by_host_id", (q) => q.eq("hostId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getPublishedProperties = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("properties")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

// ── Mutations ─────────────────────────────────────────────────────────────────

const propertyFields = {
  title: v.string(),
  description: v.string(),
  type: v.string(),
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
};

export const createProperty = mutation({
  args: propertyFields,
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

    // Upgrade user role to host if needed
    if (user.role === "guest") {
      await ctx.db.patch(user._id, { role: "host" });
    }

    return await ctx.db.insert("properties", {
      ...args,
      hostId: user._id,
      status: "draft",
      avgRating: 0,
      reviewCount: 0,
    });
  },
});

export const updateProperty = mutation({
  args: {
    propertyId: v.id("properties"),
    ...propertyFields,
  },
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

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    const { propertyId, ...fields } = args;
    await ctx.db.patch(propertyId, fields);
    return propertyId;
  },
});

export const publishProperty = mutation({
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

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.propertyId, { status: "published" });
  },
});

export const unpublishProperty = mutation({
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

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.propertyId, { status: "unlisted" });
  },
});

export const deleteProperty = mutation({
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

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    if (property.hostId !== user._id) throw new Error("Unauthorized");

    // Check for active bookings
    const activeBookings = await ctx.db
      .query("bookings")
      .withIndex("by_property_and_status", (q) =>
        q.eq("propertyId", args.propertyId).eq("status", "confirmed"),
      )
      .take(1);

    if (activeBookings.length > 0) {
      // Soft delete only — has active bookings
      await ctx.db.patch(args.propertyId, { status: "unlisted" });
      return { deleted: false, unlisted: true };
    }

    // Hard delete: remove images first
    const images = await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", args.propertyId))
      .collect();

    for (const image of images) {
      await ctx.db.delete(image._id);
    }

    await ctx.db.delete(args.propertyId);
    return { deleted: true, unlisted: false };
  },
});
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd c:/dev/airbnb2/airbnb && npx convex dev --once 2>&1 | grep -E "(error|Error|✓)" | head -20
```

- [ ] **Step 3: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/convex/properties.ts
git commit -m "feat: Convex property CRUD mutations and queries"
```

---

## Task 4: Convex propertyImages functions

**Files:**
- Create: `airbnb/convex/propertyImages.ts`

- [ ] **Step 1: Create `airbnb/convex/propertyImages.ts`**

```typescript
// airbnb/convex/propertyImages.ts
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const getPropertyImages = query({
  args: { propertyId: v.id("properties") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", args.propertyId))
      .order("asc")
      .collect();
  },
});

export const addPropertyImage = mutation({
  args: {
    propertyId: v.id("properties"),
    cloudinaryPublicId: v.string(),
    url: v.string(),
    order: v.number(),
    isCover: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    const imageId = await ctx.db.insert("propertyImages", args);

    // If this is the cover image, update the property record
    if (args.isCover) {
      await ctx.db.patch(args.propertyId, {
        coverImageUrl: args.url,
        coverImagePublicId: args.cloudinaryPublicId,
      });
    }

    return imageId;
  },
});

export const removePropertyImage = mutation({
  args: { imageId: v.id("propertyImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const image = await ctx.db.get(args.imageId);
    if (!image) throw new Error("Image not found");

    const property = await ctx.db.get(image.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    await ctx.db.delete(args.imageId);

    // If we deleted the cover, promote the next image
    if (image.isCover) {
      const next = await ctx.db
        .query("propertyImages")
        .withIndex("by_property_id", (q) => q.eq("propertyId", image.propertyId))
        .first();

      if (next) {
        await ctx.db.patch(next._id, { isCover: true });
        await ctx.db.patch(image.propertyId, {
          coverImageUrl: next.url,
          coverImagePublicId: next.cloudinaryPublicId,
        });
      } else {
        await ctx.db.patch(image.propertyId, {
          coverImageUrl: "",
          coverImagePublicId: "",
        });
      }
    }
  },
});

export const setCoverImage = mutation({
  args: { imageId: v.id("propertyImages") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const image = await ctx.db.get(args.imageId);
    if (!image) throw new Error("Image not found");

    const property = await ctx.db.get(image.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    // Unset current cover
    const currentCover = await ctx.db
      .query("propertyImages")
      .withIndex("by_property_id", (q) => q.eq("propertyId", image.propertyId))
      .filter((q) => q.eq(q.field("isCover"), true))
      .first();

    if (currentCover) {
      await ctx.db.patch(currentCover._id, { isCover: false });
    }

    // Set new cover
    await ctx.db.patch(args.imageId, { isCover: true });
    await ctx.db.patch(image.propertyId, {
      coverImageUrl: image.url,
      coverImagePublicId: image.cloudinaryPublicId,
    });
  },
});

export const reorderPropertyImages = mutation({
  args: {
    propertyId: v.id("properties"),
    orderedImageIds: v.array(v.id("propertyImages")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    if (!user || property.hostId !== user._id) throw new Error("Unauthorized");

    for (let i = 0; i < args.orderedImageIds.length; i++) {
      await ctx.db.patch(args.orderedImageIds[i], { order: i });
    }
  },
});
```

- [ ] **Step 2: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/convex/propertyImages.ts
git commit -m "feat: Convex propertyImages CRUD mutations and queries"
```

---

## Task 5: PropertyCard and ImageUploader components

**Files:**
- Create: `airbnb/components/properties/PropertyCard.tsx`
- Create: `airbnb/components/properties/ImageUploader.tsx`

- [ ] **Step 1: Create `airbnb/components/properties/PropertyCard.tsx`**

```tsx
// airbnb/components/properties/PropertyCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Doc } from "@/convex/_generated/dataModel";

interface PropertyCardProps {
  property: Doc<"properties">;
  showActions?: boolean;
  onDelete?: (id: string) => void;
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

- [ ] **Step 2: Create `airbnb/components/properties/ImageUploader.tsx`**

```tsx
// airbnb/components/properties/ImageUploader.tsx
"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { X, Upload, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadToCloudinary, CloudinaryUploadResult } from "@/lib/cloudinary";

export interface UploadedImage {
  publicId: string;
  url: string;
  isCover: boolean;
}

interface ImageUploaderProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxImages?: number;
}

export function ImageUploader({ images, onChange, maxImages = 20 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const remaining = maxImages - images.length;
      const toUpload = Array.from(files).slice(0, remaining);

      if (toUpload.length === 0) {
        setError(`Maximum ${maxImages} images allowed.`);
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const results = await Promise.all(toUpload.map(uploadToCloudinary));

        const newImages: UploadedImage[] = results.map((r: CloudinaryUploadResult, i) => ({
          publicId: r.publicId,
          url: r.url,
          isCover: images.length === 0 && i === 0,
        }));

        onChange([...images, ...newImages]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [images, onChange, maxImages],
  );

  const removeImage = (publicId: string) => {
    const updated = images.filter((img) => img.publicId !== publicId);
    // Ensure first image is cover if previous cover was removed
    if (updated.length > 0 && !updated.some((img) => img.isCover)) {
      updated[0] = { ...updated[0], isCover: true };
    }
    onChange(updated);
  };

  const setCover = (publicId: string) => {
    onChange(
      images.map((img) => ({ ...img, isCover: img.publicId === publicId })),
    );
  };

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 hover:border-muted-foreground/60 transition-colors">
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">Click to upload photos</p>
          <p className="text-sm text-muted-foreground">
            JPG, PNG, WebP up to 10MB each · {images.length}/{maxImages} uploaded
          </p>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading || images.length >= maxImages}
        />
      </label>

      {uploading && (
        <p className="text-center text-sm text-muted-foreground animate-pulse">
          Uploading…
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Image grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.publicId} className="group relative aspect-square">
              <Image
                src={img.url}
                alt=""
                fill
                className="rounded-lg object-cover"
                sizes="120px"
              />
              {/* Cover badge */}
              {img.isCover && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white font-medium">
                  Cover
                </span>
              )}
              {/* Actions on hover */}
              <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isCover && (
                  <button
                    type="button"
                    onClick={() => setCover(img.publicId)}
                    className="rounded-full bg-white/90 p-1.5 hover:bg-white"
                    title="Set as cover"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(img.publicId)}
                  className="rounded-full bg-white/90 p-1.5 hover:bg-white"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/components/properties/
git commit -m "feat: PropertyCard and ImageUploader components"
```

---

## Task 6: Property listing wizard (multi-step form)

**Files:**
- Create: `airbnb/components/properties/wizard/PropertyWizard.tsx`
- Create: `airbnb/components/properties/wizard/steps/BasicInfoStep.tsx`
- Create: `airbnb/components/properties/wizard/steps/LocationStep.tsx`
- Create: `airbnb/components/properties/wizard/steps/DetailsStep.tsx`
- Create: `airbnb/components/properties/wizard/steps/AmenitiesStep.tsx`
- Create: `airbnb/components/properties/wizard/steps/PhotosStep.tsx`
- Create: `airbnb/components/properties/wizard/steps/PricingStep.tsx`

- [ ] **Step 1: Create the wizard schema `airbnb/components/properties/wizard/schema.ts`**

```typescript
// airbnb/components/properties/wizard/schema.ts
import { z } from "zod";

export const propertySchema = z.object({
  // Step 1
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(2000),
  type: z.string().min(1, "Select a property type"),

  // Step 2
  address: z.string().min(5, "Enter a full address"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State/region is required"),
  country: z.string().min(1, "Country is required"),
  lat: z.number(),
  lng: z.number(),

  // Step 3
  maxGuests: z.number().min(1).max(50),
  bedrooms: z.number().min(0).max(50),
  beds: z.number().min(1).max(100),
  bathrooms: z.number().min(1).max(50),
  checkInTime: z.string(),
  checkOutTime: z.string(),
  minNights: z.number().min(1),
  maxNights: z.number().min(1),
  instantBook: z.boolean(),

  // Step 4
  amenities: z.array(z.string()),
  houseRules: z.array(z.string()),

  // Step 5
  coverImageUrl: z.string().min(1, "At least one photo is required"),
  coverImagePublicId: z.string(),
  images: z.array(z.object({ publicId: z.string(), url: z.string(), isCover: z.boolean() })),

  // Step 6
  pricePerNight: z.number().min(100, "Minimum $1/night"),
  cleaningFee: z.number().min(0),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;

export const STEPS = [
  { id: "basic", label: "Basics" },
  { id: "location", label: "Location" },
  { id: "details", label: "Details" },
  { id: "amenities", label: "Amenities" },
  { id: "photos", label: "Photos" },
  { id: "pricing", label: "Pricing" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
```

- [ ] **Step 2: Create `BasicInfoStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/BasicInfoStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROPERTY_TYPES } from "@/lib/property-types";
import { PropertyFormValues } from "../schema";

export function BasicInfoStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Tell us about your place</h2>
        <p className="text-muted-foreground text-sm mt-1">Start with the basics.</p>
      </div>

      <FormField
        control={form.control}
        name="type"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Property type</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="title"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Listing title</FormLabel>
            <FormControl>
              <Input placeholder="e.g. Cozy loft in the heart of the city" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="description"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Describe your space — what makes it special, what guests can expect..."
                className="min-h-[140px]"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create `LocationStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/LocationStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";

export function LocationStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Where is your place located?</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your full address is only shared with confirmed guests.
        </p>
      </div>

      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street address</FormLabel>
            <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl><Input placeholder="New York" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State / Region</FormLabel>
              <FormControl><Input placeholder="NY" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="country"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <FormControl><Input placeholder="United States" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="lat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Latitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="40.7128"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lng"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Longitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="-74.0060"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: Use Google Maps to find your coordinates — right-click your address and copy the numbers.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create `DetailsStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/DetailsStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PropertyFormValues } from "../schema";

function NumberInput({ label, description, form, name, min = 0, max = 100 }: {
  label: string;
  description?: string;
  form: UseFormReturn<PropertyFormValues>;
  name: keyof PropertyFormValues;
  min?: number;
  max?: number;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <Input
              type="number"
              min={min}
              max={max}
              value={field.value as number}
              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function DetailsStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Property details</h2>
        <p className="text-muted-foreground text-sm mt-1">Tell guests what your space offers.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberInput label="Max guests" form={form} name="maxGuests" min={1} max={50} />
        <NumberInput label="Bedrooms" form={form} name="bedrooms" min={0} max={50} />
        <NumberInput label="Beds" form={form} name="beds" min={1} max={100} />
        <NumberInput label="Bathrooms" form={form} name="bathrooms" min={1} max={50} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="checkInTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check-in time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="checkOutTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check-out time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberInput label="Minimum nights" form={form} name="minNights" min={1} max={365} />
        <NumberInput label="Maximum nights" form={form} name="maxNights" min={1} max={365} />
      </div>

      <FormField
        control={form.control}
        name="instantBook"
        render={({ field }) => (
          <FormItem className="flex items-start gap-3 rounded-lg border p-4">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <div>
              <FormLabel className="text-base">Instant Book</FormLabel>
              <FormDescription>
                Guests can book without waiting for your confirmation.
              </FormDescription>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create `AmenitiesStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/AmenitiesStep.tsx
"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AMENITIES } from "@/lib/property-types";
import { PropertyFormValues } from "../schema";

export function AmenitiesStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const [newRule, setNewRule] = useState("");
  const amenities = form.watch("amenities") ?? [];
  const houseRules = form.watch("houseRules") ?? [];

  const toggleAmenity = (amenity: string) => {
    const current = form.getValues("amenities") ?? [];
    form.setValue(
      "amenities",
      current.includes(amenity)
        ? current.filter((a) => a !== amenity)
        : [...current, amenity],
    );
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    form.setValue("houseRules", [...houseRules, trimmed]);
    setNewRule("");
  };

  const removeRule = (i: number) => {
    form.setValue("houseRules", houseRules.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-8">
      {/* Amenities */}
      <div>
        <h2 className="text-xl font-semibold">What does your place offer?</h2>
        <p className="text-muted-foreground text-sm mt-1">Select all amenities that apply.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AMENITIES.map((amenity) => (
            <label
              key={amenity}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-muted transition-colors"
            >
              <Checkbox
                checked={amenities.includes(amenity)}
                onCheckedChange={() => toggleAmenity(amenity)}
              />
              <span className="text-sm">{amenity}</span>
            </label>
          ))}
        </div>
      </div>

      {/* House rules */}
      <div>
        <h2 className="text-xl font-semibold">House rules</h2>
        <p className="text-muted-foreground text-sm mt-1">Add any rules guests must follow.</p>

        <div className="mt-4 flex gap-2">
          <Input
            placeholder='e.g. "No smoking"'
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRule())}
          />
          <Button type="button" variant="outline" onClick={addRule}>Add</Button>
        </div>

        {houseRules.length > 0 && (
          <ul className="mt-3 space-y-2">
            {houseRules.map((rule, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                {rule}
                <button type="button" onClick={() => removeRule(i)}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `PhotosStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/PhotosStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ImageUploader, UploadedImage } from "@/components/properties/ImageUploader";
import { PropertyFormValues } from "../schema";

export function PhotosStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const images = (form.watch("images") as UploadedImage[]) ?? [];

  const handleChange = (updated: UploadedImage[]) => {
    form.setValue("images", updated);
    const cover = updated.find((img) => img.isCover) ?? updated[0];
    if (cover) {
      form.setValue("coverImageUrl", cover.url);
      form.setValue("coverImagePublicId", cover.publicId);
    } else {
      form.setValue("coverImageUrl", "");
      form.setValue("coverImagePublicId", "");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Add photos of your place</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Great photos help guests decide to book. Add at least one. The first is your cover photo.
        </p>
      </div>

      <FormField
        control={form.control}
        name="coverImageUrl"
        render={() => (
          <FormItem>
            <ImageUploader images={images} onChange={handleChange} maxImages={20} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
```

- [ ] **Step 7: Create `PricingStep.tsx`**

```tsx
// airbnb/components/properties/wizard/steps/PricingStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";

function CentsInput({ label, description, form, name }: {
  label: string;
  description?: string;
  form: UseFormReturn<PropertyFormValues>;
  name: "pricePerNight" | "cleaningFee";
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="pl-7"
                placeholder="0.00"
                value={field.value ? (field.value / 100).toFixed(2) : ""}
                onChange={(e) =>
                  field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))
                }
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function PricingStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const pricePerNight = form.watch("pricePerNight") ?? 0;
  const cleaningFee = form.watch("cleaningFee") ?? 0;
  const serviceFee = Math.round((pricePerNight + cleaningFee) * 0.05);
  const total = pricePerNight + cleaningFee + serviceFee;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Set your price</h2>
        <p className="text-muted-foreground text-sm mt-1">
          You can change this any time. A 5% service fee is added for guests.
        </p>
      </div>

      <CentsInput label="Nightly rate" form={form} name="pricePerNight" />
      <CentsInput label="Cleaning fee" description="One-time charge per stay" form={form} name="cleaningFee" />

      {pricePerNight > 0 && (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p className="font-medium">Guest pays (per night + cleaning):</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Nightly rate</span>
            <span>${(pricePerNight / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Cleaning fee</span>
            <span>${(cleaningFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Service fee (5%)</span>
            <span>${(serviceFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Guest total</span>
            <span>${(total / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>You receive</span>
            <span>${((pricePerNight + cleaningFee) / 100).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Create the wizard controller `PropertyWizard.tsx`**

```tsx
// airbnb/components/properties/wizard/PropertyWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { propertySchema, PropertyFormValues, STEPS } from "./schema";
import { BasicInfoStep } from "./steps/BasicInfoStep";
import { LocationStep } from "./steps/LocationStep";
import { DetailsStep } from "./steps/DetailsStep";
import { AmenitiesStep } from "./steps/AmenitiesStep";
import { PhotosStep } from "./steps/PhotosStep";
import { PricingStep } from "./steps/PricingStep";

interface PropertyWizardProps {
  mode: "create" | "edit";
  propertyId?: Id<"properties">;
  defaultValues?: Partial<PropertyFormValues>;
}

const DEFAULT_VALUES: PropertyFormValues = {
  title: "",
  description: "",
  type: "",
  address: "",
  city: "",
  state: "",
  country: "",
  lat: 0,
  lng: 0,
  maxGuests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  checkInTime: "15:00",
  checkOutTime: "11:00",
  minNights: 1,
  maxNights: 30,
  instantBook: false,
  amenities: [],
  houseRules: [],
  coverImageUrl: "",
  coverImagePublicId: "",
  images: [],
  pricePerNight: 0,
  cleaningFee: 0,
};

export function PropertyWizard({ mode, propertyId, defaultValues }: PropertyWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const createProperty = useMutation(api.properties.createProperty);
  const updateProperty = useMutation(api.properties.updateProperty);
  const addImage = useMutation(api.propertyImages.addPropertyImage);

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
    mode: "onBlur",
  });

  const currentStep = STEPS[step];

  const stepComponents: Record<string, React.ReactNode> = {
    basic: <BasicInfoStep form={form} />,
    location: <LocationStep form={form} />,
    details: <DetailsStep form={form} />,
    amenities: <AmenitiesStep form={form} />,
    photos: <PhotosStep form={form} />,
    pricing: <PricingStep form={form} />,
  };

  const validateCurrentStep = async (): Promise<boolean> => {
    const stepFields: Record<string, (keyof PropertyFormValues)[]> = {
      basic: ["title", "description", "type"],
      location: ["address", "city", "state", "country", "lat", "lng"],
      details: ["maxGuests", "bedrooms", "beds", "bathrooms", "checkInTime", "checkOutTime", "minNights", "maxNights"],
      amenities: [],
      photos: ["coverImageUrl"],
      pricing: ["pricePerNight"],
    };

    const fields = stepFields[currentStep.id] ?? [];
    return await form.trigger(fields);
  };

  const handleNext = async () => {
    const valid = await validateCurrentStep();
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (values: PropertyFormValues) => {
    setSaving(true);
    try {
      const { images, ...propertyData } = values;

      if (mode === "create") {
        const newPropertyId = await createProperty(propertyData);

        // Upload image records to Convex
        for (let i = 0; i < images.length; i++) {
          await addImage({
            propertyId: newPropertyId,
            cloudinaryPublicId: images[i].publicId,
            url: images[i].url,
            order: i,
            isCover: images[i].isCover,
          });
        }

        router.push(`/host/properties`);
      } else if (mode === "edit" && propertyId) {
        await updateProperty({ propertyId, ...propertyData });
        router.push(`/host/properties`);
      }
    } catch (e) {
      console.error("Failed to save property:", e);
    } finally {
      setSaving(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-sm font-medium">{currentStep.label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Step content */}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {stepComponents[currentStep.id]}

          {/* Navigation */}
          <div className="flex justify-between pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
            >
              Back
            </Button>

            {isLastStep ? (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Create listing" : "Save changes"}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/components/properties/wizard/
git commit -m "feat: property listing wizard — 6-step form with react-hook-form + zod"
```

---

## Task 7: Host property management pages

**Files:**
- Create: `airbnb/app/(protected)/host/properties/page.tsx`
- Create: `airbnb/app/(protected)/host/properties/new/page.tsx`
- Create: `airbnb/app/(protected)/host/properties/[id]/edit/page.tsx`

- [ ] **Step 1: Create host properties list page**

```tsx
// airbnb/app/(protected)/host/properties/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus } from "lucide-react";

export default function HostPropertiesPage() {
  const [deleteId, setDeleteId] = useState<Id<"properties"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.getPropertiesByHost,
    {},
    { initialNumItems: 10 },
  );

  const deleteProperty = useMutation(api.properties.deleteProperty);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteProperty({ propertyId: deleteId });
    setDeleteId(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Your listings</h1>
        <Button asChild>
          <Link href="/host/properties/new">
            <Plus className="h-4 w-4 mr-2" />
            Add listing
          </Link>
        </Button>
      </div>

      {status === "LoadingFirstPage" && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      {status !== "LoadingFirstPage" && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium">No listings yet</p>
          <p className="text-muted-foreground mt-1">Create your first listing to start hosting.</p>
          <Button asChild className="mt-4">
            <Link href="/host/properties/new">Create listing</Link>
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((property) => (
              <PropertyCard
                key={property._id}
                property={property}
                showActions
                onDelete={(id) => setDeleteId(id as Id<"properties">)}
              />
            ))}
          </div>

          {status === "CanLoadMore" && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={() => loadMore(10)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the listing. If it has active bookings, it will be unlisted instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Create new listing page**

```tsx
// airbnb/app/(protected)/host/properties/new/page.tsx
import { PropertyWizard } from "@/components/properties/wizard/PropertyWizard";

export default function NewPropertyPage() {
  return <PropertyWizard mode="create" />;
}
```

- [ ] **Step 3: Create edit listing page**

```tsx
// airbnb/app/(protected)/host/properties/[id]/edit/page.tsx
"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PropertyWizard } from "@/components/properties/wizard/PropertyWizard";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const property = useQuery(api.properties.getProperty, {
    propertyId: id as Id<"properties">,
  });

  if (property === undefined) {
    return (
      <div className="mx-auto max-w-2xl py-8 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!property) return <p className="p-8">Property not found.</p>;

  return (
    <PropertyWizard
      mode="edit"
      propertyId={property._id}
      defaultValues={{
        title: property.title,
        description: property.description,
        type: property.type,
        address: property.address,
        city: property.city,
        state: property.state,
        country: property.country,
        lat: property.lat,
        lng: property.lng,
        pricePerNight: property.pricePerNight,
        cleaningFee: property.cleaningFee,
        maxGuests: property.maxGuests,
        bedrooms: property.bedrooms,
        beds: property.beds,
        bathrooms: property.bathrooms,
        amenities: property.amenities,
        houseRules: property.houseRules,
        checkInTime: property.checkInTime,
        checkOutTime: property.checkOutTime,
        minNights: property.minNights,
        maxNights: property.maxNights,
        instantBook: property.instantBook,
        coverImageUrl: property.coverImageUrl,
        coverImagePublicId: property.coverImagePublicId,
        images: [],
      }}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
cd c:/dev/airbnb2 && git add "airbnb/app/(protected)/host/"
git commit -m "feat: host property list, create, and edit pages"
```

---

## Task 8: Property detail page

**Files:**
- Create: `airbnb/app/properties/[id]/page.tsx`
- Create: `airbnb/app/properties/[id]/PropertyDetailClient.tsx`

- [ ] **Step 1: Create `PropertyDetailClient.tsx`**

```tsx
// airbnb/app/properties/[id]/PropertyDetailClient.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MapPin, Users, BedDouble, Bath, Clock, Star } from "lucide-react";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function PropertyDetailClient({ property }: { property: Doc<"properties"> }) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const images = useQuery(api.propertyImages.getPropertyImages, {
    propertyId: property._id,
  });

  const allImages = images ?? [];
  const lightboxSlides = allImages.map((img) => ({ src: img.url }));

  const serviceFee = Math.round((property.pricePerNight + property.cleaningFee) * 0.05);
  const total = property.pricePerNight + property.cleaningFee + serviceFee;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Title */}
      <h1 className="text-2xl font-bold mb-1">{property.title}</h1>
      <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
        {property.reviewCount > 0 && (
          <span className="flex items-center gap-1 text-foreground font-medium">
            <Star className="h-4 w-4 fill-current" />
            {property.avgRating.toFixed(1)}
            <span className="text-muted-foreground font-normal">({property.reviewCount} reviews)</span>
          </span>
        )}
        <span className="flex items-center gap-1">
          <MapPin className="h-4 w-4" />
          {property.city}, {property.country}
        </span>
        <Badge variant="outline" className="capitalize">{property.type}</Badge>
      </div>

      {/* Gallery */}
      <div
        className="grid grid-cols-4 grid-rows-2 gap-2 rounded-xl overflow-hidden mb-8 cursor-pointer h-[400px]"
        onClick={() => setLightboxIndex(0)}
      >
        <div className="col-span-2 row-span-2 relative">
          {property.coverImageUrl ? (
            <Image src={property.coverImageUrl} alt={property.title} fill className="object-cover" />
          ) : (
            <div className="h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground">No image</span>
            </div>
          )}
        </div>
        {allImages.slice(1, 5).map((img, i) => (
          <div key={img._id} className="relative">
            <Image src={img.url} alt="" fill className="object-cover" />
            {i === 3 && allImages.length > 5 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white font-medium">+{allImages.length - 5} more</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <Lightbox
        open={lightboxIndex >= 0}
        close={() => setLightboxIndex(-1)}
        slides={lightboxSlides}
        index={lightboxIndex}
      />

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
        {/* Left column — main content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{property.maxGuests} guests</span>
            <span className="flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{property.bedrooms} bed{property.bedrooms !== 1 ? "rooms" : "room"} · {property.beds} bed{property.beds !== 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" />{property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Check-in {property.checkInTime} · Check-out {property.checkOutTime}</span>
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h2 className="text-lg font-semibold mb-3">About this place</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{property.description}</p>
          </div>

          <Separator />

          {/* Amenities */}
          {property.amenities.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">What this place offers</h2>
              <div className="grid grid-cols-2 gap-2">
                {property.amenities.map((amenity) => (
                  <span key={amenity} className="flex items-center gap-2 text-sm py-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Availability calendar (read-only) */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Availability</h2>
            <p className="text-sm text-muted-foreground mb-4">Select dates to check availability.</p>
            <DayPicker
              mode="range"
              disabled={{ before: new Date() }}
              className="border rounded-xl p-4"
            />
          </div>

          <Separator />

          {/* House rules */}
          {property.houseRules.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">House rules</h2>
              <ul className="space-y-2">
                {property.houseRules.map((rule) => (
                  <li key={rule} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          {/* Location placeholder */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Location</h2>
            <div className="h-48 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-sm">
              Map coming in Phase 3 · {property.city}, {property.country}
            </div>
          </div>
        </div>

        {/* Right column — booking widget */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl border p-6 shadow-sm space-y-4">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold">{formatCents(property.pricePerNight)}</span>
              <span className="text-muted-foreground">/ night</span>
            </div>

            {property.reviewCount > 0 && (
              <div className="flex items-center gap-1 text-sm">
                <Star className="h-4 w-4 fill-current" />
                <span className="font-medium">{property.avgRating.toFixed(1)}</span>
                <span className="text-muted-foreground">({property.reviewCount} reviews)</span>
              </div>
            )}

            <Separator />

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{formatCents(property.pricePerNight)} × 1 night</span>
                <span>{formatCents(property.pricePerNight)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cleaning fee</span>
                <span>{formatCents(property.cleaningFee)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Service fee</span>
                <span>{formatCents(serviceFee)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatCents(total)}</span>
              </div>
            </div>

            <Button className="w-full" size="lg" asChild>
              <a href={`/checkout/${property._id}`}>Reserve</a>
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              Booking available in Phase 4
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the server component page `page.tsx`**

```tsx
// airbnb/app/properties/[id]/page.tsx
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PropertyDetailClient } from "./PropertyDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;

  const property = await fetchQuery(api.properties.getProperty, {
    propertyId: id as Id<"properties">,
  }).catch(() => null);

  if (!property) notFound();

  return <PropertyDetailClient property={property} />;
}
```

- [ ] **Step 3: Install `convex/nextjs` peer dependency if needed**

```bash
cd c:/dev/airbnb2/airbnb && pnpm list convex | grep convex
```

The `fetchQuery` from `convex/nextjs` is part of the `convex` package — no extra install needed.

- [ ] **Step 4: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/app/properties/
git commit -m "feat: public property detail page with gallery, calendar, and booking widget"
```

---

## Task 9: Basic homepage with property grid

**Files:**
- Modify: `airbnb/app/page.tsx`

- [ ] **Step 1: Replace `airbnb/app/page.tsx`**

```tsx
// airbnb/app/page.tsx
"use client";

import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.getPublishedProperties,
    {},
    { initialNumItems: 10 },
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Nav */}
      <header className="flex items-center justify-between mb-10">
        <Link href="/" className="text-2xl font-bold tracking-tight">
          StayFinder
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in" className="text-sm font-medium hover:underline">
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link href="/host/properties/new">Become a host</Link>
          </Button>
        </div>
      </header>

      <h1 className="text-3xl font-bold mb-8">Find your perfect stay</h1>

      {status === "LoadingFirstPage" && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      {status !== "LoadingFirstPage" && results.length === 0 && (
        <div className="py-24 text-center">
          <p className="text-lg font-medium">No properties yet.</p>
          <p className="text-muted-foreground mt-1">
            Run the seed mutation in your Convex dashboard to add sample data.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {results.map((property) => (
              <PropertyCard key={property._id} property={property} />
            ))}
          </div>

          {status === "CanLoadMore" && (
            <div className="mt-10 flex justify-center">
              <Button variant="outline" onClick={() => loadMore(10)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd c:/dev/airbnb2 && git add airbnb/app/page.tsx
git commit -m "feat: homepage with paginated property grid"
```

---

## Phase Overview

| Phase | Plan File | Status |
|---|---|---|
| 1 — Foundation | `2026-05-07-phase-1-foundation.md` | ✅ Complete |
| 2 — Properties | `2026-05-07-phase-2-properties.md` | ✅ This file |
| 3 — Search & Discovery | `2026-05-07-phase-3-search.md` | Pending |
| 4 — Bookings | `2026-05-07-phase-4-bookings.md` | Pending |
| 5 — Payments | `2026-05-07-phase-5-payments.md` | Pending |
| 6 — Dashboards & Notifications | `2026-05-07-phase-6-dashboards.md` | Pending |
