import type { APIRoute } from "astro";
import { fetchSitePublicationList } from "../lib/publications";

const SITE_URL = "https://getgantt.ru";

const STATIC_PAGES = [
  "/",
  "/features",
  "/faq",
  "/pricing",
  "/privacy",
  "/terms",
] as const;

export const GET: APIRoute = async () => {
  const [templates, blocks] = await Promise.all([
    fetchSitePublicationList('template'),
    fetchSitePublicationList('block'),
  ]);

  const dynamicPages = [
    '/templates',
    '/blocks',
    ...templates.map((item) => `/templates/${item.slug}`),
    ...blocks.map((item) => `/blocks/${item.slug}`),
  ];

  const urls = [...STATIC_PAGES, ...dynamicPages].map(
    (path) => `  <url>
    <loc>${SITE_URL}${path}</loc>
  </url>`
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
    },
  });
};
