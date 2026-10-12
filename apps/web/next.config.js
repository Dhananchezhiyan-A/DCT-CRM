/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@dct-crm/db', '@dct-crm/shared'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
