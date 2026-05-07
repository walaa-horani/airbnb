// airbnb/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mapbox/search-js-react", "@mapbox/search-js-core"],
  images: {
    remotePatterns: [
      { hostname: "res.cloudinary.com" },
      { hostname: "img.clerk.com" },
      { hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
