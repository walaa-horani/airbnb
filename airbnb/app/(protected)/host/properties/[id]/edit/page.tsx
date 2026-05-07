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
