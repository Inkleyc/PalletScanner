import { Linking } from "react-native";

const FACEBOOK_LOGIN_URLS = [
  "fb://profile",
  "https://www.facebook.com/login",
] as const;

const FACEBOOK_SELLING_URLS = [
  "fb://marketplace",
  "https://www.facebook.com/marketplace/you/selling",
] as const;

const openFirstAvailableUrl = async (urls: readonly string[]) => {
  let lastError: unknown = null;

  for (const url of urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Unable to open Facebook.");
};

export const openFacebookLogin = () =>
  openFirstAvailableUrl(FACEBOOK_LOGIN_URLS);

export const openFacebookSelling = () =>
  openFirstAvailableUrl(FACEBOOK_SELLING_URLS);
