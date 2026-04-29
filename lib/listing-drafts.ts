export type ListingDraftPlatform = "general" | "facebook" | "ebay";

export type ListingDraftFields = {
  title: string;
  description: string;
};

export type ListingDraftMap = Record<ListingDraftPlatform, ListingDraftFields>;

type ListingDraftSource = {
  listing_title?: string | null;
  listing_description?: string | null;
  listing_title_facebook?: string | null;
  listing_description_facebook?: string | null;
  listing_title_ebay?: string | null;
  listing_description_ebay?: string | null;
};

const coerceText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export const createEmptyListingDrafts = (): ListingDraftMap => ({
  general: { title: "", description: "" },
  facebook: { title: "", description: "" },
  ebay: { title: "", description: "" },
});

export const createListingDrafts = (
  source?: ListingDraftSource | null,
): ListingDraftMap => {
  const generalTitle = coerceText(source?.listing_title);
  const generalDescription = coerceText(source?.listing_description);

  return {
    general: {
      title: generalTitle,
      description: generalDescription,
    },
    facebook: {
      title: coerceText(source?.listing_title_facebook) || generalTitle,
      description:
        coerceText(source?.listing_description_facebook) || generalDescription,
    },
    ebay: {
      title: coerceText(source?.listing_title_ebay) || generalTitle,
      description:
        coerceText(source?.listing_description_ebay) || generalDescription,
    },
  };
};

export const getListingDraftPlatformLabel = (
  platform: ListingDraftPlatform,
) => {
  switch (platform) {
    case "facebook":
      return "Facebook";
    case "ebay":
      return "eBay";
    default:
      return "General";
  }
};
