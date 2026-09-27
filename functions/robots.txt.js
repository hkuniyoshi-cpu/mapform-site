// Cloudflare Pages Function — /robots.txt
// Cloudflare が robots.txt に自動注入する AI Bot 制限（Content Signals 等）を迂回し、
// リポジトリの robots.txt の内容をそのまま返す。
export async function onRequest(context) {
  const res = await context.env.ASSETS.fetch(new URL("/robots.txt.src", context.request.url));
  const body = res.ok ? await res.text() : "User-agent: *\nAllow: /\n";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" }
  });
}
