// app/(protected)/checkout/[propertyId]/page.tsx
import { CheckoutClient } from "./CheckoutClient";
import { Id } from "@/convex/_generated/dataModel";

interface Props {
  params: Promise<{ propertyId: string }>;
  searchParams: Promise<{ checkIn?: string; checkOut?: string; guests?: string }>;
}

export default async function CheckoutPage({ params, searchParams }: Props) {
  const { propertyId } = await params;
  const { checkIn, checkOut, guests } = await searchParams;
  return (
    <CheckoutClient
      propertyId={propertyId as Id<"properties">}
      checkIn={checkIn ?? ""}
      checkOut={checkOut ?? ""}
      guests={Number(guests ?? 1)}
    />
  );
}
