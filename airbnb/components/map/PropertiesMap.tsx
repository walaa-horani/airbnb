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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function captureBounds(map: any) {
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
