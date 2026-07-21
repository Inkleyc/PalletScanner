export const ANTHROPIC_MODEL = "claude-sonnet-5";

export const readAnthropicMessageText = async (response: Response) => {
  const bodyText = await response.text();

  if (!response.ok) {
    const detail = bodyText.trim()
      ? ` Claude returned ${response.status}: ${bodyText.slice(0, 240)}`
      : ` Claude returned ${response.status}.`;
    throw new Error(`Online analysis request failed.${detail}`);
  }

  const data = JSON.parse(bodyText);
  const text = data?.content?.[0]?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error("Claude returned an empty analysis response.");
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
