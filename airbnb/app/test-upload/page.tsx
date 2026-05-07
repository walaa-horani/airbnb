"use client";

import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { ImageUploader, UploadedImage } from "@/components/properties/ImageUploader";
import { Badge } from "@/components/ui/badge";

export default function TestUploadPage() {
  const [images, setImages] = useState<UploadedImage[]>([]);

  return (
    <div className="mx-auto max-w-2xl px-4">
      <Navbar />
      <h1 className="text-2xl font-bold mb-2">Cloudinary Upload Test</h1>
      <p className="text-muted-foreground text-sm mb-6">
        Upload images to verify your Cloudinary configuration is working.
      </p>

      <ImageUploader images={images} onChange={setImages} maxImages={5} />

      {images.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="font-semibold text-sm">Uploaded results</h2>
          {images.map((img) => (
            <div key={img.publicId} className="rounded-lg border p-3 text-xs font-mono space-y-1 break-all">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">publicId:</span>
                <span>{img.publicId}</span>
                {img.isCover && <Badge variant="secondary" className="text-[10px]">cover</Badge>}
              </div>
              <div>
                <span className="text-muted-foreground">url: </span>
                <a href={img.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                  {img.url}
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
