// Cloudflare Pages Function — /sitemap.xml
// リポジトリの sitemap.xml に、特別会の固定ページ（/event/日付/）を足して返す。
import { getEvents, eventPath, SITE } from "../lib/events.mjs";

export async function onRequest(context) {
  const res = await context.env.ASSETS.fetch(new URL("/sitemap.xml", context.request.url));
  let xml = await res.text();
  try {
    const events = await getEvents(context, 4000);
    if (events && events.length && xml.includes("</urlset>")) {
      const urls = events.map(e =>
        `  <url>\n    <loc>${SITE}${eventPath(e)}</loc>\n    <changefreq>${e.ended ? "monthly" : "daily"}</changefreq>\n    <priority>0.7</priority>\n  </url>\n`).join("");
      xml = xml.replace("</urlset>", urls + "</urlset>");
    }
  } catch (err) {}
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
