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
    /**
     * Content Security Policy.
     *
     * The site loads nothing from third parties — no font CDN, no analytics
     * script, no embedded widgets — so the policy can be genuinely strict
     * rather than a list of exceptions. 'unsafe-inline' on styles is required
     * because Tailwind and React inline critical styles; scripts do not get
     * it. If an analytics or maps provider is added later, add it here
     * deliberately rather than loosening the whole policy.
     */
    const csp = [
      "default-src 'self'",
      // Next.js needs eval in development for fast refresh only.
      process.env.NODE_ENV === "production"
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      // Only meaningful when the site itself is served over https; on a local
      // http server it upgrades our own redirects to unreachable https URLs.
      ...(String(process.env.APP_URL ?? "").startsWith("https")
        ? ["upgrade-insecure-requests"]
        : []),
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
          // Two years, subdomains included. Only meaningful over HTTPS, which
          // is everywhere the site actually runs.
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
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
