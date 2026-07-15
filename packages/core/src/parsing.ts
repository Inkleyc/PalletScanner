export type PriceRange = {
  low: number;
  high: number;
};

export const parsePriceRange = (value: string): PriceRange | null => {
  const matches = value.match(/\d+(?:\.\d+)?/g) ?? [];
  if (matches.length < 2) {
    return null;
  }

  const [low, high] = matches.slice(0, 2).map(Number);
  if (Number.isNaN(low) || Number.isNaN(high)) {
    return null;
  }

  return {
    low: Math.min(low, high),
    high: Math.max(low, high),
  };
};

export const parseMoneyAmount = (value: string): number | null => {
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
};

export const parsePositiveInteger = (value: string): number | null => {
  const match = value.match(/\d+/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  if (Number.isNaN(parsed) || parsed < 1) {
    return null;
  }

  return Math.floor(parsed);
};

export const sanitizeBarcodeValue = (value: string) =>
  value.trim().replace(/[^0-9A-Za-z]/g, "");
