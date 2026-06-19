#!/usr/bin/env node

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

const readEnv = (key) => process.env[key]?.trim() ?? "";
const failures = [];
const warnings = [];

loadDotEnv();

const supabaseUrl = readEnv("EXPO_PUBLIC_SUPABASE_URL");
const anonKey = readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY");

if (!supabaseUrl) {
  failures.push("EXPO_PUBLIC_SUPABASE_URL is required.");
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) {
  warnings.push(
    "EXPO_PUBLIC_SUPABASE_URL should look like https://YOUR_PROJECT.supabase.co.",
  );
}

if (!anonKey) {
  failures.push("EXPO_PUBLIC_SUPABASE_ANON_KEY is required.");
} else if (anonKey.split(".").length !== 3) {
  warnings.push(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY usually looks like a JWT with three dot-separated parts.",
  );
}

console.log("PalletScanner Supabase app environment check");
console.log("");

if (failures.length === 0) {
  console.log("Required Supabase app env: PASS");
} else {
  console.log("Required Supabase app env: FAIL");
  for (const failure of failures) {
    console.log(`- ${failure}`);
  }
}

if (warnings.length > 0) {
  console.log("");
  console.log("Warnings");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

process.exitCode = failures.length === 0 ? 0 : 1;
