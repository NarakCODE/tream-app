import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
   /* config options here */
   devIndicators: false,
   transpilePackages: ['@repo/schemas', '@repo/api-client', '@repo/query', '@repo/ui'],
};

export default nextConfig;
