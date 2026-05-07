// airbnb/app/(protected)/host/properties/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/properties/PropertyCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus } from "lucide-react";

export default function HostPropertiesPage() {
  const [deleteId, setDeleteId] = useState<Id<"properties"> | null>(null);

  const { results, status, loadMore } = usePaginatedQuery(
    api.properties.getPropertiesByHost,
    {},
    { initialNumItems: 10 },
  );

  const deleteProperty = useMutation(api.properties.deleteProperty);

  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteProperty({ propertyId: deleteId });
    setDeleteId(null);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Your listings</h1>
        <Button asChild>
          <Link href="/host/properties/new">
            <Plus className="h-4 w-4 mr-2" />
            Add listing
          </Link>
        </Button>
      </div>

      {status === "LoadingFirstPage" && (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
          ))}
        </div>
      )}

      {status !== "LoadingFirstPage" && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-medium">No listings yet</p>
          <p className="text-muted-foreground mt-1">Create your first listing to start hosting.</p>
          <Button asChild className="mt-4">
            <Link href="/host/properties/new">Create listing</Link>
          </Button>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((property) => (
              <PropertyCard
                key={property._id}
                property={property}
                showActions
                onDelete={(id) => setDeleteId(id as Id<"properties">)}
              />
            ))}
          </div>

          {status === "CanLoadMore" && (
            <div className="mt-8 flex justify-center">
              <Button variant="outline" onClick={() => loadMore(10)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the listing. If it has active bookings, it will be unlisted instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
