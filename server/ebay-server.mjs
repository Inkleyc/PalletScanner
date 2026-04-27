import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDirectory = path.join(projectRoot, "server-data");
const tokenFile = path.join(dataDirectory, "ebay-user-token.json");

const loadEnvFile = async (filename) => {
  try {
    const contents = await readFile(filename, "utf8");
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing local env files are fine.
  }
};

await loadEnvFile(path.join(projectRoot, ".env"));
await loadEnvFile(path.join(__dirname, ".env"));

const EBAY_ENVIRONMENT = process.env.EBAY_ENVIRONMENT ?? "production";
const isSandbox = EBAY_ENVIRONMENT === "sandbox";
const authBaseUrl = isSandbox
  ? "https://auth.sandbox.ebay.com"
  : "https://auth.ebay.com";
const apiBaseUrl = isSandbox
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";
const serverPort = Number(process.env.EBAY_SERVER_PORT ?? 8787);
const marketplaceId = process.env.EBAY_MARKETPLACE_ID ?? "EBAY_US";
const currency = process.env.EBAY_CURRENCY ?? "USD";
const locale = process.env.EBAY_LOCALE ?? "en-US";
const fallbackCategoryId = process.env.EBAY_CATEGORY_ID ?? "";

const ebayScopes =
  process.env.EBAY_SCOPE ??
  [
    "https://api.ebay.com/oauth/api_scope/sell.inventory",
    "https://api.ebay.com/oauth/api_scope/sell.account",
  ].join(" ");

let latestOAuthState = "";
let appTokenCache = null;

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const readRequestBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(payload));
};

const sendHtml = (res, statusCode, html) => {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(html);
};

const loadStoredTokens = async () => {
  try {
    const raw = await readFile(tokenFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveStoredTokens = async (tokenPayload) => {
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(tokenFile, JSON.stringify(tokenPayload, null, 2), "utf8");
};

const buildBasicAuthorization = () => {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const clientSecret = requireEnv("EBAY_CLIENT_SECRET");
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
};

const getAuthorizationUrl = () => {
  const clientId = requireEnv("EBAY_CLIENT_ID");
  const ruName = requireEnv("EBAY_RUNAME");
  latestOAuthState = Math.random().toString(36).slice(2);

  const url = new URL(`${authBaseUrl}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", ebayScopes);
  url.searchParams.set("state", latestOAuthState);
  url.searchParams.set("prompt", "login");
  url.searchParams.set("locale", locale);
  return url.toString();
};

const requestToken = async (params) => {
  const response = await fetch(`${apiBaseUrl}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${buildBasicAuthorization()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `OAuth request failed with status ${response.status}`);
  }

  return response.json();
};

const exchangeAuthorizationCode = async (code) => {
  const tokenResponse = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: requireEnv("EBAY_RUNAME"),
  });

  const stored = {
    ...tokenResponse,
    expiresAt: Date.now() + Number(tokenResponse.expires_in ?? 7200) * 1000,
    refreshedAt: Date.now(),
  };
  await saveStoredTokens(stored);
  return stored;
};

const getUserAccessToken = async () => {
  const stored = await loadStoredTokens();
  if (!stored?.refresh_token) {
    throw new Error("No eBay user token found. Connect your eBay account first.");
  }

  if (stored.expiresAt && stored.expiresAt > Date.now() + 60_000) {
    return stored.access_token;
  }

  const refreshed = await requestToken({
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
    scope: ebayScopes,
  });

  const updated = {
    ...stored,
    ...refreshed,
    refresh_token: refreshed.refresh_token ?? stored.refresh_token,
    expiresAt: Date.now() + Number(refreshed.expires_in ?? 7200) * 1000,
    refreshedAt: Date.now(),
  };
  await saveStoredTokens(updated);
  return updated.access_token;
};

const getAppAccessToken = async () => {
  if (appTokenCache?.expiresAt > Date.now() + 60_000) {
    return appTokenCache.accessToken;
  }

  const tokenResponse = await requestToken({
    grant_type: "client_credentials",
    scope: "https://api.ebay.com/oauth/api_scope",
  });

  appTokenCache = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + Number(tokenResponse.expires_in ?? 7200) * 1000,
  };
  return appTokenCache.accessToken;
};

const ebayFetch = async (pathname, options) => {
  const response = await fetch(`${apiBaseUrl}${pathname}`, options);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `eBay request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
};

const getCategoryId = async (title) => {
  if (fallbackCategoryId) {
    return fallbackCategoryId;
  }

  if (isSandbox) {
    throw new Error(
      "Set EBAY_CATEGORY_ID when using sandbox because category suggestions are not supported there.",
    );
  }

  const appToken = await getAppAccessToken();
  const tree = await ebayFetch(
    `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${encodeURIComponent(
      marketplaceId,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    },
  );

  const suggestions = await ebayFetch(
    `/commerce/taxonomy/v1/category_tree/${encodeURIComponent(
      tree.categoryTreeId,
    )}/get_category_suggestions?q=${encodeURIComponent(title)}`,
    {
      headers: {
        Authorization: `Bearer ${appToken}`,
      },
    },
  );

  const categoryId = suggestions?.categorySuggestions?.[0]?.category?.categoryId;
  if (!categoryId) {
    throw new Error(
      "No eBay category suggestion was found. Set EBAY_CATEGORY_ID to override.",
    );
  }

  return categoryId;
};

const mapCondition = (condition) => {
  switch ((condition ?? "").toLowerCase()) {
    case "new":
      return "NEW";
    case "like new":
      return "LIKE_NEW";
    case "good":
      return "USED_GOOD";
    case "fair":
      return "USED_ACCEPTABLE";
    default:
      return "USED_GOOD";
  }
};

const createListing = async (payload) => {
  const accessToken = await getUserAccessToken();
  const sku = `pallet-${Date.now()}`;
  const categoryId = await getCategoryId(payload.title);

  await ebayFetch(`/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": locale,
    },
    body: JSON.stringify({
      availability: {
        shipToLocationAvailability: {
          quantity: payload.quantity ?? 1,
        },
      },
      condition: mapCondition(payload.condition),
      product: {
        title: payload.title,
        description: payload.description,
        imageUrls: payload.photoUrl ? [payload.photoUrl] : undefined,
      },
    }),
  });

  const offer = await ebayFetch(`/sell/inventory/v1/offer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Language": locale,
    },
    body: JSON.stringify({
      sku,
      marketplaceId,
      format: "FIXED_PRICE",
      availableQuantity: payload.quantity ?? 1,
      categoryId,
      merchantLocationKey: requireEnv("EBAY_MERCHANT_LOCATION_KEY"),
      listingDescription: payload.description,
      pricingSummary: {
        price: {
          currency,
          value: String(payload.price),
        },
      },
      listingPolicies: {
        paymentPolicyId: requireEnv("EBAY_PAYMENT_POLICY_ID"),
        returnPolicyId: requireEnv("EBAY_RETURN_POLICY_ID"),
        fulfillmentPolicyId: requireEnv("EBAY_FULFILLMENT_POLICY_ID"),
        bestOfferTerms: {
          bestOfferEnabled: true,
          autoDeclinePrice: {
            currency,
            value: String(payload.floorPrice),
          },
        },
      },
    }),
  });

  const published = await ebayFetch(
    `/sell/inventory/v1/offer/${encodeURIComponent(offer.offerId)}/publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  const listingId = published?.listingId ?? published?.listingIdStr ?? null;
  const itemBaseUrl = isSandbox
    ? "https://www.sandbox.ebay.com/itm"
    : "https://www.ebay.com/itm";

  return {
    sku,
    offerId: offer.offerId,
    listingId,
    listingUrl: listingId ? `${itemBaseUrl}/${listingId}` : undefined,
  };
};

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 400, { error: "Missing request URL." });
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/status") {
      const stored = await loadStoredTokens();
      sendJson(res, 200, {
        configured: Boolean(
          process.env.EBAY_CLIENT_ID &&
            process.env.EBAY_CLIENT_SECRET &&
            process.env.EBAY_RUNAME,
        ),
        connected: Boolean(stored?.refresh_token),
        environment: EBAY_ENVIRONMENT,
        marketplaceId,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/connect-url") {
      sendJson(res, 200, {
        authorizationUrl: getAuthorizationUrl(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/connect") {
      res.writeHead(302, { Location: getAuthorizationUrl() });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/ebay/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        sendHtml(
          res,
          400,
          `<h1>eBay connection failed</h1><p>${error}</p>`,
        );
        return;
      }

      if (!code) {
        sendHtml(
          res,
          400,
          "<h1>Missing code</h1><p>eBay did not return an authorization code.</p>",
        );
        return;
      }

      if (latestOAuthState && state && latestOAuthState !== state) {
        sendHtml(
          res,
          400,
          "<h1>Invalid state</h1><p>The OAuth state token did not match.</p>",
        );
        return;
      }

      await exchangeAuthorizationCode(code);
      sendHtml(
        res,
        200,
        "<h1>eBay connected</h1><p>You can close this page and return to the app.</p>",
      );
      return;
    }

    if (req.method === "POST" && url.pathname === "/ebay/listings") {
      const rawBody = await readRequestBody(req);
      const payload = JSON.parse(rawBody);
      const result = await createListing(payload);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
});

server.listen(serverPort, () => {
  console.log(`eBay server listening on http://localhost:${serverPort}`);
});
