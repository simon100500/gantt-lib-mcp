#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }

    let value = rawValue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function run(command, args, options = {}) {
  const pretty = [command, ...args].join(" ");
  console.log(`\n> ${pretty}`);

  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  if (result.error) {
    fail(`failed to run "${pretty}": ${result.error.message}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const exact = process.argv.find((arg) => arg.startsWith(prefix));
  if (exact) {
    return exact.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    fail(`missing required environment variable ${name}`);
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  npm run deploy:caprover -- [options]
  npm run deploy:caprover:site -- [options]

Required env:
  CAPROVER_SERVER            e.g. https://captain.example.com
  CAPROVER_IMAGE_REPO        e.g. ghcr.io/acme/gantt-lib-mcp
  CAPROVER_APP_NAME          main app name in CapRover
  CAPROVER_APP_TOKEN         app token for the main app

Optional env for site target:
  CAPROVER_SITE_APP_NAME     site app name in CapRover
  CAPROVER_SITE_APP_TOKEN    app token for the site app
  DOCKER_BUILD_PLATFORM      e.g. linux/amd64

Options:
  --target app|site
  --app <name>
  --tag <tag>
  --dockerfile <path>
  --context <dir>
  --platform <platform>
  --latest
  --no-push
  --no-deploy
`);
}

function getGitSha() {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    fail("unable to read git commit SHA");
  }

  return result.stdout.trim();
}

const repoRoot = process.cwd();
loadDotEnvFile(path.join(repoRoot, ".env"));
loadDotEnvFile(path.join(repoRoot, ".env.local"));

if (hasFlag("help")) {
  printHelp();
  process.exit(0);
}

const target = getArg("target", "app");
const appName =
  getArg("app", undefined) ??
  (target === "site"
    ? process.env.CAPROVER_SITE_APP_NAME ?? process.env.CAPROVER_APP_NAME
    : process.env.CAPROVER_APP_NAME);

if (!appName) {
  fail(
    "missing app name. Use --app or set CAPROVER_APP_NAME / CAPROVER_SITE_APP_NAME.",
  );
}

const caproverUrl = process.env.CAPROVER_SERVER ?? process.env.CAPROVER_URL;
if (!caproverUrl) {
  fail("missing required environment variable CAPROVER_SERVER");
}

const appToken =
  (target === "site"
    ? process.env.CAPROVER_SITE_APP_TOKEN ?? process.env.CAPROVER_APP_TOKEN
    : process.env.CAPROVER_APP_TOKEN);
if (!appToken) {
  fail(
    "missing app token. Use CAPROVER_APP_TOKEN or CAPROVER_SITE_APP_TOKEN for --target site.",
  );
}

const imageRepo = getRequiredEnv("CAPROVER_IMAGE_REPO");
if (/^https?:\/\//i.test(imageRepo) || imageRepo.endsWith(".git")) {
  fail(
    "CAPROVER_IMAGE_REPO must be a Docker image repository, for example ghcr.io/acme/gantt-lib-mcp, not a Git URL.",
  );
}
const dockerfile =
  getArg("dockerfile", undefined) ??
  (target === "site" ? "Dockerfile.site" : "Dockerfile");
const contextDir = getArg("context", ".");
const platform = getArg("platform", process.env.DOCKER_BUILD_PLATFORM);
const pushLatest = hasFlag("latest");
const skipPush = hasFlag("no-push");
const skipDeploy = hasFlag("no-deploy");

if (!existsSync(dockerfile)) {
  fail(`dockerfile not found: ${dockerfile}`);
}

const sha = getGitSha();
const timestamp = new Date()
  .toISOString()
  .replace(/[-:]/g, "")
  .replace(/\.\d{3}Z$/, "Z");
const imageTag = getArg("tag", `${sha}-${timestamp}`);
const imageName = `${imageRepo}:${imageTag}`;

const buildArgs = ["build", "-f", dockerfile, "-t", imageName];
if (platform) {
  buildArgs.push("--platform", platform);
}
buildArgs.push(contextDir);

console.log(`Target app: ${appName}`);
console.log(`CapRover: ${caproverUrl}`);
console.log(`Image: ${imageName}`);
console.log(`Dockerfile: ${dockerfile}`);

run("docker", buildArgs);

if (!skipPush) {
  run("docker", ["push", imageName]);

  if (pushLatest) {
    const latestName = `${imageRepo}:latest`;
    run("docker", ["tag", imageName, latestName]);
    run("docker", ["push", latestName]);
  }
}

if (!skipDeploy) {
  run("npx", [
    "caprover",
    "deploy",
    "--caproverUrl",
    caproverUrl,
    "--appToken",
    appToken,
    "--appName",
    appName,
    "--imageName",
    imageName,
  ]);
}

console.log("\nDone.");
