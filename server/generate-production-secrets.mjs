#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const makeSecret = () => randomBytes(48).toString("base64url");

console.log("EBAY_TOKEN_ENCRYPTION_KEY=" + makeSecret());
console.log("");
console.log(
  "# Supabase production note: set PALLETSCANNER_JWT_SECRET to the Supabase project JWT secret, not a generated value from this script.",
);
console.log(
  "# Optional smoke-test-only secret if you are not using Supabase yet:",
);
console.log("PALLETSCANNER_JWT_SECRET=" + makeSecret());
