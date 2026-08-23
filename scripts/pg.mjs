#!/usr/bin/env node
/**
 * Local Postgres control — no Docker, no Homebrew, no cloud account.
 *
 * Uses the Postgres binaries shipped by the `embedded-postgres` package and
 * drives them with pg_ctl so the server keeps running in the background after
 * this script exits.
 *
 *   node scripts/pg.mjs start | stop | status | reset
 *
 * For production, use a managed Postgres (Neon, Supabase, RDS) and set
 * DATABASE_URL. Nothing else in the application changes.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { randomBytes } from "node:crypto";

const ROOT = process.cwd();
const DATA_DIR = resolve(ROOT, ".pgdata");
const LOG_FILE = resolve(ROOT, ".pgdata", "server.log");
const PORT = 55432;
const USER = "app";
const PASSWORD = "app";
const DB = "routegeorgia";

const isWindows = process.platform === "win32";
const exe = (name) => (isWindows ? `${name}.exe` : name);

function binDir() {
  // npm package names use "windows", node reports "win32".
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const pkg = `@embedded-postgres/${platform}-${process.arch}`;
  const candidates = [
    resolve(ROOT, "node_modules", pkg, "native", "bin"),
    resolve(ROOT, "node_modules", "embedded-postgres", "node_modules", pkg, "native", "bin"),
  ];
  for (const dir of candidates) if (existsSync(join(dir, exe("pg_ctl")))) return dir;
  console.error(
    `Could not find Postgres binaries for ${process.platform}-${process.arch}.\n` +
    `Run \`npm install\` first. If your platform is unsupported, set DATABASE_URL\n` +
    `to any Postgres instance instead and skip this script.`,
  );
  process.exit(1);
}

const BIN = binDir();

function run(name, args, opts = {}) {
  const result = spawnSync(join(BIN, exe(name)), args, { encoding: "utf8", ...opts });
  if (result.error) throw result.error;
  return result;
}

function isRunning() {
  return run("pg_ctl", ["-D", DATA_DIR, "status"]).status === 0;
}

function initialise() {
  console.log("Initialising a new local database in .pgdata …");
  mkdirSync(DATA_DIR, { recursive: true });
  const pwFile = resolve(DATA_DIR, "..", ".pgpass.tmp");
  writeFileSync(pwFile, PASSWORD);
  const result = run("initdb", [
    "-D", DATA_DIR, "-U", USER, "--auth=scram-sha-256", `--pwfile=${pwFile}`, "-E", "UTF8",
  ]);
  rmSync(pwFile, { force: true });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
}

async function ensureDatabase() {
  const { default: postgres } = await import("postgres");
  const admin = postgres(`postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/postgres`, { max: 1 });
  try {
    const rows = await admin`SELECT 1 FROM pg_database WHERE datname = ${DB}`;
    if (rows.length === 0) {
      await admin.unsafe(`CREATE DATABASE ${DB}`);
      console.log(`Created database "${DB}".`);
    }
  } finally {
    await admin.end();
  }
}

function writeEnvIfMissing() {
  const envPath = resolve(ROOT, ".env");
  if (existsSync(envPath)) return;
  const example = readFileSync(resolve(ROOT, ".env.example"), "utf8");
  const secret = randomBytes(32).toString("hex");
  writeFileSync(envPath, example.replace(/SESSION_SECRET="[^"]*"/, `SESSION_SECRET="${secret}"`));
  console.log("Wrote .env with a freshly generated SESSION_SECRET.");
}

const cmd = process.argv[2] ?? "start";

if (cmd === "start") {
  if (!existsSync(join(DATA_DIR, "PG_VERSION"))) initialise();

  if (isRunning()) {
    console.log(`Postgres is already running on port ${PORT}.`);
  } else {
    // Keep the unix socket inside .pgdata so a stale lock in /tmp can never
    // block a restart, and so two checkouts do not collide.
    const options = [
      `-p ${PORT}`,
      "-c listen_addresses=127.0.0.1",
      ...(isWindows ? [] : [`-c unix_socket_directories=${DATA_DIR}`]),
    ].join(" ");
    const result = run("pg_ctl", ["-D", DATA_DIR, "-l", LOG_FILE, "-w", "-o", options, "start"]);
    if (result.status !== 0) {
      console.error(result.stderr || result.stdout);
      console.error(`\nServer log: ${LOG_FILE}`);
      process.exit(1);
    }
    console.log("Postgres started.");
  }

  await ensureDatabase();
  writeEnvIfMissing();
  console.log(`\n  DATABASE_URL="postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}"\n`);
  console.log("Next:  npm run db:migrate  &&  npm run db:seed");
  process.exit(0);
}

if (cmd === "stop") {
  if (!isRunning()) { console.log("Not running."); process.exit(0); }
  run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "-w", "stop"], { stdio: "inherit" });
  process.exit(0);
}

if (cmd === "status") {
  console.log(isRunning() ? `running on port ${PORT}` : "stopped");
  process.exit(0);
}

if (cmd === "reset") {
  if (isRunning()) run("pg_ctl", ["-D", DATA_DIR, "-m", "immediate", "-w", "stop"]);
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log("Removed .pgdata. Run `npm run db:start` to recreate it.");
  process.exit(0);
}

console.error("Usage: node scripts/pg.mjs start|stop|status|reset");
process.exit(1);
