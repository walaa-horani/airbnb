// app/properties/[id]/PropertyDetailClient.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import { DayPicker, DateRange } from "react-day-picker";
import "react-day-picker/style.css";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button, buttonVariants } from "@/components/ui/button";
import { MapPin, Users, BedDouble, Bath, Clock, Star, Minus, Plus } from "lucide-react";
import { PropertyMap } from "@/components/map/PropertyMap";

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

function toDateString(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function PropertyDetailClient({ property }: { property: Doc<"properties"> }) {
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [range, setRange] = useState<DateRange | undefined>();
  const [guests, setGuests] = useState(1);

  const images = useQuery(api.propertyImages.getPropertyImages, { propertyId: property._id });
  const bookedDates = useQuery(api.bookings.getBookedDates, { propertyId: property._id });

  const allImages = images ?? [];
  const lightboxSlides = allImages.map((img) => ({ src: img.url }));

  const disabledDates: Date[] = [];
  for (const b of bookedDates ?? []) {
    const start = new Date(b.checkIn);
    const end = new Date(b.checkOut);
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      disabledDates.push(new Date(d));
    }
  }

  const checkIn = range?.from;
  const checkOut = range?.to;
  const nights =
    checkIn && checkOut
      ? Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000)
      : 0;

  const subtotal = property.pricePerNight * nights;
  const cleaningFee = nights > 0 ? property.cleaningFee : 0;
  const serviceFee = Math.round((subtotal + cleaningFee) * 0.05);
  const total = subtotal + cleaningFee + serviceFee;

  const checkoutHref =
    checkIn && checkOut && nights >= property.minNights
      ? `/checkout/${property._id}?checkIn=${toDateString(checkIn)}&checkOut=${toDateString(checkOut)}&guests=${guests}`
      : null;

  const reserveDisabled = !checkoutHref || guests > property.maxGuests;

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
            <h2 className="text-lg font-semibold mb-3">Select dates</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Minimum stay: {property.minNights} night{property.minNights !== 1 ? "s" : ""}.
            </p>
            <DayPicker
              mode="range"
              selected={range}
              onSelect={setRange}
              disabled={[{ before: new Date() }, ...disabledDates]}
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

            {/* Date summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Check-in</p>
                <p className="font-medium">{checkIn ? toDateString(checkIn) : "—"}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Check-out</p>
                <p className="font-medium">{checkOut ? toDateString(checkOut) : "—"}</p>
              </div>
            </div>

            {/* Guest counter */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Guests</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  disabled={guests <= 1}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{guests}</span>
                <Button
                  variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => setGuests((g) => Math.min(property.maxGuests, g + 1))}
                  disabled={guests >= property.maxGuests}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Pricing breakdown — only shown when dates selected */}
            {nights > 0 && (
              <div className="space-y-2 text-sm">
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{formatCents(property.pricePerNight)} × {nights} night{nights !== 1 ? "s" : ""}</span>
                  <span>{formatCents(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cleaning fee</span>
                  <span>{formatCents(property.cleaningFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service fee (5%)</span>
                  <span>{formatCents(serviceFee)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span>
                  <span>{formatCents(total)}</span>
                </div>
              </div>
            )}

            {checkoutHref ? (
              <Link
                href={checkoutHref}
                className={buttonVariants({ size: "lg", className: "w-full justify-center" })}
              >
                Reserve
              </Link>
            ) : (
              <Button className="w-full" size="lg" disabled={reserveDisabled}>
                {!checkIn || !checkOut
                  ? "Select dates"
                  : nights < property.minNights
                    ? `Minimum ${property.minNights} nights`
                    : "Reserve"}
              </Button>
            )}

            <p className="text-center text-xs text-muted-foreground">You won&apos;t be charged yet</p>
          </div>
        </div>
      </div>
    </div>
  );
}
