import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  allowedDevOrigins: ["http://127.0.0.1:3000"],
  output: "standalone",
};

export default nextConfig;
