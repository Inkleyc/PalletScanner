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

loadDotEnv();

const requiredProductionValues = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RUNAME",
  "EBAY_MERCHANT_LOCATION_KEY",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
  "EBAY_FULFILLMENT_POLICY_ID",
  "PALLETSCANNER_JWT_SECRET",
  "EBAY_TOKEN_ENCRYPTION_KEY",
  "PALLETSCANNER_ALLOWED_ORIGIN",
];

const failures = [];
const warnings = [];

const readEnv = (key) => process.env[key]?.trim() ?? "";
const hasValue = (key) => readEnv(key).length > 0;

if (readEnv("EBAY_ENVIRONMENT") !== "production") {
  failures.push("EBAY_ENVIRONMENT must be production.");
}

for (const key of requiredProductionValues) {
  if (!hasValue(key)) {
    failures.push(`${key} is required.`);
  }
}

if (readEnv("PALLETSCANNER_AUTH_MODE") !== "jwt") {
  failures.push("PALLETSCANNER_AUTH_MODE must be jwt.");
}

if (readEnv("PALLETSCANNER_ALLOWED_ORIGIN") === "*") {
  failures.push("PALLETSCANNER_ALLOWED_ORIGIN must be a specific app origin.");
}

if (readEnv("EBAY_CLIENT_ID").includes("-SBX-")) {
  failures.push("EBAY_CLIENT_ID looks like a sandbox key.");
}

if (readEnv("EBAY_CLIENT_SECRET").startsWith("SBX-")) {
  failures.push("EBAY_CLIENT_SECRET looks like a sandbox secret.");
}

if (hasValue("EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN")) {
  warnings.push(
    "EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN is for temporary shared-key testing, not production.",
  );
}

if (!hasValue("EBAY_CATEGORY_ID")) {
  warnings.push(
    "EBAY_CATEGORY_ID is blank. Production will use dynamic category suggestions.",
  );
}

if (!hasValue("PALLETSCANNER_IDENTITY_PROVIDER")) {
  warnings.push(
    "Set PALLETSCANNER_IDENTITY_PROVIDER=supabase in production deployment notes/env.",
  );
} else if (readEnv("PALLETSCANNER_IDENTITY_PROVIDER") !== "supabase") {
  warnings.push(
    "PALLETSCANNER_IDENTITY_PROVIDER is not supabase. Confirm the JWT issuer still uses HS256 with stable sub claims.",
  );
}

console.log("PalletScanner eBay production readiness check");
console.log("");

if (failures.length === 0) {
  console.log("Required production gates: PASS");
} else {
  console.log("Required production gates: FAIL");
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
