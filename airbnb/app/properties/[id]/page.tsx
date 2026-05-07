// airbnb/app/properties/[id]/page.tsx
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { PropertyDetailClient } from "./PropertyDetailClient";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PropertyDetailPage({ params }: Props) {
  const { id } = await params;

  let property = null;
  try {
    property = await fetchQuery(api.properties.getProperty, {
      propertyId: id as Id<"properties">,
    });
  } catch {
    notFound();
  }

  if (!property) notFound();

  return <PropertyDetailClient property={property} />;
}
