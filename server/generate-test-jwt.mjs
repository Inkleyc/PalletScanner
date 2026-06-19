#!/usr/bin/env node

import { createHmac } from "node:crypto";
import fs from "node:fs";

const loadDotEnv = (path = ".env") => {
  if (!fs.existsSync(path)) {
    return;
  }

  const raw = fs.readFileSync(path, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = valueParts
      .join("=")
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
};

const encodeBase64Url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const sign = (input, secret) =>
  createHmac("sha256", secret).update(input).digest("base64url");

loadDotEnv();

const secret = process.env.PALLETSCANNER_JWT_SECRET;
if (!secret) {
  console.error("PALLETSCANNER_JWT_SECRET is required.");
  process.exit(1);
}

const subject = process.argv[2] ?? "production-test-user";
const expiresInHours = Number(process.argv[3] ?? 24);
const nowSeconds = Math.floor(Date.now() / 1000);
const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
const payload = encodeBase64Url({
  sub: subject,
  iat: nowSeconds,
  exp: nowSeconds + Math.max(expiresInHours, 1) * 60 * 60,
});
const input = `${header}.${payload}`;

console.log(`${input}.${sign(input, secret)}`);
