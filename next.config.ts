import type { NextConfig } from "next";

const CANONICAL_HOST = "routegeorgia.ge";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "bcryptjs"],

  /**
   * One canonical hostname.
   *
   * The site answers on the apex domain, on www, and on the hosting
   * subdomain. Left alone, search engines treat those as three sites competing
   * with each other and split the ranking between them. Everything redirects
   * permanently to the apex.
   */
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "(?<sub>.*)\\.onrender\\.com" }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        ],
      },
      // Search, checkout and account surfaces must never be indexed (spec: SEO section).
      { source: "/:locale/search", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/driver/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};

export default config;
