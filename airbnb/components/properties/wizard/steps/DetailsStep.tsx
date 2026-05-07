// airbnb/components/properties/wizard/steps/DetailsStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { PropertyFormValues } from "../schema";

function NumberInput({ label, description, form, name, min = 0, max = 100 }: {
  label: string;
  description?: string;
  form: UseFormReturn<PropertyFormValues>;
  name: keyof PropertyFormValues;
  min?: number;
  max?: number;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          {description && <FormDescription>{description}</FormDescription>}
          <FormControl>
            <Input
              type="number"
              min={min}
              max={max}
              value={field.value as number}
              onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 0)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function DetailsStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Property details</h2>
        <p className="text-muted-foreground text-sm mt-1">Tell guests what your space offers.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberInput label="Max guests" form={form} name="maxGuests" min={1} max={50} />
        <NumberInput label="Bedrooms" form={form} name="bedrooms" min={0} max={50} />
        <NumberInput label="Beds" form={form} name="beds" min={1} max={100} />
        <NumberInput label="Bathrooms" form={form} name="bathrooms" min={1} max={50} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="checkInTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check-in time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="checkOutTime"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Check-out time</FormLabel>
              <FormControl><Input type="time" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <NumberInput label="Minimum nights" form={form} name="minNights" min={1} max={365} />
        <NumberInput label="Maximum nights" form={form} name="maxNights" min={1} max={365} />
      </div>

      <FormField
        control={form.control}
        name="instantBook"
        render={({ field }) => (
          <FormItem className="flex items-start gap-3 rounded-lg border p-4">
            <FormControl>
              <Checkbox checked={field.value} onCheckedChange={field.onChange} />
            </FormControl>
            <div>
              <FormLabel className="text-base">Instant Book</FormLabel>
              <FormDescription>
                Guests can book without waiting for your confirmation.
              </FormDescription>
            </div>
          </FormItem>
        )}
      />
    </div>
  );
}
