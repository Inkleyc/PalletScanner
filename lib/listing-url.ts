export const normalizeListingUrl = (rawUrl: string) => {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return "";
  }

  const withProtocol = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`;

  try {
    const url = new URL(withProtocol);
    url.hash = "";

    [
      "fbclid",
      "mibextid",
      "ref",
      "refsrc",
      "__tn__",
      "tracking",
      "utm_source",
      "utm_medium",
      "utm_campaign",
    ].forEach((param) => url.searchParams.delete(param));

    return url.toString();
  } catch {
    return withProtocol;
  }
};

export const isFacebookListingUrl = (rawUrl: string) => {
  const normalizedUrl = normalizeListingUrl(rawUrl);
  return /^https?:\/\//i.test(normalizedUrl) && /(facebook|fb)\.com/i.test(normalizedUrl);
};

export const isEbayListingUrl = (rawUrl: string) => {
  const normalizedUrl = normalizeListingUrl(rawUrl);
  return /^https?:\/\//i.test(normalizedUrl) && /ebay\./i.test(normalizedUrl);
};
