import { getRuntimeBearerToken } from "@/lib/app-auth";

export const ANTHROPIC_MODEL = "claude-sonnet-5";

export type SupportedAnalysisImageType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export const getAnalysisImageMediaType = (
  base64: string,
  reportedType?: string | null,
): SupportedAnalysisImageType | null => {
  const normalized = reportedType?.toLowerCase();
  if (normalized === "image/jpeg" || normalized === "image/jpg") return "image/jpeg";
  if (normalized === "image/png") return "image/png";
  if (normalized === "image/gif") return "image/gif";
  if (normalized === "image/webp") return "image/webp";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return null;
};

const AI_API_BASE_URL = (
  process.env.EXPO_PUBLIC_AI_API_BASE_URL ??
  process.env.EXPO_PUBLIC_EBAY_API_BASE_URL ??
  ""
).replace(/\/$/, "");
const APP_AUTH_TOKEN = process.env.EXPO_PUBLIC_PALLETSCANNER_AUTH_TOKEN ?? "";
const REHEARSAL_MODE = process.env.EXPO_PUBLIC_ENABLE_TEST_MODE === "true";

export const isAnthropicConfigured = () => Boolean(AI_API_BASE_URL);

export const requestAnthropicMessage = async (payload: unknown) => {
  if (!AI_API_BASE_URL) {
    throw new Error("The secure AI backend is not configured.");
  }

  const token = REHEARSAL_MODE
    ? ""
    : (await getRuntimeBearerToken()) || APP_AUTH_TOKEN.trim();
  const response = await fetch(`${AI_API_BASE_URL}/ai/messages`, {
    method: "POST",
    headers: {
      "Content-Type": REHEARSAL_MODE ? "text/plain" : "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(payload),
  });

  return readAnthropicMessageText(response);
};

const readTextBlock = (block: unknown) => {
  if (!block || typeof block !== "object") {
    return "";
  }

  const text = (block as { text?: unknown }).text;
  if (typeof text === "string") {
    return text.trim();
  }

  if (Array.isArray(text)) {
    return text
      .map((part) =>
        typeof part === "string"
          ? part
          : typeof part?.text === "string"
            ? part.text
            : "",
      )
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  return "";
};

export const readAnthropicMessageText = async (response: Response) => {
  const bodyText = await response.text();

  if (!response.ok) {
    const detail = bodyText.trim()
      ? ` Claude returned ${response.status}: ${bodyText.slice(0, 240)}`
      : ` Claude returned ${response.status}.`;
    throw new Error(`Online analysis request failed.${detail}`);
  }

  const data = JSON.parse(bodyText);
  const text = Array.isArray(data?.content)
    ? data.content.map(readTextBlock).filter(Boolean).join("\n").trim()
    : "";

  if (text.length === 0) {
    const stopReason =
      typeof data?.stop_reason === "string" ? ` Stop reason: ${data.stop_reason}.` : "";
    throw new Error(`Claude returned an empty analysis response.${stopReason}`);
  }

  return text;
};

const stripMarkdownFence = (text: string) =>
  text.replace(/```json|```/gi, "").trim();

const extractFirstJsonObject = (text: string) => {
  let depth = 0;
  let startIndex = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      if (depth === 0) {
        startIndex = index;
      }
      depth += 1;
      continue;
    }

    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && startIndex >= 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

export const parseAnthropicJsonObject = <T>(text: string): T => {
  const cleaned = stripMarkdownFence(text);

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const jsonObject = extractFirstJsonObject(cleaned);
    if (!jsonObject) {
      throw new Error("Claude did not return a JSON draft.");
    }

    return JSON.parse(jsonObject) as T;
  }
};
