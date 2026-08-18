import type { NextConfig } from "next";

const CANONICAL_HOST = "routegeorgia.ge";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["postgres", "bcryptjs"],

  /**
   * One canonical hostname.
   *
   * The site answers on the apex domain, on www, and on the hosting subdomain.
   * Left alone, search engines treat those as three competing sites and split
   * the ranking between them.
   *
   * The www redirect is always safe. Redirecting the hosting subdomain is NOT:
   * until DNS for the custom domain resolves, it sends every visitor to an
   * address that does not exist yet and takes the site offline. So it is
   * opt-in, and only switched on once the domain is verified and serving.
   */
  async redirects() {
    const rules = [
      {
        source: "/:path*",
        has: [{ type: "host" as const, value: `www.${CANONICAL_HOST}` }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: true,
      },
    ];

    if (process.env.ENFORCE_CANONICAL_HOST === "true") {
      rules.push({
        source: "/:path*",
        has: [{ type: "host" as const, value: "(?<sub>.*)\\.onrender\\.com" }],
        destination: `https://${CANONICAL_HOST}/:path*`,
        permanent: false,
      });
    }

    return rules;
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
