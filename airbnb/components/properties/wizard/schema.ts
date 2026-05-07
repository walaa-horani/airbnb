// airbnb/components/properties/wizard/schema.ts
import { z } from "zod";

export const propertySchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(2000),
  type: z.string().min(1, "Select a property type"),
  address: z.string().min(5, "Enter a full address"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State/region is required"),
  country: z.string().min(1, "Country is required"),
  lat: z.number(),
  lng: z.number(),
  maxGuests: z.number().min(1).max(50),
  bedrooms: z.number().min(0).max(50),
  beds: z.number().min(1).max(100),
  bathrooms: z.number().min(1).max(50),
  checkInTime: z.string(),
  checkOutTime: z.string(),
  minNights: z.number().min(1),
  maxNights: z.number().min(1),
  instantBook: z.boolean(),
  amenities: z.array(z.string()),
  houseRules: z.array(z.string()),
  coverImageUrl: z.string().min(1, "At least one photo is required"),
  coverImagePublicId: z.string(),
  images: z.array(z.object({ publicId: z.string(), url: z.string(), isCover: z.boolean() })),
  pricePerNight: z.number().min(100, "Minimum $1/night"),
  cleaningFee: z.number().min(0),
});

export type PropertyFormValues = z.infer<typeof propertySchema>;

export const STEPS = [
  { id: "basic", label: "Basics" },
  { id: "location", label: "Location" },
  { id: "details", label: "Details" },
  { id: "amenities", label: "Amenities" },
  { id: "photos", label: "Photos" },
  { id: "pricing", label: "Pricing" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
