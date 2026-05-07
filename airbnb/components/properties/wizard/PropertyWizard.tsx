// airbnb/components/properties/wizard/PropertyWizard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { propertySchema, PropertyFormValues, STEPS } from "./schema";
import { BasicInfoStep } from "./steps/BasicInfoStep";
import { LocationStep } from "./steps/LocationStep";
import { DetailsStep } from "./steps/DetailsStep";
import { AmenitiesStep } from "./steps/AmenitiesStep";
import { PhotosStep } from "./steps/PhotosStep";
import { PricingStep } from "./steps/PricingStep";

interface PropertyWizardProps {
  mode: "create" | "edit";
  propertyId?: Id<"properties">;
  defaultValues?: Partial<PropertyFormValues>;
}

const DEFAULT_VALUES: PropertyFormValues = {
  title: "",
  description: "",
  type: "",
  address: "",
  city: "",
  state: "",
  country: "",
  lat: 0,
  lng: 0,
  maxGuests: 2,
  bedrooms: 1,
  beds: 1,
  bathrooms: 1,
  checkInTime: "15:00",
  checkOutTime: "11:00",
  minNights: 1,
  maxNights: 30,
  instantBook: false,
  amenities: [],
  houseRules: [],
  coverImageUrl: "",
  coverImagePublicId: "",
  images: [],
  pricePerNight: 0,
  cleaningFee: 0,
};

export function PropertyWizard({ mode, propertyId, defaultValues }: PropertyWizardProps) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const createProperty = useMutation(api.properties.createProperty);
  const updateProperty = useMutation(api.properties.updateProperty);
  const addImage = useMutation(api.propertyImages.addPropertyImage);

  const form = useForm<PropertyFormValues>({
    resolver: zodResolver(propertySchema),
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
    mode: "onBlur",
  });

  const currentStep = STEPS[step];

  const stepComponents: Record<string, React.ReactNode> = {
    basic: <BasicInfoStep form={form} />,
    location: <LocationStep form={form} />,
    details: <DetailsStep form={form} />,
    amenities: <AmenitiesStep form={form} />,
    photos: <PhotosStep form={form} />,
    pricing: <PricingStep form={form} />,
  };

  const validateCurrentStep = async (): Promise<boolean> => {
    const stepFields: Record<string, (keyof PropertyFormValues)[]> = {
      basic: ["title", "description", "type"],
      location: ["address", "city", "state", "country", "lat", "lng"],
      details: ["maxGuests", "bedrooms", "beds", "bathrooms", "checkInTime", "checkOutTime", "minNights", "maxNights"],
      amenities: [],
      photos: ["coverImageUrl"],
      pricing: ["pricePerNight"],
    };

    const fields = stepFields[currentStep.id] ?? [];
    return await form.trigger(fields);
  };

  const handleNext = async () => {
    const valid = await validateCurrentStep();
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const onSubmit = async (values: PropertyFormValues) => {
    setSaving(true);
    try {
      const { images, ...propertyData } = values;

      if (mode === "create") {
        const newPropertyId = await createProperty(propertyData);

        for (let i = 0; i < images.length; i++) {
          await addImage({
            propertyId: newPropertyId,
            cloudinaryPublicId: images[i].publicId,
            url: images[i].url,
            order: i,
            isCover: images[i].isCover,
          });
        }

        router.push(`/host/properties`);
      } else if (mode === "edit" && propertyId) {
        await updateProperty({ propertyId, ...propertyData });
        router.push(`/host/properties`);
      }
    } catch (e) {
      console.error("Failed to save property:", e);
    } finally {
      setSaving(false);
    }
  };

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="text-sm font-medium">{currentStep.label}</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {stepComponents[currentStep.id]}

          <div className="flex justify-between pt-6 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={step === 0}
            >
              Back
            </Button>

            {isLastStep ? (
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : mode === "create" ? "Create listing" : "Save changes"}
              </Button>
            ) : (
              <Button type="button" onClick={handleNext}>
                Next
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
