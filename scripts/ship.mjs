#!/usr/bin/env node
/**
 * One command to publish: check, commit, push.
 *
 *   npm run ship            -- uses a generated message
 *   npm run ship "message"  -- uses yours
 *
 * Refuses to push if the type checker or the tests fail, because a broken
 * commit on main is a broken deployment two minutes later — Render builds
 * every push to main automatically.
 */
import { execSync, spawnSync } from "node:child_process";

const run = (cmd, opts = {}) =>
  execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();

const step = (label, fn) => {
  process.stdout.write(`  ${label} … `);
  try {
    fn();
    console.log("ok");
  } catch (err) {
    console.log("FAILED\n");
    const output = (err.stdout ?? "") + (err.stderr ?? "");
    console.error(output.split("\n").slice(-25).join("\n"));
    console.error(`\nNothing was pushed. Fix the above, then run \`npm run ship\` again.`);
    process.exit(1);
  }
};

let changed;
try {
  changed = run("git status --porcelain");
} catch {
  console.error("This folder is not a git repository.");
  process.exit(1);
}

if (!changed) {
  console.log("Nothing to commit — your working folder matches the last commit.");
  const ahead = run("git rev-list --count @{u}..HEAD").trim();
  if (ahead !== "0") {
    console.log(`Pushing ${ahead} commit(s) that were not sent yet …`);
    spawnSync("git", ["push"], { stdio: "inherit" });
  }
  process.exit(0);
}

console.log("\nChecking before publishing:\n");
step("type check", () => run("npm run typecheck"));
step("tests", () => run("npm test"));

const message =
  process.argv.slice(2).join(" ") ||
  `Update ${new Date().toISOString().slice(0, 16).replace("T", " ")}`;

console.log("\nPublishing:\n");
step("stage", () => run("git add -A"));
step("commit", () => run(`git commit -m ${JSON.stringify(message)}`));

console.log("");
const push = spawnSync("git", ["push"], { stdio: "inherit" });
if (push.status !== 0) process.exit(push.status ?? 1);

console.log(`
Pushed. Render is building it now — about two minutes.
  https://dashboard.render.com/web/srv-da24ksbncjis738h3p00
  https://routegeorgia.ge
`);
