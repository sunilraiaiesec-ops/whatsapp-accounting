import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "fr",
  localePrefix: "never",
  localeDetection: true,
});

export type AppLocale = (typeof routing.locales)[number];
