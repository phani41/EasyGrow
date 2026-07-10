/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Output as standalone for optimized Docker/Vercel deployment
  output: 'standalone',
  // Allow larger body size for CSV data payloads (server actions are stable in Next.js 15)
  // Body size limit is configured via the backend's multer middleware (50MB default)
  // serverActions body size is handled by the built-in limits
  images: {
    remotePatterns: [],
  },
};

module.exports = nextConfig;
