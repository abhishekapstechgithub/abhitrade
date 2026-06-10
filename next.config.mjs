/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

  // Keep these heavy server-only packages out of the webpack client bundle.
  // pg and ioredis use node: protocol imports that webpack can't resolve for
  // browser/Edge targets.
  serverExternalPackages: ['pg', 'pg-native', 'ioredis'],

  images: {
    remotePatterns: [],
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  webpack(config, { isServer }) {
    if (!isServer) {
      // Prevent accidental client-side bundling of Node.js-only packages
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net:            false,
        tls:            false,
        fs:             false,
        dns:            false,
        child_process:  false,
        'pg-native':    false,
      };
    }
    return config;
  },
};

export default nextConfig;
