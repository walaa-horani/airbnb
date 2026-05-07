// airbnb/next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/clerk-proxy/:path*",
        destination: `${process.env.CLERK_FRONTEND_API_URL}/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      { hostname: "res.cloudinary.com" },
      { hostname: "img.clerk.com" },
      { hostname: "picsum.photos" },
    ],
  },
};

export default nextConfig;
