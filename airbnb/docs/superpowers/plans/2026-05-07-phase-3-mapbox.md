# Phase 3: Mapbox Maps & Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual lat/lng entry with address autocomplete, add real maps to property detail pages, and build a search page with an interactive map that filters the property list as the user pans.

**Architecture:** `react-map-gl` wraps Mapbox GL JS for map rendering; `@mapbox/search-js-react` provides address autocomplete with geocoding. The search page fetches all published properties from Convex (non-paginated), then filters client-side by the map's current bounding box plus guest count and property type. Flying to a new location is driven by a `flyTo` prop on the map component, updated whenever the user picks a search result.

**Tech Stack:** mapbox-gl v3, react-map-gl v8, @mapbox/search-js-react v1, @mapbox/search-js-core (transitive dep), Convex, Next.js App Router, Tailwind v4, shadcn/ui

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `app/layout.tsx` | Remove broken `proxyUrl` from ClerkProvider |
| Modify | `next.config.ts` | Add `transpilePackages` for Mapbox search packages |
| Modify | `.env.local` | Add `NEXT_PUBLIC_MAPBOX_TOKEN` |
| Create | `components/map/PropertyMap.tsx` | Single-pin map for property detail page |
| Create | `components/map/PropertiesMap.tsx` | Multi-pin map for search page with price badges |
| Modify | `app/properties/[id]/PropertyDetailClient.tsx` | Replace placeholder div with PropertyMap |
| Modify | `components/properties/wizard/steps/LocationStep.tsx` | Replace manual inputs with SearchBox autocomplete |
| Modify | `convex/properties.ts` | Add `getAllPublishedProperties` (non-paginated) |
| Create | `app/search/page.tsx` | Search page server wrapper |
| Create | `app/search/SearchClient.tsx` | Client: filters + property list + map |
| Modify | `components/Navbar.tsx` | Add "Explore" link pointing to /search |

---

## Task 0: Fix Clerk proxy bug

The app is broken — `ClerkProvider` has `proxyUrl` configured but no proxy exists to serve it, causing Clerk JS to fail to load and the sign-in page to be blank.

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Remove proxyUrl from ClerkProvider**

Open `app/layout.tsx`. Change:

```tsx
<ClerkProvider
  proxyUrl={`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/clerk-proxy`}
  signInUrl="/sign-in"
  signUpUrl="/sign-up"
  afterSignInUrl="/"
  afterSignUpUrl="/"
>
```

to:

```tsx
<ClerkProvider
  signInUrl="/sign-in"
  signUpUrl="/sign-up"
  afterSignInUrl="/"
  afterSignUpUrl="/"
>
```

- [ ] **Step 2: Verify sign-in page works**

Restart the dev server (`pnpm dev`). Navigate to `http://localhost:3000/sign-in`.  
Expected: Clerk's `<SignIn />` component renders (email/password form visible, not a blank page).

- [ ] **Step 3: Commit**

```bash
git add airbnb/app/layout.tsx
git commit -m "fix: remove broken Clerk proxyUrl — no proxy route was configured"
```

---

## Task 1: Install Mapbox packages and configure environment

**Files:**
- Modify: `airbnb/package.json` (via pnpm)
- Modify: `airbnb/.env.local`
- Modify: `airbnb/next.config.ts`

- [ ] **Step 1: Install packages**

```bash
cd airbnb && pnpm add mapbox-gl react-map-gl @mapbox/search-js-react
```

Expected output: packages added to `dependencies`, pnpm-lock.yaml updated.

- [ ] **Step 2: Add Mapbox token to .env.local**

Open `airbnb/.env.local`. Replace the empty line:
```
NEXT_PUBLIC_MAPBOX_TOKEN=
```
with your actual token (starts with `pk.eyJ1...`):
```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...your-token-here
```

If you do not have a token yet, leave it empty for now — the map components will not render but the code will compile.

- [ ] **Step 3: Update next.config.ts**

Replace the full contents of `airbnb/next.config.ts` with:

```ts
// airbnb/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mapbox/search-js-react", "@mapbox/search-js-core"],
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

- [ ] **Step 4: Verify the app still compiles**

```bash
cd airbnb && pnpm build
```

Expected: build succeeds (or only shows pre-existing warnings — no new errors).

- [ ] **Step 5: Commit**

```bash
git add airbnb/next.config.ts airbnb/package.json airbnb/pnpm-lock.yaml
git commit -m "feat: install mapbox-gl, react-map-gl, @mapbox/search-js-react"
```

---

## Task 2: Create PropertyMap component

A single-pin map used on the property detail page. Shows the property location with a circular pin marker.

**Files:**
- Create: `airbnb/components/map/PropertyMap.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/components/map/PropertyMap.tsx
"use client";

import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { MapPin } from "lucide-react";

interface PropertyMapProps {
  lat: number;
  lng: number;
}

export function PropertyMap({ lat, lng }: PropertyMapProps) {
  return (
    <div className="h-72 w-full rounded-xl overflow-hidden">
      <Map
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        initialViewState={{ longitude: lng, latitude: lat, zoom: 13 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="mapbox://styles/mapbox/streets-v12"
      >
        <NavigationControl position="top-right" />
        <Marker longitude={lng} latitude={lat} anchor="bottom">
          <div className="bg-foreground text-background rounded-full p-2 shadow-lg">
            <MapPin className="h-4 w-4" />
          </div>
        </Marker>
      </Map>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd airbnb && pnpm tsc --noEmit
```

Expected: no new errors from `PropertyMap.tsx`.

---

## Task 3: Wire PropertyMap into property detail page

Replace the placeholder div in `PropertyDetailClient.tsx` with the real map.

**Files:**
- Modify: `airbnb/app/properties/[id]/PropertyDetailClient.tsx`

- [ ] **Step 1: Add the import**

At the top of `PropertyDetailClient.tsx`, add after the existing imports:

```tsx
import { PropertyMap } from "@/components/map/PropertyMap";
```

- [ ] **Step 2: Replace the placeholder**

Find lines 151–156 (the Location section):

```tsx
          <div>
            <h2 className="text-lg font-semibold mb-3">Location</h2>
            <div className="h-48 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-sm">
              Map coming in Phase 3 · {property.city}, {property.country}
            </div>
          </div>
```

Replace with:

```tsx
          <div>
            <h2 className="text-lg font-semibold mb-3">Location</h2>
            <p className="text-sm text-muted-foreground mb-3">
              {property.address}, {property.city}, {property.country}
            </p>
            {property.lat !== 0 && property.lng !== 0 ? (
              <PropertyMap lat={property.lat} lng={property.lng} />
            ) : (
              <div className="h-72 rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-sm">
                {property.city}, {property.country}
              </div>
            )}
          </div>
```

- [ ] **Step 3: Test in browser**

Start the dev server. Open any published property's detail page (e.g. `/properties/<id>`).  
Expected: A Mapbox map renders in the Location section with a pin at the property coordinates. If lat/lng are both 0 (seed data), the muted fallback div shows instead.

- [ ] **Step 4: Commit**

```bash
git add airbnb/app/properties/[id]/PropertyDetailClient.tsx airbnb/components/map/PropertyMap.tsx
git commit -m "feat: add Mapbox map to property detail page"
```

---

## Task 4: Replace manual lat/lng inputs with address autocomplete

Replace the manual Latitude / Longitude number inputs in the property wizard's LocationStep with a `SearchBox` from `@mapbox/search-js-react`. When the host selects an address, all fields (address, city, state, country, lat, lng) are auto-filled.

**Files:**
- Modify: `airbnb/components/properties/wizard/steps/LocationStep.tsx`

- [ ] **Step 1: Replace the full file contents**

```tsx
// airbnb/components/properties/wizard/steps/LocationStep.tsx
"use client";

import dynamic from "next/dynamic";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";
import { CheckCircle2 } from "lucide-react";

const SearchBox = dynamic(
  () => import("@mapbox/search-js-react").then((m) => m.SearchBox),
  { ssr: false }
);

export function LocationStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleRetrieve(res: any) {
    const f = res.features[0];
    const [lng, lat] = f.geometry.coordinates as [number, number];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (f.properties as any).context ?? {};
    const fullAddress =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f.properties as any).full_address ?? (f.properties as any).place_formatted ?? "";

    form.setValue("lat", lat, { shouldValidate: true });
    form.setValue("lng", lng, { shouldValidate: true });
    form.setValue("address", fullAddress, { shouldValidate: true });
    form.setValue("city", ctx.place?.name ?? ctx.locality?.name ?? "", { shouldValidate: true });
    form.setValue("state", ctx.region?.name ?? "", { shouldValidate: true });
    form.setValue("country", ctx.country?.name ?? "", { shouldValidate: true });
  }

  const lat = form.watch("lat");
  const lng = form.watch("lng");
  const coordsSet = lat !== 0 && lng !== 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Where is your place located?</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your full address is only shared with confirmed guests.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Find your address</label>
        <SearchBox
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
          onRetrieve={handleRetrieve}
          placeholder="Start typing your address…"
          options={{ language: "en" }}
        />
        <p className="text-xs text-muted-foreground">
          Type and select — city, state, country, and coordinates fill automatically.
        </p>
      </div>

      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street address</FormLabel>
            <FormControl>
              <Input placeholder="123 Main St" {...field} />
            </FormControl>
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
              <FormControl>
                <Input placeholder="New York" {...field} />
              </FormControl>
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
              <FormControl>
                <Input placeholder="NY" {...field} />
              </FormControl>
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
            <FormControl>
              <Input placeholder="United States" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {coordsSet && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          Coordinates set: {lat.toFixed(4)}, {lng.toFixed(4)}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Test in browser**

Navigate to `/host/properties/new` (must be signed in). Advance to Step 2 (Location).  
Expected:
- A Mapbox SearchBox input renders
- Typing an address shows autocomplete suggestions
- Selecting a suggestion fills all fields and shows the green "Coordinates set" line
- No manual Latitude / Longitude inputs visible

- [ ] **Step 3: Commit**

```bash
git add airbnb/components/properties/wizard/steps/LocationStep.tsx
git commit -m "feat: replace manual lat/lng inputs with Mapbox address autocomplete"
```

---

## Task 5: Create PropertiesMap component

Multi-pin map for the search page. Each marker shows the property's nightly price. Hovering a pin highlights the matching card in the list; receiving a `flyTo` prop animates the camera.

**Files:**
- Create: `airbnb/components/map/PropertiesMap.tsx`

- [ ] **Step 1: Create the file**

```tsx
// airbnb/components/map/PropertiesMap.tsx
"use client";

import { useEffect, useRef } from "react";
import Map, { Marker, NavigationControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { Doc } from "@/convex/_generated/dataModel";

interface FlyToTarget {
  lng: number;
  lat: number;
  zoom?: number;
}

interface PropertiesMapProps {
  properties: Doc<"properties">[];
  hoveredId: string | null;
  onMarkerHover: (id: string | null) => void;
  flyTo: FlyToTarget | null;
  onBoundsChange: (bounds: { north: number; south: number; east: number; west: number } | null) => void;
}

function formatPrice(cents: number) {
  return `$${Math.round(cents / 100)}`;
}

export function PropertiesMap({
  properties,
  hoveredId,
  onMarkerHover,
  flyTo,
  onBoundsChange,
}: PropertiesMapProps) {
  const mapRef = useRef<MapRef>(null);

  useEffect(() => {
    if (flyTo && mapRef.current) {
      mapRef.current.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? 12 });
    }
  }, [flyTo]);

  function captureBounds(map: mapboxgl.Map) {
    const b = map.getBounds();
    if (b) {
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    }
  }

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
      initialViewState={{ longitude: 0, latitude: 20, zoom: 1.5 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      onLoad={(evt) => captureBounds(evt.target)}
      onMoveEnd={(evt) => captureBounds(evt.target)}
    >
      <NavigationControl position="top-right" />
      {properties.map((p) => (
        <Marker key={p._id} longitude={p.lng} latitude={p.lat} anchor="bottom">
          <button
            className={`px-2 py-1 rounded-full text-xs font-semibold shadow-md transition-transform cursor-pointer ${
              hoveredId === p._id
                ? "bg-foreground text-background scale-110 z-10"
                : "bg-background text-foreground border border-border hover:scale-105"
            }`}
            onMouseEnter={() => onMarkerHover(p._id)}
            onMouseLeave={() => onMarkerHover(null)}
            onClick={() => window.open(`/properties/${p._id}`, "_blank")}
          >
            {formatPrice(p.pricePerNight)}
          </button>
        </Marker>
      ))}
    </Map>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd airbnb && pnpm tsc --noEmit
```

Expected: no new errors from `PropertiesMap.tsx`. (If you see `mapboxgl.Map` type missing, add `import type mapboxgl from "mapbox-gl"` at the top.)

---

## Task 6: Add non-paginated Convex query

The search page needs all published properties at once (not paginated) to show all pins on the map.

**Files:**
- Modify: `airbnb/convex/properties.ts`

- [ ] **Step 1: Add the query**

Open `airbnb/convex/properties.ts`. At the end of the file, append:

```ts
export const getAllPublishedProperties = query({
  args: {},
  handler: async (ctx) => {
    return ctx.db
      .query("properties")
      .withIndex("by_status", (q) => q.eq("status", "published"))
      .collect();
  },
});
```

(All existing imports — `query`, `v`, etc. — are already present in the file.)

- [ ] **Step 2: Verify Convex generates types**

```bash
cd airbnb && npx convex dev --once
```

Expected: `convex/_generated/api.d.ts` updates to include `getAllPublishedProperties`.

---

## Task 7: Build the search page

A full-screen page with a filter bar, a scrollable property list on the left, and a sticky map on the right. The list updates as the user pans the map.

**Files:**
- Create: `airbnb/app/search/page.tsx`
- Create: `airbnb/app/search/SearchClient.tsx`

- [ ] **Step 1: Create the server wrapper**

```tsx
// airbnb/app/search/page.tsx
import { SearchClient } from "./SearchClient";

export const metadata = { title: "Search — StayFinder" };

export default function SearchPage() {
  return <SearchClient />;
}
```

- [ ] **Step 2: Create SearchClient**

```tsx
// airbnb/app/search/SearchClient.tsx
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { PROPERTY_TYPES } from "@/lib/property-types";

const SearchBox = dynamic(
  () => import("@mapbox/search-js-react").then((m) => m.SearchBox),
  { ssr: false }
);

const PropertiesMap = dynamic(
  () => import("@/components/map/PropertiesMap").then((m) => m.PropertiesMap),
  { ssr: false }
);

interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface FlyToTarget {
  lng: number;
  lat: number;
  zoom?: number;
}

export function SearchClient() {
  const allProperties = useQuery(api.properties.getAllPublishedProperties, {});

  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [flyTo, setFlyTo] = useState<FlyToTarget | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [minGuests, setMinGuests] = useState(1);
  const [propertyType, setPropertyType] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleLocationRetrieve(res: any) {
    const f = res.features[0];
    const [lng, lat] = f.geometry.coordinates as [number, number];
    setFlyTo({ lng, lat, zoom: 12 });
  }

  const visibleProperties = (allProperties ?? []).filter((p) => {
    if (
      bounds &&
      (p.lat < bounds.south ||
        p.lat > bounds.north ||
        p.lng < bounds.west ||
        p.lng > bounds.east)
    ) {
      return false;
    }
    if (p.maxGuests < minGuests) return false;
    if (propertyType && p.type !== propertyType) return false;
    return true;
  });

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="px-4 flex-shrink-0">
        <Navbar />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 px-4 pb-4 flex-shrink-0 border-b">
        <div className="w-72">
          <SearchBox
            accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
            onRetrieve={handleLocationRetrieve}
            placeholder="Search destination…"
            options={{ language: "en", types: "place,region,country,district" }}
          />
        </div>

        {/* Guests counter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Guests</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMinGuests((g) => Math.max(1, g - 1))}
              disabled={minGuests <= 1}
            >
              <Minus className="h-3 w-3" />
            </Button>
            <span className="w-6 text-center text-sm font-medium">{minGuests}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setMinGuests((g) => g + 1)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Property type filter */}
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
        >
          <option value="">All types</option>
          {PROPERTY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Property list */}
        <div className="w-1/2 overflow-y-auto px-4 py-4">
          <p className="text-sm text-muted-foreground mb-4">
            {visibleProperties.length}{" "}
            {visibleProperties.length === 1 ? "property" : "properties"} in view
          </p>

          {visibleProperties.length === 0 && allProperties !== undefined && (
            <div className="py-12 text-center">
              <p className="font-medium">No properties in this area</p>
              <p className="text-sm text-muted-foreground mt-1">
                Try zooming out or searching a different location.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleProperties.map((p) => (
              <div
                key={p._id}
                onMouseEnter={() => setHoveredId(p._id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`rounded-xl transition-shadow ${
                  hoveredId === p._id ? "ring-2 ring-foreground shadow-lg" : ""
                }`}
              >
                <PropertyCard property={p} />
              </div>
            ))}
          </div>
        </div>

        {/* Map */}
        <div className="w-1/2 h-full">
          <PropertiesMap
            properties={allProperties ?? []}
            hoveredId={hoveredId}
            onMarkerHover={setHoveredId}
            flyTo={flyTo}
            onBoundsChange={setBounds}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Check PROPERTY_TYPES export**

Open `airbnb/lib/property-types.ts`. Verify it exports `PROPERTY_TYPES` as an array with `{ value, label }` objects. If the export name or shape differs, adjust the import in `SearchClient.tsx` accordingly.

- [ ] **Step 4: Test in browser**

Navigate to `http://localhost:3000/search`.  
Expected:
- Filter bar with a Mapbox SearchBox, guest counter, and type dropdown
- Left panel shows all published properties
- Right panel shows a world map with price badge pins
- Panning/zooming the map filters the left list to only in-view properties
- Typing a city in SearchBox and selecting → map flies to that city, list updates
- Hovering a card highlights the matching pin (and vice versa)

- [ ] **Step 5: Commit**

```bash
git add airbnb/app/search/ airbnb/components/map/PropertiesMap.tsx
git commit -m "feat: search page with interactive map and bounding-box property filter"
```

---

## Task 8: Add search entry point to Navbar

Add an "Explore" link in the Navbar so users can reach the search page.

**Files:**
- Modify: `airbnb/components/Navbar.tsx`

- [ ] **Step 1: Add the Search icon import**

In `Navbar.tsx`, the existing import line is:

```tsx
import { PlusCircle, LayoutList, Plane } from "lucide-react";
```

Change it to:

```tsx
import { PlusCircle, LayoutList, Plane, Search } from "lucide-react";
```

- [ ] **Step 2: Add Explore link**

Inside `Navbar`, find the `<Unauthenticated>` block's sibling — actually, add the link to both authenticated and unauthenticated states by placing it directly inside the `<header>` between the logo and the auth section.

Find:

```tsx
    <header className="flex items-center justify-between py-4 border-b mb-8">
      <Link href="/" className="text-xl font-bold tracking-tight">
        StayFinder
      </Link>
```

Replace with:

```tsx
    <header className="flex items-center justify-between py-4 border-b mb-8">
      <Link href="/" className="text-xl font-bold tracking-tight">
        StayFinder
      </Link>

      <Link
        href="/search"
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <Search className="h-4 w-4" />
        Explore
      </Link>
```

- [ ] **Step 3: Test in browser**

Reload any page. Expected: "Explore" link visible in the navbar, clicking it navigates to `/search`.

- [ ] **Step 4: Commit**

```bash
git add airbnb/components/Navbar.tsx
git commit -m "feat: add Explore link to navbar pointing to /search"
```

---

## Done

Phase 3 is complete when:
- Sign-in page renders correctly (Task 0)
- Property detail pages show a real Mapbox map (Task 3)
- Property wizard LocationStep has address autocomplete — no manual lat/lng (Task 4)
- `/search` page shows a split list+map that filters as user pans (Task 7)
- "Explore" link in navbar (Task 8)
