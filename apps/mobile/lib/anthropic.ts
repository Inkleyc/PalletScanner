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
