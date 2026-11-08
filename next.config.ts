import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Don't advertise the framework.
  poweredByHeader: false,
  // Server Actions parse their body before the session check, for anonymous callers too.
  // The largest real payload is a Rundmail (50 000 characters); 1 MB was the default.
  experimental: { serverActions: { bodySizeLimit: "512kb" } },
  // Conservative security headers for every response. No full CSP on purpose:
  // Next relies on inline bootstrap scripts, and a wrong CSP would break the app
  // (YAGNI for a tiny internal tool). These three are safe and high-value.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
