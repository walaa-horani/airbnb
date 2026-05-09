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
