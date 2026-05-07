// airbnb/components/properties/PropertyCard.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
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
