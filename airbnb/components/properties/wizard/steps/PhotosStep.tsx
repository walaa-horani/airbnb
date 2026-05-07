// airbnb/components/properties/wizard/steps/PhotosStep.tsx
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormMessage } from "@/components/ui/form";
import { ImageUploader, UploadedImage } from "@/components/properties/ImageUploader";
import { PropertyFormValues } from "../schema";

export function PhotosStep({ form }: { form: UseFormReturn<PropertyFormValues> }) {
  const images = (form.watch("images") as UploadedImage[]) ?? [];

  const handleChange = (updated: UploadedImage[]) => {
    form.setValue("images", updated);
    const cover = updated.find((img) => img.isCover) ?? updated[0];
    if (cover) {
      form.setValue("coverImageUrl", cover.url);
      form.setValue("coverImagePublicId", cover.publicId);
    } else {
      form.setValue("coverImageUrl", "");
      form.setValue("coverImagePublicId", "");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Add photos of your place</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Great photos help guests decide to book. Add at least one. The first is your cover photo.
        </p>
      </div>

      <FormField
        control={form.control}
        name="coverImageUrl"
        render={() => (
          <FormItem>
            <ImageUploader images={images} onChange={handleChange} maxImages={20} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
