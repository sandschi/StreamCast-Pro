/** @type {import('next').NextConfig} */
const nextConfig = {
  // Ensures CHANGELOG.md is bundled into the /api/changelog serverless
  // function on Vercel — it's read at runtime via fs, not imported, so
  // Next.js's automatic file tracing wouldn't include it otherwise.
  outputFileTracingIncludes: {
    '/api/changelog': ['./CHANGELOG.md'],
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'avatars.twitch.tv',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.jtvnw.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net',
        pathname: '/emoticons/v2/**',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.7tv.app',
        pathname: '/emote/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.betterttv.net',
        pathname: '/emote/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.frankerfacez.com',
        pathname: '/emote/**',
      }
    ]
  }
};

export default nextConfig;
