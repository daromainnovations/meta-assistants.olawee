import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ['pdfkit', 'pdfmake', 'pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
  experimental: {
    // any experimental features if needed
  },
  // Body size limits in App Router are handled differently (usually in Route Handlers or middleware)
  // but for now we remove the invalid key.
};

export default nextConfig;
