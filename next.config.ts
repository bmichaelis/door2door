import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    middlewareClientMaxBodySize: 500 * 1024 * 1024, // 500MB — needed for large GeoJSON imports
  },
};

export default nextConfig;
