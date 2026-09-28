import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // chokidar watches the content directory at runtime; keep it out of the server bundle.
  serverExternalPackages: ['chokidar'],
  // Content and progress data are read from disk at request time; never copy them into the build.
  outputFileTracingExcludes: {
    '*': ['./content/**/*'],
  },
};

export default nextConfig;
