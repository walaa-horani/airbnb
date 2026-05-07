// airbnb/components/properties/wizard/steps/LocationStep.tsx
"use client";

import dynamic from "next/dynamic";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";
import { CheckCircle2 } from "lucide-react";

const SearchBox = dynamic(
  () => import("@mapbox/search-js-react").then((m) => m.SearchBox),
  { ssr: false }
);

export function LocationStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleRetrieve(res: any) {
    const f = res.features[0];
    const [lng, lat] = f.geometry.coordinates as [number, number];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (f.properties as any).context ?? {};
    const fullAddress =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (f.properties as any).full_address ?? (f.properties as any).place_formatted ?? "";

    form.setValue("lat", lat, { shouldValidate: true });
    form.setValue("lng", lng, { shouldValidate: true });
    form.setValue("address", fullAddress, { shouldValidate: true });
    form.setValue("city", ctx.place?.name ?? ctx.locality?.name ?? "", { shouldValidate: true });
    form.setValue("state", ctx.region?.name ?? "", { shouldValidate: true });
    form.setValue("country", ctx.country?.name ?? "", { shouldValidate: true });
  }

  const lat = form.watch("lat");
  const lng = form.watch("lng");
  const coordsSet = lat !== 0 && lng !== 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Where is your place located?</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your full address is only shared with confirmed guests.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Find your address</label>
        <SearchBox
          accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN!}
          onRetrieve={handleRetrieve}
          placeholder="Start typing your address…"
          options={{ language: "en" }}
        />
        <p className="text-xs text-muted-foreground">
          Type and select — city, state, country, and coordinates fill automatically.
        </p>
      </div>

      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street address</FormLabel>
            <FormControl>
              <Input placeholder="123 Main St" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem>
              <FormLabel>City</FormLabel>
              <FormControl>
                <Input placeholder="New York" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="state"
          render={({ field }) => (
            <FormItem>
              <FormLabel>State / Region</FormLabel>
              <FormControl>
                <Input placeholder="NY" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="country"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Country</FormLabel>
            <FormControl>
              <Input placeholder="United States" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {coordsSet && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
          Coordinates set: {lat.toFixed(4)}, {lng.toFixed(4)}
        </p>
      )}
    </div>
  );
}
