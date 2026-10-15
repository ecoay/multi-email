import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // postgres.js uses Node sockets; keep it out of the bundle.
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
