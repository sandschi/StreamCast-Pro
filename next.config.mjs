/** @type {import('next').NextConfig} */
const nextConfig = {
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
