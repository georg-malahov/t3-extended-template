#!/usr/bin/env bun
/**
 * dev — Start the full Docker development environment.
 *
 * Starts a container with PostgreSQL, MinIO, and the Next.js dev server.
 * Downloads Doppler secrets if available on the host.
 * Waits for all services to be ready before returning.
 */
import { existsSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import { createServer } from "net";
import {
  getContainerName,
  getVolumeName,
  isContainerRunning,
  waitFor,
  IMAGE,
} from "./container";

const container = getContainerName();
const volume = getVolumeName();

// 1. Already running?
if (isContainerRunning()) {
  const portResult = Bun.spawnSync(
    ["docker", "port", container, "3000/tcp"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const port = portResult.stdout.toString().trim().split(":").pop();
  console.log(`Container ${container} is already running.`);
  console.log(`App URL: http://localhost:${port}`);
  process.exit(0);
}

// 2. Image exists?
const imageCheck = Bun.spawnSync(["docker", "image", "inspect", IMAGE], {
  stdout: "pipe",
  stderr: "pipe",
});
if (imageCheck.exitCode !== 0) {
  console.error(
    `Image ${IMAGE} not found. Run 'bun run image:build' first.`,
  );
  process.exit(1);
}

// 3. Resolve port
let port = process.env.PORT ?? "";
if (!port && existsSync(".env.local")) {
  const match = readFileSync(".env.local", "utf-8").match(/^APP_PORT=(\d+)/m);
  if (match) port = match[1];
}
if (!port) {
  port = await findFreePort();
  appendFileSync(".env.local", `APP_PORT=${port}\n`);
  console.log(`Auto-assigned APP_PORT=${port}`);
}

// 4. Doppler secrets (optional)
const envFileFlags: string[] = [];
const hasDoppler =
  Bun.spawnSync(["which", "doppler"], { stdout: "pipe", stderr: "pipe" })
    .exitCode === 0;
if (hasDoppler) {
  const doppler = Bun.spawnSync(
    ["doppler", "secrets", "download", "--format", "env-no-quotes", "--no-file"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (doppler.exitCode === 0) {
    writeFileSync(".env.docker", doppler.stdout.toString(), { mode: 0o600 });
    envFileFlags.push("--env-file", ".env.docker");
  }
}

// 5. Start container
console.log(`Starting container ${container} on port ${port}...`);
const runResult = Bun.spawnSync(
  [
    "docker", "run", "-d", "--init", "--name", container,
    "-v", `${process.cwd()}:/workspace`,
    "-v", `${volume}:/workspace/node_modules`,
    "-p", `${port}:3000`,
    ...envFileFlags,
    "-e", "DATABASE_URL=postgresql://postgres@localhost:5432/app",
    "-e", "AUTH_DATABASE_URL=postgresql://postgres@localhost:5432/app?options=-csearch_path%3Dauth",
    "-e", `APP_URL=http://localhost:${port}`,
    "-e", `BETTER_AUTH_URL=http://localhost:${port}/api/auth`,
    "-e", "PLAYWRIGHT_BASE_URL=http://localhost:3000",
    "-e", `AUTH_SECRET=tZWssbPUE8cxF7JwsLxKuiE8lBaWC/eFEB9AUKzEUzA=`,
    "-e", "NODE_ENV=development",
    "-e", "MINIO_ENDPOINT=http://localhost:9000",
    "-e", "MINIO_ACCESS_KEY=minioadmin",
    "-e", "MINIO_SECRET_KEY=minioadmin",
    "-e", "MINIO_BUCKET=app-storage",
    IMAGE, "sleep", "infinity",
  ],
  { stdout: "inherit", stderr: "inherit" },
);
if (runResult.exitCode !== 0) {
  console.error("Failed to start container");
  process.exit(1);
}

// 6. Wait for PostgreSQL
console.log("Waiting for services (init.sh runs via entrypoint)...");
const pgReady = await waitFor(
  () =>
    Bun.spawnSync(["docker", "exec", container, "pg_isready", "-q"], {
      stdout: "pipe",
      stderr: "pipe",
    }).exitCode === 0,
  60,
  1000,
);
if (!pgReady) {
  console.error("ERROR: PostgreSQL failed to start");
  Bun.spawnSync(["docker", "logs", container], {
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(1);
}

// 7. Wait for node_modules
const nmReady = await waitFor(
  () =>
    Bun.spawnSync(
      ["docker", "exec", container, "test", "-f", "/workspace/node_modules/.bun-installed"],
      { stdout: "pipe", stderr: "pipe" },
    ).exitCode === 0,
  30,
  1000,
);
if (!nmReady) {
  console.error("ERROR: node_modules not populated");
  process.exit(1);
}

// 8. Codegen + migrations
console.log("Running codegen and migrations...");
const codegenResult = Bun.spawnSync(
  ["docker", "exec", container, "bun", "run", "db:generate"],
  { stdout: "inherit", stderr: "inherit" },
);
if (codegenResult.exitCode !== 0) {
  console.warn("WARNING: db:generate failed (generated files may already be up-to-date)");
}

// Auth migrations (Better Auth)
const authResult = Bun.spawnSync(
  ["docker", "exec", container, "bun", "run", "auth:migrate"],
  { stdout: "inherit", stderr: "inherit" },
);
if (authResult.exitCode !== 0) {
  console.error("Failed: bun run auth:migrate");
  process.exit(1);
}

// Database migrations — try zen first, fall back to prisma
let migrateResult = Bun.spawnSync(
  ["docker", "exec", container, "bun", "run", "db:migrate"],
  { stdout: "inherit", stderr: "inherit" },
);
if (migrateResult.exitCode !== 0) {
  console.warn("zen migrate failed, falling back to prisma migrate deploy...");
  // Ensure minimal Prisma schema exists for migration deployment
  Bun.spawnSync(
    ["docker", "exec", container, "bash", "-c",
      `test -f zenstack/~schema.prisma || cat > zenstack/~schema.prisma << 'EOF'
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
generator client {
  provider = "prisma-client-js"
}
EOF`],
    { stdout: "pipe", stderr: "pipe" },
  );
  migrateResult = Bun.spawnSync(
    ["docker", "exec", container, "bunx", "prisma", "migrate", "deploy",
      "--schema", "zenstack/~schema.prisma"],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (migrateResult.exitCode !== 0) {
    console.warn("WARNING: Database migrations failed (may need manual intervention)");
  }
}

// 9. Start dev server (background)
console.log("Starting dev server...");
Bun.spawnSync(
  [
    "docker", "exec", "-d", container,
    "bun", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000",
  ],
  { stdout: "inherit", stderr: "inherit" },
);

// 10. Wait for app
const url = `http://localhost:${port}`;
console.log(`Waiting for app at ${url}...`);
const appReady = await waitFor(
  () =>
    Bun.spawnSync(["curl", "-sf", url], {
      stdout: "pipe",
      stderr: "pipe",
    }).exitCode === 0,
  60,
  2000,
);
if (!appReady) {
  console.error(`ERROR: App failed to start at ${url}`);
  Bun.spawnSync(["docker", "logs", container], {
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(1);
}

console.log(`App ready at ${url}`);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function findFreePort(): Promise<string> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(0, () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(String(port)));
    });
  });
}
