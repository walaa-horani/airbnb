// airbnb/app/properties/[id]/PropertyDetailClient.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MapPin, Users, BedDouble, Bath, Clock, Star } from "lucide-react";
import { PropertyMap } from "@/components/map/PropertyMap";

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
      <h1 className="text-2xl font-bold mb-1">{property.title}</h1>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mb-4">
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
        onClick={() => allImages.length > 0 && setLightboxIndex(0)}
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
        <div className="lg:col-span-2 space-y-8">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{property.maxGuests} guests</span>
            <span className="flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" />
              {property.bedrooms} bedroom{property.bedrooms !== 1 ? "s" : ""} · {property.beds} bed{property.beds !== 1 ? "s" : ""}
            </span>
            <span className="flex items-center gap-1.5"><Bath className="h-4 w-4" />{property.bathrooms} bath{property.bathrooms !== 1 ? "s" : ""}</span>
            <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Check-in {property.checkInTime} · Check-out {property.checkOutTime}</span>
          </div>

          <Separator />

          <div>
            <h2 className="text-lg font-semibold mb-3">About this place</h2>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{property.description}</p>
          </div>

          <Separator />

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
        </div>

        {/* Booking widget */}
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
