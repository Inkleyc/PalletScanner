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

// Settled defaults (PF-SCOPE-007; see also server/ebay.env.example and
// server/ebay.production.env.example). AI is deferred/off by default
// (charter; PF-D-011): an AI provider key is required by this check only
// when AI is explicitly enabled with PALLETSCANNER_AI_ENABLED=true.
// Without that flag, a missing ANTHROPIC_API_KEY must not fail the
// production readiness check, and no AI behaviour is enabled by this
// script. AI reactivation still requires a separately approved scope.

const requiredProductionValues = [
  "EBAY_CLIENT_ID",
  "EBAY_CLIENT_SECRET",
  "EBAY_RUNAME",
  "EBAY_MERCHANT_LOCATION_KEY",
  "EBAY_PAYMENT_POLICY_ID",
  "EBAY_RETURN_POLICY_ID",
  "EBAY_FULFILLMENT_POLICY_ID",
  "EBAY_TOKEN_ENCRYPTION_KEY",
  "PALLETSCANNER_ALLOWED_ORIGIN",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
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

const aiEnabled =
  readEnv("PALLETSCANNER_AI_ENABLED").toLowerCase() === "true";
if (aiEnabled && !hasValue("ANTHROPIC_API_KEY")) {
  failures.push(
    "ANTHROPIC_API_KEY is required when PALLETSCANNER_AI_ENABLED=true.",
  );
}

if (readEnv("PALLETSCANNER_AUTH_MODE") !== "jwt") {
  failures.push("PALLETSCANNER_AUTH_MODE must be jwt.");
}

// JWT verification needs at least one path (PF-SCOPE-021): the Supabase
// JWKS (via SUPABASE_URL, already required above) for current ES256
// session tokens, or the legacy shared secret for HS256 tokens. With
// neither, jwt mode silently rejects every request.
if (!hasValue("SUPABASE_URL") && !hasValue("PALLETSCANNER_JWT_SECRET")) {
  failures.push(
    "JWT verification requires SUPABASE_URL (JWKS) or PALLETSCANNER_JWT_SECRET (legacy HS256).",
  );
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
  failures.push(
    "EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN is retired; clients must use signed-in user sessions.",
  );
}

if (hasValue("EXPO_PUBLIC_ANTHROPIC_API_KEY")) {
  failures.push(
    "EXPO_PUBLIC_ANTHROPIC_API_KEY must be removed; AI credentials belong only in the backend ANTHROPIC_API_KEY setting.",
  );
}

if (!hasValue("EBAY_CATEGORY_ID")) {
  warnings.push(
    "EBAY_CATEGORY_ID is blank. Production will use dynamic category suggestions.",
  );
}

if (!hasValue("PALLETSCANNER_IDENTITY_PROVIDER")) {
  failures.push(
    "PALLETSCANNER_IDENTITY_PROVIDER must be supabase.",
  );
} else if (readEnv("PALLETSCANNER_IDENTITY_PROVIDER") !== "supabase") {
  failures.push(
    "PALLETSCANNER_IDENTITY_PROVIDER must be supabase for this production path.",
  );
}

console.log("PalletFlip eBay production readiness check");
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
