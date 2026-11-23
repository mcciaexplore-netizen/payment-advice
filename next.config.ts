import type { NextConfig } from "next";
import path from "node:path";
import { frameAncestorsPolicy } from "./lib/app-hub-config";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Only the MCCIA App Hub (APP_HUB_ORIGINS) may show the Payment Desk inside
  // its pages. Unset: no header, exactly as before.
  async headers() {
    const policy = frameAncestorsPolicy();
    return policy ? [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: policy }] }] : [];
  },
};

export default nextConfig;
