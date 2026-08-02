import type { NextConfig } from "next";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  // Produces a self-contained .next/standalone/server.js so the AMI only
  // needs to ship that output (plus .next/static and public/), not the full
  // node_modules tree - mirrors how the backend ships production deps only.
  output: "standalone",
  // Without this, Next infers the workspace root by walking up for the
  // nearest lockfile and can land outside this repo (e.g. a stray lockfile
  // in a parent directory), which nests standalone/server.js under an extra
  // path segment instead of at .next/standalone/server.js as packer expects.
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
