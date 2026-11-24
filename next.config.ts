import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Trace from this project, not a parent folder that happens to hold another lockfile
  // (e.g. a git worktree inside the main checkout), so .next/standalone/server.js is always at the top.
  outputFileTracingRoot: process.cwd(),
  // No next/image anywhere; turning the optimizer off removes /_next/image from the public surface.
  images: { unoptimized: true },
  poweredByHeader: false,
  // The guide endpoint serves the page-writing reference from disk.
  outputFileTracingIncludes: {
    '/api/guide': ['./docs/pages.md'],
  },
  // Shared libraries for sandboxed pages, whose opaque origin makes module scripts CORS requests.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      { source: '/_lib/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] },
    ];
  },
};

export default nextConfig;
