#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const envPath = path.resolve(process.cwd(), ".env.emulator.local");
const failures = [];

if (!fs.existsSync(envPath)) {
  failures.push(
    "Create apps/mobile/.env.emulator.local from .env.emulator.example.",
  );
} else {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (key && process.env[key] === undefined) {
      process.env[key] = parts.join("=").trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const read = (key) => process.env[key]?.trim() ?? "";
const supabaseUrl = read("EXPO_PUBLIC_SUPABASE_URL");
const supabaseKey = read("EXPO_PUBLIC_SUPABASE_ANON_KEY");
const backendUrl =
  read("EXPO_PUBLIC_AI_API_BASE_URL") ||
  read("EXPO_PUBLIC_EBAY_API_BASE_URL");

if (read("EXPO_PUBLIC_APP_ENVIRONMENT") !== "emulator") {
  failures.push("EXPO_PUBLIC_APP_ENVIRONMENT must be emulator.");
}
if (!supabaseUrl || !supabaseUrl.startsWith("https://")) {
  failures.push("A non-production HTTPS Supabase URL is required.");
} else if (/YOUR_|example\.com/i.test(supabaseUrl)) {
  failures.push("Replace the Supabase URL placeholder with a non-production project URL.");
}
if (!supabaseKey) {
  failures.push("A non-production Supabase publishable/anon key is required.");
} else if (/YOUR_|PLACEHOLDER/i.test(supabaseKey)) {
  failures.push("Replace the Supabase key placeholder with a non-production publishable key.");
}
if (!backendUrl || !backendUrl.startsWith("https://")) {
  failures.push("An HTTPS test backend URL is required.");
} else if (/YOUR_|example\.com/i.test(backendUrl)) {
  failures.push("Replace the backend URL placeholder with the HTTPS test backend URL.");
}
if (read("EXPO_PUBLIC_ANTHROPIC_API_KEY")) {
  failures.push("EXPO_PUBLIC_ANTHROPIC_API_KEY must not be present.");
}
if (read("EXPO_PUBLIC_ENABLE_TEST_MODE") === "true") {
  failures.push("Cloud emulator testing must not enable local Test Mode.");
}
if (read("EXPO_PUBLIC_ENABLE_DEMO_INVENTORY") === "true") {
  failures.push("Cloud emulator testing must not enable demo inventory.");
}

console.log("PalletFlip Android emulator environment check");
if (failures.length === 0) {
  console.log("Emulator environment: PASS");
  console.log("Confirm the configured Supabase project and backend are non-production before building.");
} else {
  console.log("Emulator environment: FAIL");
  failures.forEach((failure) => console.log(`- ${failure}`));
  process.exitCode = 1;
}
