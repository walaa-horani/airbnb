// airbnb/components/properties/ImageUploader.tsx
"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { X, Upload, Star } from "lucide-react";
import { uploadToCloudinary, CloudinaryUploadResult } from "@/lib/cloudinary";

export interface UploadedImage {
  publicId: string;
  url: string;
  isCover: boolean;
}

interface ImageUploaderProps {
  images: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  maxImages?: number;
}

export function ImageUploader({ images, onChange, maxImages = 20 }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      const remaining = maxImages - images.length;
      const toUpload = Array.from(files).slice(0, remaining);

      if (toUpload.length === 0) {
        setError(`Maximum ${maxImages} images allowed.`);
        return;
      }

      setUploading(true);
      setError(null);

      try {
        const results = await Promise.all(toUpload.map(uploadToCloudinary));

        const newImages: UploadedImage[] = results.map((r: CloudinaryUploadResult, i) => ({
          publicId: r.publicId,
          url: r.url,
          isCover: images.length === 0 && i === 0,
        }));

        onChange([...images, ...newImages]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
      }
    },
    [images, onChange, maxImages],
  );

  const removeImage = (publicId: string) => {
    const updated = images.filter((img) => img.publicId !== publicId);
    if (updated.length > 0 && !updated.some((img) => img.isCover)) {
      updated[0] = { ...updated[0], isCover: true };
    }
    onChange(updated);
  };

  const setCover = (publicId: string) => {
    onChange(
      images.map((img) => ({ ...img, isCover: img.publicId === publicId })),
    );
  };

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-muted-foreground/30 p-8 hover:border-muted-foreground/60 transition-colors">
        <Upload className="h-8 w-8 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">Click to upload photos</p>
          <p className="text-sm text-muted-foreground">
            JPG, PNG, WebP up to 10MB each · {images.length}/{maxImages} uploaded
          </p>
        </div>
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
          disabled={uploading || images.length >= maxImages}
        />
      </label>

      {uploading && (
        <p className="text-center text-sm text-muted-foreground animate-pulse">
          Uploading…
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <div key={img.publicId} className="group relative aspect-square">
              <Image
                src={img.url}
                alt=""
                fill
                className="rounded-lg object-cover"
                sizes="120px"
              />
              {img.isCover && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white font-medium">
                  Cover
                </span>
              )}
              <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                {!img.isCover && (
                  <button
                    type="button"
                    onClick={() => setCover(img.publicId)}
                    className="rounded-full bg-white/90 p-1.5 hover:bg-white"
                    title="Set as cover"
                  >
                    <Star className="h-3.5 w-3.5 text-amber-500" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => removeImage(img.publicId)}
                  className="rounded-full bg-white/90 p-1.5 hover:bg-white"
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
