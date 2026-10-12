import {
  createHmac,
  timingSafeEqual,
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

  const payload = parseTokenPart(encodedPayload);
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

export const getAuthMode = () => getConfiguredAuthMode();

export const authenticateRequest = (req) => {
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

  return verifyHs256Jwt(token);
};
