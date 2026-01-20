import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Anchor Turbopack to this project (avoid picking up parent lockfiles).
    root: __dirname,
  },
};

export default nextConfig;
