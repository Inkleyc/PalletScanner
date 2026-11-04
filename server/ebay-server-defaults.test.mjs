import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "ebay-server.mjs",
);

// Spawn the real server entry point in a child process with a controlled
// environment. No .env files exist in the repo, and loadEnvFile only reads
// the repo root / server .env files, so the child environment below is the
// whole configuration under test. Nothing here calls eBay.
const runServer = async (env, { waitFor, timeoutMs = 10_000 } = {}) => {
  const child = spawn(process.execPath, [scriptPath], {
    env: { PATH: process.env.PATH, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const exit = new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

  try {
    if (waitFor) {
      await new Promise((resolve, reject) => {
        const deadline = setTimeout(
          () => reject(new Error(`timed out waiting for: ${waitFor}`)),
          timeoutMs,
        );
        const onData = () => {
          if (output.includes(waitFor)) {
            clearTimeout(deadline);
            child.stdout.off("data", onData);
            child.stderr.off("data", onData);
            resolve();
          }
        };
        child.stdout.on("data", onData);
        child.stderr.on("data", onData);
      });
      child.kill("SIGTERM");
    }
    const result = await exit;
    return { ...result, output };
  } finally {
    clearTimeout(timer);
    if (!child.killed && child.exitCode === null) {
      child.kill("SIGKILL");
      await exit;
    }
  }
};

test("server refuses to start when EBAY_ENVIRONMENT is unset", async () => {
  const { code, output } = await runServer({});
  assert.notEqual(code, 0);
  assert.match(
    output,
    /EBAY_ENVIRONMENT must be set explicitly to "sandbox" or "production"/,
  );
});

test("server refuses to start with an invalid EBAY_ENVIRONMENT", async () => {
  const { code, output } = await runServer({ EBAY_ENVIRONMENT: "staging" });
  assert.notEqual(code, 0);
  assert.match(
    output,
    /EBAY_ENVIRONMENT must be either "sandbox" or "production"/,
  );
});

test("server starts in sandbox mode with an explicit sandbox environment", async () => {
  const { output } = await runServer(
    { EBAY_ENVIRONMENT: "sandbox", EBAY_SERVER_PORT: "0" },
    { waitFor: "started in sandbox mode" },
  );
  assert.match(output, /started in sandbox mode/);
});

test("server fails loudly in production without required configuration", async () => {
  const { code, output } = await runServer({
    EBAY_ENVIRONMENT: "production",
    EBAY_SERVER_PORT: "0",
  });
  assert.notEqual(code, 0);
  assert.match(output, /Missing required environment variable/);
});

test("server refuses production with an unset or wildcard origin", async () => {
  const base = {
    EBAY_ENVIRONMENT: "production",
    EBAY_SERVER_PORT: "0",
    PALLETSCANNER_JWT_SECRET: "test-jwt-secret",
    EBAY_TOKEN_ENCRYPTION_KEY: "test-encryption-key",
  };
  const unset = await runServer(base);
  assert.notEqual(unset.code, 0);
  assert.match(
    unset.output,
    /Production requires a specific PALLETSCANNER_ALLOWED_ORIGIN/,
  );

  const wildcard = await runServer({
    ...base,
    PALLETSCANNER_ALLOWED_ORIGIN: "*",
  });
  assert.notEqual(wildcard.code, 0);
  assert.match(
    wildcard.output,
    /Production requires a specific PALLETSCANNER_ALLOWED_ORIGIN/,
  );
});
