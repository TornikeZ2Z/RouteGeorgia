import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Search results, accounts and internal consoles must never be indexed:
        // they are per-user, they expire, and they contain no unique content.
        disallow: ["/api/", "/admin", "/driver", "/login", "/*/search"],
      },
    ],
    sitemap: `${config.appUrl}/sitemap.xml`,
    host: config.appUrl,
  };
}
