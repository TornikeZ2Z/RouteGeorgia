import type { MetadataRoute } from "next";

/**
 * Web app manifest. Matters most for drivers: it makes install-to-home-screen
 * give the console a real name and icon rather than a browser screenshot.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RoutePlanner",
    short_name: "RoutePlanner",
    description: "Private drivers across Georgia, booked in advance.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1d33",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
