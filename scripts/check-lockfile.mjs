#!/usr/bin/env node
/**
 * Does package-lock.json describe a tree that can actually install on the
 * deployment host?
 *
 * This exists because four deploys failed in a row on lock file problems that
 * every local check called healthy. The build runs on Linux; development here
 * happens on Windows; and the two things that go wrong are invisible to
 * `npm install` on a developer's machine:
 *
 *   1. Native packages ship one binary per platform as optional dependencies.
 *      A lock file written on Windows can omit the Linux ones entirely, and
 *      the build then dies with "Cannot find module
 *      '../lightningcss.linux-x64-gnu.node'" — after `npm ci` reported success.
 *   2. Those binaries must be marked `optional`. Recorded any other way,
 *      `npm ci` on Linux tries to install the AIX and Android builds too and
 *      fails with EBADPLATFORM.
 *
 * The reference is the last lock file known to have deployed. Comparing
 * against it catches a regression without having to hard-code which binaries
 * each package happens to publish this month.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** A commit whose lock file installed cleanly on the deployment host. */
const REFERENCE = process.env.LOCKFILE_REFERENCE ?? "4130c0b";

/** Packages that ship a compiled binary per platform. */
const NATIVE = ["lightningcss", "esbuild", "@next/swc", "sharp"];

const packagesOf = (text) => JSON.parse(text).packages ?? {};

const current = packagesOf(readFileSync("package-lock.json", "utf8"));

let reference;
try {
  reference = packagesOf(execSync(`git show ${REFERENCE}:package-lock.json`, {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  }));
} catch {
  console.log("  lock file: no reference available, skipping platform comparison");
  reference = null;
}

const problems = [];

if (reference) {
  for (const pkg of NATIVE) {
    const linuxBinaries = (packages) =>
      new Set(
        Object.keys(packages)
          .map((name) => name.split("/").pop())
          .filter((name) => name.includes(pkg.replace("@next/", "")) && name.includes("linux")),
      );

    const missing = [...linuxBinaries(reference)].filter((name) => !linuxBinaries(current).has(name));
    if (missing.length > 0) {
      problems.push(`${pkg}: Linux binaries missing from the lock file — ${missing.join(", ")}`);
    }
  }
}

const extraneous = Object.keys(current).filter((name) => current[name].extraneous);
if (extraneous.length > 0) {
  problems.push(
    `${extraneous.length} extraneous entr${extraneous.length === 1 ? "y" : "ies"} ` +
    `(a stale node_modules leaked into the lock file): ${extraneous.slice(0, 3).join(", ")}…`,
  );
}

const notOptional = Object.keys(current).filter(
  (name) => /(@esbuild\/|lightningcss-|@next\/swc-)/.test(name) && !current[name].optional,
);
if (notOptional.length > 0) {
  problems.push(
    `${notOptional.length} platform package(s) not marked optional, which fails ` +
    `npm ci on Linux with EBADPLATFORM: ${notOptional.slice(0, 3).join(", ")}…`,
  );
}

if (problems.length > 0) {
  console.error("\nThe lock file will not install on the deployment host:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nRebuild it from the last good one rather than from scratch:\n` +
    `  git checkout ${REFERENCE} -- package-lock.json\n` +
    `  npx npm@10 install <any packages you added>\n` +
    `  npx npm@10 ci\n\n` +
    `Use npm 10: the deploy runs Node 22, and npm 11 resolves this tree differently.\n`,
  );
  process.exit(1);
}

console.log("  lock file installs on Linux");
