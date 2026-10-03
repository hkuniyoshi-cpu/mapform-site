// 特別会（開催実績）の取得と表示用の共通処理 — Cloudflare Pages Functions から読み込む
// データ元：GAS の ?action=events（「開催実績」シート＋スケジュール表の特別会）

export const SITE = "https://mapform.search-mania.net";
const GAS_URL = "https://script.google.com/macros/s/AKfycbz0N95BpSCnSUxojul3Pq1VfYrOrmF3z4VRMWGbN4kC4dmr3GfPwPmhX1jOBDvfFVEp/exec";
const CACHE_KEY = SITE + "/__cache/special-events-v1";
const FRESH_SEC = 600;          // この秒数を過ぎたら裏で取り直す（表示は古い内容のまま即返す）
const STALE_MAX_SEC = 60 * 60 * 24; // これより古い内容は出さない（非公開にした回が残り続けないように）

export const esc = t => String(t == null ? "" : t).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const httpsUrl = u => (/^https:\/\/[^\s"'<>]+$/.test(String(u || "")) ? String(u) : "");

export const todayJst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

// GAS の値をそのまま信用せず、使う項目だけ取り出して整える
function normalize(list) {
  const today = todayJst();
  return (Array.isArray(list) ? list : [])
    .filter(e => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ""))
    .map(e => ({
      date: e.date,
      dateLabel: String(e.dateLabel || e.date),
      area: String(e.area || "").trim(),
      venue: String(e.venue || "").trim(),
      address: String(e.address || "").trim(),
      time: String(e.time || "").trim(),
      format: e.format === "オンライン" ? "オンライン" : "対面",
      theme: /^(調整中|未定)$/.test(String(e.theme || "").trim()) ? "" : String(e.theme || "").trim(),
      report: String(e.report || "").trim(),
      photos: (Array.isArray(e.photos) ? e.photos : []).map(httpsUrl).filter(Boolean).slice(0, 12),
      guideImage: httpsUrl(e.guideImage),
      parking: String(e.parking || "").trim(),
      mapUrl: httpsUrl(e.mapUrl),
      open: !!e.open && e.date >= today,
      ended: e.date < today
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

async function fetchFromGas() {
  const res = await fetch(GAS_URL + "?action=events", { redirect: "follow" });
  const json = await res.json();           // GAS がエラーページ(HTML)を返した時はここで例外になる
  if (!json || json.ok !== true || !Array.isArray(json.events)) throw new Error("bad events response");
  return json.events;
}

// 特別会の一覧を返す。取得できない時は null（呼び出し側は一覧なしで表示を続ける）
// waitMs：キャッシュが無い時に GAS を待つ上限。超えたら null を返し、取得は裏で続ける
export async function getEvents(context, waitMs) {
  const cache = caches.default;
  const refresh = async () => {
    const raw = await fetchFromGas();
    try {   // 保存に失敗しても、取得できた内容はそのまま使う
      await cache.put(CACHE_KEY, new Response(JSON.stringify(raw), {
        headers: { "content-type": "application/json", "cache-control": "public, max-age=" + STALE_MAX_SEC, "x-fetched": String(Date.now()) }
      }));
    } catch (e) {}
    return raw;
  };
  let hit = null;
  try { hit = await cache.match(CACHE_KEY); } catch (e) {}
  if (hit) {
    const age = (Date.now() - Number(hit.headers.get("x-fetched") || 0)) / 1000;
    if (age <= STALE_MAX_SEC) {
      if (age > FRESH_SEC) context.waitUntil(refresh().catch(() => {}));
      try { return normalize(await hit.json()); } catch (e) {}
    }
  }
  const p = refresh();
  context.waitUntil(p.catch(() => {}));
  const raw = await Promise.race([p.catch(() => null), new Promise(r => setTimeout(() => r(null), waitMs))]);
  return raw ? normalize(raw) : null;
}

export const eventPath = e => "/event/" + e.date + "/";
export const eventHeading = e => "【" + (e.area ? e.area + "開催" : "特別開催") + "】Googleマップ診断会＋勉強会";
export const statusOf = e => (e.ended ? { label: "開催終了", key: "ended" } : e.open ? { label: "受付中", key: "open" } : { label: "開催予定", key: "soon" });

// トップページ「これまでの特別開催」の中身（index.html 側の表示と同じ見た目）
export function archiveListHtml(events) {
  return events.map(e => {
    const st = statusOf(e);
    const place = e.format === "オンライン" ? "オンライン（Zoom）" : e.venue;
    return `<a class="sp-arc sp-arc--${st.key}" href="${eventPath(e)}">
      <span class="sp-arc__date">${esc(e.dateLabel)}</span>
      <span class="sp-arc__body">
        <span class="sp-arc__title">${esc(e.area ? e.area + "開催" : "特別開催")}${place ? `<span class="sp-arc__venue">${esc(place)}</span>` : ""}</span>
        ${e.theme ? `<span class="sp-arc__theme">テーマ：${esc(e.theme)}</span>` : ""}
      </span>
      <span class="sp-arc__status">${st.label}</span>
    </a>`;
  }).join("");
}
