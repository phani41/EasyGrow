/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Output as standalone for optimized Docker/Vercel deployment
  output: 'standalone',
  // Allow larger body size for CSV uploads
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Add remote patterns if using external images
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
