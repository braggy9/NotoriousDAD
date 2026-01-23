import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use webpack instead of Turbopack (Turbopack doesn't handle symlinks outside project root)
  webpack: (config) => {
    // Exclude audio-library from webpack scanning
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/audio-library/**', '**/data/audio-library-analysis.json'],
    };
    return config;
  },
};

export default nextConfig;
