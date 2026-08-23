import type { MapCategory } from "@/lib/destinations";

/** Minimalist 24-box stroke icon paths per travel category. */
export const CATEGORY_ICONS: Record<MapCategory, string> = {
  mountains: "M3 19 L9.5 7 L13 13.5 L15.5 9.5 L21 19 Z",
  sea: "M3 10 q2.2 -2.6 4.5 0 t4.5 0 t4.5 0 t4.5 0 M3 15 q2.2 -2.6 4.5 0 t4.5 0 t4.5 0 t4.5 0",
  winter: "M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6 -9 M12 3l-2.5 2.5 M12 3l2.5 2.5 M12 21l-2.5 -2.5 M12 21l2.5 -2.5",
  wine: "M8 3h8c0 5-2.6 7.5-4 7.5S8 8 8 3Zm4 7.5V19m-4 2h8",
  culture: "M4 20h16 M6 20v-9m4 9v-9m4 9v-9m4 9v-9 M4 11h16 L12 4Z",
  nature: "M12 21C5.5 16.5 5.5 8.5 12 3.5c6.5 5 6.5 13 0 17.5Zm0 0V9",
};
