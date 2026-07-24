/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,

  // Image optimization — WebP/AVIF, lazy, responsive
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'rhdaffhlrglyknxtucux.supabase.co', pathname: '/storage/v1/object/**' },
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/**' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60 * 60 * 24 * 7, // 1 week
    deviceSizes: [320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // Tree-shake lucide icons, framer-motion
    optimizePackageImports: [
      'lucide-react',
      '@supabase/ssr',
      '@supabase/supabase-js',
      'framer-motion',
    ],
  },

  compiler: {
    // Remove console.logs in production (keep errors/warns)
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },

  // v78.1: REMOVED redirects() — it caused an infinite loop with the
  // operator's domain-level apex ↔ www config. The www → apex (and any
  // Vercel preview → apex) redirects should be configured at the
  // Cloudflare / Vercel / DNS level, NOT in the Next.js app.
  //
  // The OAuth canonical URL fix is in lib/oauth/canonical-callback.ts
  // and components/auth/LoginForm.tsx. They are independent of these
  // redirects and remain intact.

  // Caching strategy
  async headers() {
    return [
      // Long cache for static assets
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Cache images
      {
        source: '/_next/image:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Service worker
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // HTML — short cache (5s) for fast updates
      {
        source: '/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, s-maxage=5, stale-while-revalidate=300' },
        ],
      },
    ];
  },

  // Modern Next.js optimizations
  productionBrowserSourceMaps: false,
  generateBuildId: process.env.NODE_ENV === 'production' ? undefined : async () => 'dev',
  poweredByHeader: false,
};

module.exports = nextConfig;
