import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // chokidar watches the content directory at runtime; keep it out of the server bundle.
  serverExternalPackages: ['chokidar'],
  // No next/image anywhere; turning the optimizer off removes /_next/image from the public surface.
  images: { unoptimized: true },
  // Content and progress data are read from disk at request time; never copy them into the build.
  outputFileTracingExcludes: {
    '*': ['./content/**/*'],
  },
  // Shared libraries for sandboxed pages, whose opaque origin makes module scripts CORS requests.
  async headers() {
    return [{ source: '/_lib/:path*', headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }] }];
  },
};

export default nextConfig;
