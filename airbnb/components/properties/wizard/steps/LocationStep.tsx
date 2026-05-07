// airbnb/components/properties/wizard/steps/LocationStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";

export function LocationStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Where is your place located?</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Your full address is only shared with confirmed guests.
        </p>
      </div>

      <FormField
        control={form.control}
        name="address"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Street address</FormLabel>
            <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
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
              <FormControl><Input placeholder="New York" {...field} /></FormControl>
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
              <FormControl><Input placeholder="NY" {...field} /></FormControl>
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
            <FormControl><Input placeholder="United States" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="lat"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Latitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="40.7128"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="lng"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Longitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.0001"
                  placeholder="-74.0060"
                  value={field.value || ""}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: Use Google Maps to find your coordinates — right-click your address and copy the numbers.
      </p>
    </div>
  );
}
