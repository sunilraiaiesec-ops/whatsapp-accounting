import Constants from "expo-constants";

// Production API. Override in app.json extra or EXPO_PUBLIC_API_URL for local dev.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  "https://books.bantoobooks.com";
