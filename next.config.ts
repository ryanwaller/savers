import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        // Keep this as a single glob string. Webpack's schema in Next 16 can reject
        // inherited mixed ignored arrays from internal compilers.
        ignored: "**/{.next,extension,chrome-extension}/**",
      };
    }

    return config;
  },
};

export default nextConfig;
