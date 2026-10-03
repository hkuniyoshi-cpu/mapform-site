// Cloudflare Pages Function — /（トップページ）
// 「これまでの特別開催」の一覧を HTML に書き込んでから返す（検索エンジン・AIクローラーが読めるように）。
// 一覧を取得できない時は、元のページをそのまま返す（ブラウザ側のスクリプトが後から表示する）。
import { getEvents, archiveListHtml } from "../lib/events.mjs";

export async function onRequest(context) {
  const res = await context.next();
  try {
    if (context.request.method !== "GET") return res;
    if (!(res.headers.get("content-type") || "").includes("text/html") || res.status !== 200) return res;
    const events = await getEvents(context, 1200);
    if (!events || !events.length) return res;
    const html = archiveListHtml(events);
    return new HTMLRewriter()
      .on("#special-archive", { element(el) { el.removeAttribute("hidden"); } })
      .on("#special-archive-list", { element(el) { el.setAttribute("data-ssr", "1"); el.setInnerContent(html, { html: true }); } })
      .transform(res);
  } catch (err) {
    return res;
  }
}
