// Cloudflare Pages Function — /event/2026-10-14/
// 特別会（出張開催など）ごとの固定ページ。開催前は案内、開催後は開催実績（レポート）として残る。
// 設定シートで種別を「特別会」にした回だけがここに出る（データ元は lib/events.mjs）。
import { getEvents, esc, eventPath, eventHeading, statusOf, SITE } from "../../lib/events.mjs";

const TITLE = "Googleマップ診断会＋勉強会";

export async function onRequest(context) {
  const seg = [].concat(context.params.path || []);
  const date = seg[0] || "";
  if (seg.length !== 1 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return notFound();

  const events = await getEvents(context, 8000);
  if (!events) {
    return html(shell({ title: "読み込み中｜" + TITLE, robots: "noindex", body:
      `<main class="wrap"><h1>ただいま情報を読み込めませんでした</h1><p>少し時間をおいて、もう一度お試しください。</p><p><a class="btn" href="/">トップページへ</a></p></main>` }),
      503, { "retry-after": "60", "cache-control": "no-store" });
  }
  const ev = events.find(e => e.date === date);
  if (!ev) return notFound();
  return html(renderEvent(ev, events.filter(e => e.date !== date)), 200, { "cache-control": "public, max-age=300" });
}

function html(body, status, headers) {
  return new Response(body, { status, headers: Object.assign({ "content-type": "text/html; charset=utf-8" }, headers) });
}

function notFound() {
  return html(shell({ title: "ページが見つかりません｜" + TITLE, robots: "noindex", body:
    `<main class="wrap"><h1>ページが見つかりません</h1><p>この開催回のページは見つかりませんでした。最新の開催日程はトップページでご確認ください。</p><p><a class="btn" href="/">開催日程を見る</a></p></main>` }),
    404, { "cache-control": "public, max-age=60" });
}

// 「13:30~15:00」→ ["13:30","15:00"]（読み取れなければ null）
function timeRange(t) {
  const s = String(t || "").replace(/[０-９：]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const m = s.match(/(\d{1,2}):(\d{2})\D+(\d{1,2}):(\d{2})/);
  return m ? [m[1].padStart(2, "0") + ":" + m[2], m[3].padStart(2, "0") + ":" + m[4]] : null;
}

function renderEvent(ev, others) {
  const st = statusOf(ev);
  const online = ev.format === "オンライン";
  const areaLabel = ev.area ? ev.area + "開催" : "特別開催";
  const heading = eventHeading(ev);
  const url = SITE + eventPath(ev);
  const placeText = online ? "オンライン（Zoom）" : [ev.area, ev.venue].filter(Boolean).join("・");
  const verb = ev.ended ? "開催しました" : "開催します";
  const title = `${heading}｜${ev.dateLabel}｜SearchMania`;
  const desc = `${ev.dateLabel}${ev.time ? " " + ev.time : ""}、${placeText ? placeText + "で" : ""}「${TITLE}」を${verb}。Googleビジネスプロフィール（Googleマップ）の設定を見直して来客数アップにつなげる、無料・少人数制の90分セミナーです。${ev.theme ? "テーマ：" + ev.theme + "。" : ""}`;

  const tr = timeRange(ev.time);
  const jsonLd = [{
    "@context": "https://schema.org",
    "@type": "EducationEvent",
    "name": `${heading}（${ev.dateLabel}）`,
    "description": desc,
    "url": url,
    "image": SITE + "/ogp.png",
    "startDate": tr ? `${ev.date}T${tr[0]}:00+09:00` : ev.date,
    ...(tr ? { "endDate": `${ev.date}T${tr[1]}:00+09:00` } : {}),
    "eventStatus": "https://schema.org/EventScheduled",
    "eventAttendanceMode": online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    "location": online
      ? { "@type": "VirtualLocation", "url": SITE + "/" }
      : { "@type": "Place", "name": ev.venue || areaLabel, "address": { "@type": "PostalAddress", "streetAddress": ev.address || "", "addressRegion": "沖縄県", "addressCountry": "JP" } },
    "isAccessibleForFree": true,
    "inLanguage": "ja",
    "organizer": { "@type": "Organization", "name": "SearchMania Inc.", "url": "https://search-mania.net/" },
    "performer": { "@type": "Person", "name": "国吉弘孝" },
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "JPY", "url": ev.open ? `${SITE}/?event=${ev.date}#apply` : SITE + "/",
                "availability": ev.open ? "https://schema.org/InStock" : "https://schema.org/SoldOut" }
  }, {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": TITLE, "item": SITE + "/" },
      { "@type": "ListItem", "position": 2, "name": `${areaLabel}（${ev.dateLabel}）`, "item": url }
    ]
  }];

  const row = (k, v) => (v ? `<div class="fact"><dt>${k}</dt><dd>${v}</dd></div>` : "");
  const facts =
    row("開催日", esc(ev.dateLabel)) +
    row("時間", esc(ev.time)) +
    row("形式", online ? "オンライン（Zoom）" : "対面") +
    (online ? "" : row("会場", esc(ev.venue))) +
    (online ? "" : row("住所", esc(ev.address) + (ev.mapUrl ? ` <a href="${esc(ev.mapUrl)}" target="_blank" rel="noopener">Googleマップで開く</a>` : ""))) +
    row("テーマ", esc(ev.theme)) +
    row("参加費", "無料") +
    row("講師", "国吉弘孝（SearchMania Inc.／Googleマップ集客専門家）");

  const paras = t => esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");

  let main = "";
  if (ev.ended) {
    main += `<section class="card"><h2>開催レポート</h2>` +
      (ev.report ? paras(ev.report)
                 : `<p>${esc(ev.dateLabel)}、${esc(placeText || "特別会場")}にて「${TITLE}」を開催しました。ご参加いただいた皆さま、ありがとうございました。</p>`) +
      (ev.photos.length ? `<div class="photos">${ev.photos.map((p, i) => `<a href="${esc(p)}" target="_blank" rel="noopener"><img src="${esc(p)}" alt="${esc(areaLabel)}の様子 ${i + 1}" loading="lazy"></a>`).join("")}</div>` : "") +
      `</section>
      <section class="cta"><p class="cta__lead">次回以降の開催日程は、トップページでご案内しています。</p>
        <a class="btn" href="/">次回の開催日程を見る</a></section>`;
  } else {
    main += `<section class="cta">` +
      (ev.open ? `<p class="cta__lead">少人数制・先着順です。お申込みはトップページのフォームから。</p><a class="btn" href="/?event=${ev.date}#apply">この回に申し込む（無料）</a>`
               : `<p class="cta__lead">この回の受付開始までしばらくお待ちください。現在受付中の回はトップページでご案内しています。</p><a class="btn" href="/">開催日程を見る</a>`) +
      `</section>`;
    if (!online && (ev.parking || ev.guideImage)) {
      main += `<section class="card"><h2>会場・駐車場のご案内</h2>` +
        (ev.parking ? `<p><strong>駐車場：</strong>${esc(ev.parking)}</p>` : "") +
        (ev.guideImage ? `<a class="guide" href="${esc(ev.guideImage)}" target="_blank" rel="noopener"><img src="${esc(ev.guideImage)}" alt="${esc(ev.venue || "会場")}の会場・駐車場のご案内" loading="lazy"></a>` : "") +
        `</section>`;
    }
  }

  const about = `<section class="card"><h2>この勉強会について</h2>
    <p>Googleビジネスプロフィール（Googleマップ）の「お店の設定」を見直すだけで、来客数アップにつなげるための具体的な改善策を、その場で診断する無料の勉強会です。</p>
    <ul>
      <li><strong>Googleマップ基礎講座</strong>：ローカル検索の仕組みと、見られる店舗情報の整え方</li>
      <li><strong>セルフ診断・質疑応答</strong>：ご自身のビジネスプロフィールを開き、その場で改善ポイントを洗い出し</li>
      <li><strong>対象</strong>：飲食店・美容室・エステ・小売店・ホテル・整骨院・クリニックなど、お客様が来店する／お客様のもとへ伺う事業者の方</li>
    </ul>
    <p>${ev.area ? esc(ev.area) + "を含む沖縄県内での" : "沖縄県内での"}出張開催のご相談は、<a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania Inc.</a> までお問い合わせください。</p>
  </section>`;

  const otherHtml = others.length ? `<section class="card"><h2>そのほかの特別開催</h2><ul class="others">${others.slice(0, 12).map(o =>
    `<li><a href="${eventPath(o)}">${esc(o.dateLabel)}｜${esc(o.area ? o.area + "開催" : "特別開催")}${o.format === "オンライン" ? "（オンライン）" : o.venue ? "（" + esc(o.venue) + "）" : ""}</a><span class="tag tag--${statusOf(o).key}">${statusOf(o).label}</span></li>`).join("")}</ul></section>` : "";

  const body = `<main class="wrap">
    <nav class="crumb" aria-label="パンくずリスト"><a href="/">${TITLE}</a><span aria-hidden="true">›</span><span>${esc(areaLabel)}（${esc(ev.dateLabel)}）</span></nav>
    <header class="hero">
      <div class="tags"><span class="tag tag--special">★ 特別開催</span><span class="tag tag--${st.key}">${st.label}</span></div>
      <h1>${esc(heading)}</h1>
      <p class="lead">${esc(ev.dateLabel)}${ev.time ? " " + esc(ev.time) : ""}${placeText ? "｜" + esc(placeText) : ""}</p>
      <p>${esc(desc)}</p>
    </header>
    <section class="card"><h2>開催概要</h2><dl class="facts">${facts}</dl></section>
    ${main}
    ${about}
    ${otherHtml}
  </main>`;

  return shell({ title, desc, url, jsonLd, body });
}

function shell({ title, desc, url, jsonLd, robots, body }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${desc ? `<meta name="description" content="${esc(desc)}">` : ""}
${robots ? `<meta name="robots" content="${robots}">` : ""}
${url ? `<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${TITLE}｜SearchMania Inc.">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${SITE}/ogp.png">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="icon" type="image/png" href="/favicon-64.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
<style>
  :root{ --bg:#F8F9FA; --card:#fff; --fg:#202124; --dim:#5F6368; --line:rgba(0,0,0,.12); --blue:#4285F4; --green:#34A853; --amber:#FBBC05; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:var(--fg); line-height:1.8; font-size:16px;
        font-family:"Noto Sans JP","Hiragino Sans","Yu Gothic","Meiryo",system-ui,sans-serif; -webkit-font-smoothing:antialiased; }
  a{ color:#1A73E8; }
  .top{ background:#fff; border-bottom:1px solid var(--line); }
  .top::before{ content:""; display:block; height:4px; background:linear-gradient(90deg,#4285F4,#EA4335,#FBBC05,#34A853); }
  .top__in{ max-width:760px; margin:0 auto; padding:12px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .logo{ display:inline-block; padding:7px 16px; border-radius:12px; color:#fff; font-weight:700; font-size:14px; text-decoration:none;
         background:linear-gradient(135deg,#4285F4,#34A853); white-space:nowrap; }
  .top__link{ font-size:13px; font-weight:700; text-decoration:none; white-space:nowrap; }
  .wrap{ max-width:760px; margin:0 auto; padding:20px 16px 56px; }
  .crumb{ font-size:12px; color:var(--dim); display:flex; flex-wrap:wrap; gap:6px; margin-bottom:18px; }
  .crumb a{ color:var(--dim); }
  .tags{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
  .tag{ display:inline-block; padding:3px 12px; border-radius:999px; font-size:12px; font-weight:800; white-space:nowrap; background:#F1F3F4; color:var(--dim); }
  .tag--special{ background:var(--amber); color:#202124; }
  .tag--open{ background:#E6F4EA; color:#137333; }
  .tag--soon{ background:#EAF2FE; color:#1A73E8; }
  h1{ font-size:clamp(22px,5.6vw,34px); line-height:1.35; margin:0 0 10px; letter-spacing:-.01em; word-break:keep-all; overflow-wrap:anywhere; }
  .lead{ font-weight:700; font-size:clamp(15px,3.8vw,18px); margin:0 0 12px; }
  .hero p:last-child{ color:var(--dim); font-size:14.5px; margin:0; }
  h2{ font-size:18px; margin:0 0 14px; padding-left:12px; border-left:4px solid var(--blue); line-height:1.4; }
  .card{ background:var(--card); border:1px solid var(--line); border-radius:16px; padding:22px 20px; margin-top:20px; }
  .card p{ margin:0 0 12px; } .card p:last-child{ margin-bottom:0; }
  .card ul{ margin:0 0 12px; padding-left:1.2em; } .card li{ margin-bottom:6px; }
  .facts{ margin:0; }
  .fact{ display:grid; grid-template-columns:5.5em 1fr; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); }
  .fact:last-child{ border-bottom:0; padding-bottom:0; } .fact:first-child{ padding-top:0; }
  .fact dt{ font-weight:700; color:var(--dim); font-size:14px; } .fact dd{ margin:0; overflow-wrap:anywhere; }
  .fact dd a{ display:inline-block; font-size:13px; margin-left:4px; }
  .cta{ margin-top:20px; padding:24px 20px; border-radius:16px; text-align:center; color:#fff; background:linear-gradient(135deg,#4285F4,#34A853); }
  .cta__lead{ margin:0 0 14px; font-size:14.5px; }
  .btn{ display:inline-block; padding:13px 28px; border-radius:999px; background:#fff; color:#1A73E8; font-weight:800; text-decoration:none; }
  main > p .btn, .wrap > p .btn{ background:var(--blue); color:#fff; }
  .guide{ display:block; max-width:420px; margin:14px auto 0; }
  .guide img, .photos img{ display:block; width:100%; height:auto; border-radius:12px; border:1px solid var(--line); }
  .photos{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:10px; margin-top:14px; }
  .photos img{ aspect-ratio:4/3; object-fit:cover; }
  .others{ list-style:none; padding:0 !important; margin:0 !important; }
  .others li{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 0; border-bottom:1px solid var(--line); margin:0; }
  .others li:last-child{ border-bottom:0; padding-bottom:0; }
  footer{ background:#202124; color:#9AA0A6; font-size:13px; text-align:center; padding:28px 16px; }
  footer a{ color:#E8EAED; }
</style>
</head>
<body>
<div class="top"><div class="top__in">
  <a class="logo" href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania Inc.</a>
  <a class="top__link" href="/">勉強会トップへ</a>
</div></div>
${body}
<footer>
  <p><a href="/">${TITLE}</a>｜主催：<a href="https://search-mania.net/" target="_blank" rel="noopener">SearchMania Inc.</a></p>
  <p>© SearchMania Inc.</p>
</footer>
</body>
</html>`;
}
