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
    } catch {
      if (userId === "local") {
        try {
          const legacyRaw = await readFile(legacyTokenFile, "utf8");
          return JSON.parse(legacyRaw);
        } catch {
          return null;
        }
      }
      return null;
    }
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
