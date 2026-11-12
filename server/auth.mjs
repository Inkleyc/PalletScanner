import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";

const getConfiguredAuthMode = () =>
  process.env.PALLETSCANNER_AUTH_MODE ??
  (process.env.EBAY_ENVIRONMENT === "production" ? "jwt" : "local");

const decodeBase64Url = (value) =>
  Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const authenticationError = (message = "Invalid authentication token.") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

const parseTokenPart = (value) => {
  try {
    return JSON.parse(decodeBase64Url(value).toString("utf8"));
  } catch {
    throw authenticationError();
  }
};

const validateClaims = (payload) => {
  if (!payload.sub) {
    throw authenticationError();
  }
  const expiresAt = Number(payload.exp);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    throw authenticationError();
  }
  if (expiresAt * 1000 <= Date.now()) {
    throw authenticationError("Authentication token has expired.");
  }

  return {
    userId: String(payload.sub),
    claims: payload,
  };
};

const verifyHs256Jwt = (token) => {
  const secret = process.env.PALLETSCANNER_JWT_SECRET;
  if (!secret) {
    throw new Error("PALLETSCANNER_JWT_SECRET is required in JWT auth mode.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw authenticationError();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseTokenPart(encodedHeader);
  if (header.alg !== "HS256") {
    throw authenticationError();
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest();
  const actualSignature = decodeBase64Url(encodedSignature);
  if (
    expectedSignature.length !== actualSignature.length ||
    !timingSafeEqual(expectedSignature, actualSignature)
  ) {
    throw authenticationError();
  }

  return validateClaims(parseTokenPart(encodedPayload));
};

// Supabase projects with asymmetric signing keys publish them as a JWKS;
// session tokens are then ES256, which the legacy HS256 check above can
// never accept (PF-SCOPE-021). Keys are cached and refreshed when a token
// names a key id the cache does not hold (signing-key rotation).
const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
let jwksCache = null;

const getSupabaseUrl = () =>
  (process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");

const fetchJwksKeys = async () => {
  const supabaseUrl = getSupabaseUrl();
  if (!supabaseUrl) {
    throw new Error(
      "SUPABASE_URL is required in JWT auth mode to verify ES256 tokens.",
    );
  }
  const response = await fetch(
    `${supabaseUrl}/auth/v1/.well-known/jwks.json`,
  );
  if (!response.ok) {
    throw new Error(
      `Could not load the Supabase JWKS (HTTP ${response.status}).`,
    );
  }
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys ?? []) {
    if (jwk?.kid && jwk.kty === "EC" && jwk.crv === "P-256") {
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
      } catch {
        // Skip a key that cannot be constructed; verification fails closed.
      }
    }
  }
  jwksCache = { fetchedAt: Date.now(), keys };
  return jwksCache;
};

const getJwksKey = async (kid) => {
  const cacheFresh =
    jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_TTL_MS;
  if (cacheFresh && jwksCache.keys.has(kid)) {
    return jwksCache.keys.get(kid);
  }
  try {
    const cache = await fetchJwksKeys();
    return cache.keys.get(kid) ?? null;
  } catch (error) {
    // A cached key still verifies cryptographically, so a transient JWKS
    // outage does not lock out sessions whose key we already hold. With no
    // cached key the failure propagates: verification fails closed.
    if (jwksCache?.keys.has(kid)) {
      return jwksCache.keys.get(kid);
    }
    throw error;
  }
};

const verifyEs256Jwt = async (token) => {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw authenticationError();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = parseTokenPart(encodedHeader);
  if (header.alg !== "ES256" || !header.kid) {
    throw authenticationError();
  }

  const key = await getJwksKey(String(header.kid));
  if (!key) {
    throw authenticationError();
  }

  const signature = decodeBase64Url(encodedSignature);
  const valid = verify(
    "sha256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    { key, dsaEncoding: "ieee-p1363" },
    signature,
  );
  if (!valid) {
    throw authenticationError();
  }

  return validateClaims(parseTokenPart(encodedPayload));
};

export const getAuthMode = () => getConfiguredAuthMode();

export const authenticateRequest = async (req) => {
  const authMode = getConfiguredAuthMode();
  if (authMode === "local") {
    return { userId: "local", claims: {} };
  }

  const authorization = req.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw authenticationError("Authentication required.");
  }
  const token = authorization.slice("Bearer ".length).trim();

  if (authMode === "shared-key") {
    const expectedToken = process.env.PALLETSCANNER_API_KEY;
    if (!expectedToken) {
      throw new Error("PALLETSCANNER_API_KEY is required in shared-key mode.");
    }
    const expected = Buffer.from(expectedToken);
    const actual = Buffer.from(token);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw authenticationError();
    }
    return { userId: "sandbox", claims: {} };
  }

  // jwt mode: Supabase now issues ES256 tokens verified against its JWKS;
  // HS256 tokens keep verifying against the legacy shared secret when set.
  const header = parseTokenPart(token.split(".")[0] ?? "");
  if (header.alg === "ES256") {
    return verifyEs256Jwt(token);
  }
  return verifyHs256Jwt(token);
};
