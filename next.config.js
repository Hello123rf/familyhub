const { buildSecurityHeaders } = require('./src/lib/utils/securityHeaders');

const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const withSerwist = require('@serwist/next').default({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Everything below replicates the prior next-pwa precache exclusions
  // exactly (see src/app/sw.ts for the runtime-caching side of this same
  // migration). Serwist's `exclude` filters entries out of the precache
  // manifest by matching each entry's asset path.
  //
  // Noto Color Emoji: the font is split by unicode-range precisely so a
  // display fetches only the chunks for emoji it actually renders (see
  // src/app/layout.tsx). Precaching all ten chunks (~3.8 MB) unconditionally
  // undid that on every service-worker install.
  //
  // MapLibre's worker chunks (public/maplibre, written by
  // scripts/copy-maplibre-worker.mjs, ~500 kB) are only ever fetched by the
  // travel globe; precaching them would download the pair onto every
  // display, including ones that never open Travel. MapLibre requests the
  // worker itself when a map is created.
  //
  // Twemoji is the biggest instance of the same problem: 3846 SVGs
  // totalling 18MB, previously 91% of the precache manifest — every
  // service-worker install fetched all of it as 3846 separate requests
  // before settling, and a deploy invalidates the worker, so a thin client
  // paid that cost on every deploy. A page renders a few dozen emoji, not
  // 3846; they are <img> tags (components/ui/Emoji.tsx) and the browser
  // caches them normally on first use — on-demand, not precached.
  exclude: [
    /noto-color-emoji.*\.woff2$/,
    /^maplibre\//,
    /^twemoji\//,
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 16 writes AGENTS.md and CLAUDE.md into the repo root on dev/build.
  // CLAUDE.md here is gitignored and holds this project's own rules, so that
  // generation would quietly replace a file with no copy in git. Off.
  agentRules: false,

  output: 'standalone',
  reactStrictMode: true,
  // Pre-existing ESLint warnings in upstream Prism files use interface instead
  // of type — not errors introduced by this fork. TypeScript strict mode still
  // runs; this only stops ESLint from blocking the production build.
  eslint: { ignoreDuringBuilds: true },
  serverExternalPackages: ['undici'],

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.icloud.com' },
      { protocol: 'https', hostname: '*.sharepoint.com' },
      { protocol: 'https', hostname: '*.live.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: 'openweathermap.org' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'date-fns',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
    ];
  },

  async redirects() {
    return [];
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)), 'undici'];
    }
    return config;
  },

  env: {
    NEXT_PUBLIC_APP_NAME: 'Prism',
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
};

module.exports = withBundleAnalyzer(withSerwist(nextConfig));
