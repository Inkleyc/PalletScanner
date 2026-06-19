#!/usr/bin/env node

import { randomBytes } from "node:crypto";

const makeSecret = () => randomBytes(48).toString("base64url");

console.log("PALLETSCANNER_JWT_SECRET=" + makeSecret());
console.log("EBAY_TOKEN_ENCRYPTION_KEY=" + makeSecret());
