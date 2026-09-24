import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Phase 1 Express backend is embedded in-process and loaded from node_modules at runtime.
  serverExternalPackages: ["express", "jsonwebtoken", "pg"],
};

export default nextConfig;
