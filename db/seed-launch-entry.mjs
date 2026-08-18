// Windows-safe launcher: `SEED_MODE=launch tsx db/seed.ts` does not work in
// PowerShell, so the mode is set here instead of on the command line.
process.env.SEED_MODE = "launch";
await import("tsx/esm/api").then(({ register }) => register());
await import("./seed.ts");
