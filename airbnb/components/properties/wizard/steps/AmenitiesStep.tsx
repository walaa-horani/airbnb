// airbnb/components/properties/wizard/steps/AmenitiesStep.tsx
"use client";

import { useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { AMENITIES } from "@/lib/property-types";
import { PropertyFormValues } from "../schema";

export function AmenitiesStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const [newRule, setNewRule] = useState("");
  const amenities = form.watch("amenities") ?? [];
  const houseRules = form.watch("houseRules") ?? [];

  const toggleAmenity = (amenity: string) => {
    const current = form.getValues("amenities") ?? [];
    form.setValue(
      "amenities",
      current.includes(amenity)
        ? current.filter((a) => a !== amenity)
        : [...current, amenity],
    );
  };

  const addRule = () => {
    const trimmed = newRule.trim();
    if (!trimmed) return;
    form.setValue("houseRules", [...houseRules, trimmed]);
    setNewRule("");
  };

  const removeRule = (i: number) => {
    form.setValue("houseRules", houseRules.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">What does your place offer?</h2>
        <p className="text-muted-foreground text-sm mt-1">Select all amenities that apply.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {AMENITIES.map((amenity) => (
            <label
              key={amenity}
              className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-muted transition-colors"
            >
              <Checkbox
                checked={amenities.includes(amenity)}
                onCheckedChange={() => toggleAmenity(amenity)}
              />
              <span className="text-sm">{amenity}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">House rules</h2>
        <p className="text-muted-foreground text-sm mt-1">Add any rules guests must follow.</p>

        <div className="mt-4 flex gap-2">
          <Input
            placeholder='e.g. "No smoking"'
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRule())}
          />
          <Button type="button" variant="outline" onClick={addRule}>Add</Button>
        </div>

        {houseRules.length > 0 && (
          <ul className="mt-3 space-y-2">
            {houseRules.map((rule, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                {rule}
                <button type="button" onClick={() => removeRule(i)}>
                  <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
