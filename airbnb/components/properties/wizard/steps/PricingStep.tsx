// airbnb/components/properties/wizard/steps/PricingStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PropertyFormValues } from "../schema";

function CentsInput({ label, description, form, name }: {
  label: string;
  description?: string;
  form: UseFormReturn<PropertyFormValues>;
  name: "pricePerNight" | "cleaningFee";
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
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                min={0}
                step={0.01}
                className="pl-7"
                placeholder="0.00"
                value={field.value ? (field.value / 100).toFixed(2) : ""}
                onChange={(e) =>
                  field.onChange(Math.round(parseFloat(e.target.value || "0") * 100))
                }
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function PricingStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const pricePerNight = form.watch("pricePerNight") ?? 0;
  const cleaningFee = form.watch("cleaningFee") ?? 0;
  const serviceFee = Math.round((pricePerNight + cleaningFee) * 0.05);
  const total = pricePerNight + cleaningFee + serviceFee;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Set your price</h2>
        <p className="text-muted-foreground text-sm mt-1">
          You can change this any time. A 5% service fee is added for guests.
        </p>
      </div>

      <CentsInput label="Nightly rate" form={form} name="pricePerNight" />
      <CentsInput label="Cleaning fee" description="One-time charge per stay" form={form} name="cleaningFee" />

      {pricePerNight > 0 && (
        <div className="rounded-lg border p-4 space-y-2 text-sm">
          <p className="font-medium">Guest pays (per night + cleaning):</p>
          <div className="flex justify-between text-muted-foreground">
            <span>Nightly rate</span>
            <span>${(pricePerNight / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Cleaning fee</span>
            <span>${(cleaningFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Service fee (5%)</span>
            <span>${(serviceFee / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Guest total</span>
            <span>${(total / 100).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-green-600">
            <span>You receive</span>
            <span>${((pricePerNight + cleaningFee) / 100).toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
