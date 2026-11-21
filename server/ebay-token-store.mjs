import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const sanitizeUserId = (userId) =>
  createHash("sha256").update(String(userId)).digest("hex");

const getEncryptionKey = () => {
  const secret = process.env.EBAY_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.EBAY_ENVIRONMENT === "production") {
      throw new Error(
        "EBAY_TOKEN_ENCRYPTION_KEY is required in production.",
      );
    }
    return null;
  }
  return createHash("sha256").update(secret).digest();
};

const encryptPayload = (payload) => {
  const key = getEncryptionKey();
  if (!key) {
    return { encrypted: false, payload };
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  return {
    encrypted: true,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
};

const decryptPayload = (stored) => {
  if (!stored?.encrypted) {
    return stored?.payload ?? stored ?? null;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error("Cannot decrypt eBay tokens without encryption key.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(stored.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(stored.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
};

export const createEbayTokenStore = ({
  dataDirectory,
  legacyTokenFile,
}) => {
  const connectionsDirectory = path.join(dataDirectory, "ebay-connections");

  const getTokenPath = (userId) =>
    path.join(connectionsDirectory, `${sanitizeUserId(userId)}.json`);

  const load = async (userId) => {
    try {
      const raw = await readFile(getTokenPath(userId), "utf8");
      return decryptPayload(JSON.parse(raw));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error("Stored eBay connection could not be read.", { cause: error });
      }
    }
    if (userId === "local") {
      try {
        const legacyRaw = await readFile(legacyTokenFile, "utf8");
        return JSON.parse(legacyRaw);
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw new Error("Legacy eBay connection could not be read.", { cause: error });
        }
      }
    }
    return null;
  };

  const save = async (userId, tokenPayload) => {
    await mkdir(connectionsDirectory, { recursive: true });
    await writeFile(
      getTokenPath(userId),
      JSON.stringify(encryptPayload(tokenPayload), null, 2),
      "utf8",
    );
  };

  const remove = async (userId) => {
    try {
      await unlink(getTokenPath(userId));
    } catch {
      // Disconnect is idempotent.
    }
    if (userId === "local") {
      try {
        await unlink(legacyTokenFile);
      } catch {
        // Legacy token may not exist.
      }
    }
  };

  return { load, save, remove };
};

// PF-SCOPE-024: durable store. The same AES-256-GCM envelope the file store
// produces, persisted in public.ebay_connections through PostgREST. Every
// request carries the publishable key as apikey and the acting user's
// verified Supabase session JWT as Authorization, so the table's
// owner-only RLS policies do the access control — the backend holds no
// credential that can bypass them. Error behaviour mirrors the file
// store's contract: a missing row returns null (not connected); a
// transport or PostgREST failure throws (a visible error, never a silent
// "disconnected").
export const createSupabaseEbayTokenStore = ({
  supabaseUrl,
  anonKey,
  fetchImpl = fetch,
}) => {
  const tableUrl = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/ebay_connections`;

  const requireAuthorization = (authorization) => {
    if (!authorization?.startsWith("Bearer ")) {
      throw new Error(
        "A signed-in Supabase session is required to use the database eBay token store.",
      );
    }
  };

  const request = (authorization, path, options = {}) =>
    fetchImpl(`${tableUrl}${path}`, {
      signal: AbortSignal.timeout(30_000),
      ...options,
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        ...(options.headers ?? {}),
      },
    });

  const ownerQuery = (userId) =>
    `?owner_id=eq.${encodeURIComponent(userId)}`;

  const load = async (userId, authorization) => {
    requireAuthorization(authorization);
    try {
      const response = await request(
        authorization,
        `${ownerQuery(userId)}&select=envelope`,
      );
      if (!response.ok) {
        throw new Error(`PostgREST returned ${response.status}.`);
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      return decryptPayload(rows[0].envelope);
    } catch (error) {
      throw new Error("Stored eBay connection could not be read.", {
        cause: error,
      });
    }
  };

  const save = async (userId, tokenPayload, authorization) => {
    requireAuthorization(authorization);
    try {
      const response = await request(authorization, "", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          owner_id: userId,
          envelope: encryptPayload(tokenPayload),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(`PostgREST returned ${response.status}.`);
      }
    } catch (error) {
      throw new Error("Stored eBay connection could not be saved.", {
        cause: error,
      });
    }
  };

  const remove = async (userId, authorization) => {
    requireAuthorization(authorization);
    try {
      const response = await request(authorization, ownerQuery(userId), {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (!response.ok) {
        throw new Error(`PostgREST returned ${response.status}.`);
      }
    } catch (error) {
      throw new Error("Stored eBay connection could not be removed.", {
        cause: error,
      });
    }
  };

  return { load, save, remove };
};

// PF-SCOPE-024: per-call store selection. A call that carries a user
// session JWT goes to the durable store when one is available; every
// other call (local mode, shared-key mode, Supabase env not configured)
// is answered by the file store, exactly as before this scope.
export const createRoutedEbayTokenStore = ({ fileStore, getSupabaseStore }) => {
  const pick = (authorization) =>
    typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? (getSupabaseStore() ?? fileStore)
      : fileStore;

  return {
    load: (userId, authorization) =>
      pick(authorization).load(userId, authorization),
    save: (userId, tokenPayload, authorization) =>
      pick(authorization).save(userId, tokenPayload, authorization),
    remove: (userId, authorization) =>
      pick(authorization).remove(userId, authorization),
  };
};
