/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['klinecharts'],

  experimental: {
    // Enable instrumentation.ts startup hook (stable in Next.js 14.1+)
    instrumentationHook: true,
  },

  images: {
    remotePatterns: [],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  async rewrites() {
    const apiBase = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
