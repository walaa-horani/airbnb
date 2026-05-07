// airbnb/app/page.tsx
"use client";

import { usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

export default function HomePage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.getPublishedProperties,
    {},
    { initialNumItems: 10 },
  );

  return (
    <div className="mx-auto max-w-7xl px-4">
      <Navbar />

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
