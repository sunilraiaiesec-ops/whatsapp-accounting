import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://bantoobooks.com";
  return ["", "/features", "/pricing", "/product"].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
  }));
}
