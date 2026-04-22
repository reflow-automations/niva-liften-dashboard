import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
