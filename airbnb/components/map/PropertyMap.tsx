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
