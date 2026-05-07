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
