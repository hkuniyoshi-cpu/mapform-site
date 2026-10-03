// Cloudflare Pages Function — /llms.txt
// リポジトリの llms.txt に、特別会（出張開催など）の一覧を足して返す。
import { getEvents, eventPath, statusOf, SITE } from "../lib/events.mjs";

export async function onRequest(context) {
  const res = await context.env.ASSETS.fetch(new URL("/llms.txt", context.request.url));
  let text = await res.text();
  try {
    const events = await getEvents(context, 4000);
    if (events && events.length) {
      text = text.replace(/\s*$/, "") + "\n\n## 特別開催（出張開催など）の実績・予定\n\n" + events.map(e => {
        const place = e.format === "オンライン" ? "オンライン（Zoom）" : [e.venue, e.address].filter(Boolean).join("／");
        return `- ${e.dateLabel} ${e.time}｜${e.area ? e.area + "開催" : "特別開催"}｜${place}${e.theme ? "｜テーマ：" + e.theme : ""}｜${statusOf(e).label}｜${SITE}${eventPath(e)}`;
      }).join("\n") + "\n";
    }
  } catch (err) {}
  return new Response(text, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
