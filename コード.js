/**
 * Code.gs — MEO Workshop（スプレッドシートバインド版）
 * ─────────────────────────────────────────────
 * シート構成：
 *   設定       … 開催情報CMS（eventId・日時・会場など）
 *   申込一覧   … 全開催の累積ログ（チェックなし・index反映なし）
 *   [eventId]  … 開催別シート（✓チェックでindex残席に反映）
 *
 * 開催を切り替えるには：
 *   設定シートの「eventId」を新しい値に変更する
 *   → 次の申込みで新しいタブが自動生成される
 *
 * 使い方：
 *   1. スプレッドシート → ツール → スクリプトエディタ に貼り付け
 *   2. 「📋 MEO Workshop」→「初期セットアップ」を実行
 *   3. 設定シートに開催情報を入力
 *   4. デプロイ → ウェブアプリとして公開（アクセス：全員）
 *   5. URLを index.html の EVENT_CONFIG.gasUrl に設定
 *   6. 「リマインドトリガー設定」を実行
 * ─────────────────────────────────────────────
 */

// =============================================
// ▼▼▼ 設定 ▼▼▼
// =============================================

const SENDER_EMAIL = "info@search-mania.net";
const SENDER_NAME  = "SearchMania Inc.";
const ADMIN_EMAIL  = "h.kuniyoshi@search-mania.net";

// ※ EVENT_DATE_MAP は廃止。開催日は設定シートの eventId 先頭10文字から自動取得。

// ▲▲▲ 設定ここまで ▲▲▲

const CONFIG_SHEET = "設定";
const MASTER_SHEET = "申込一覧";

// 申込一覧（累積ログ）の列 — チェックボックスなし
const MASTER_COLS = ["申込日時","開催ID","参加方法","お名前","メールアドレス","電話番号","店舗名・会社名","流入経路","ご質問・備考","同意項目"];

// 開催別シートの列 — A列がチェックボックス
const EVENT_COLS  = ["✓","申込日時","開催ID","参加方法","お名前","メールアドレス","電話番号","店舗名・会社名","流入経路","ご質問・備考","同意項目"];

// ─────────────────────────────────────────────
// 設定シートのレイアウト
//   上段：開催スケジュール表（次回 / 次々回 / その次）… 日付・形式・テーマを横一列で入力
//   下段：基本情報 / 会場 / オンライン / その他 … 「項目｜値」形式
// 「次回」＝LPで申込みを受け付けている回（eventId・残席・メール・リマインドの基準）
// ─────────────────────────────────────────────
const SCHEDULE_SLOTS = [
  { key: "次回",   label: "次回（申込受付中）" },
  { key: "次々回", label: "次々回" },
  { key: "その次", label: "その次" }
];
const FORMAT_OPTIONS = ["対面", "オンライン"];

const DEFAULT_CONFIG_SECTIONS = [
  { title: "【基本情報】", rows: [
    ["タイトル",       "Googleマップ診断会＋勉強会"],
    ["キャッチコピー", "Googleマップ「お店の設定」を見直すだけで、来客数アップへの具体的改善策を無料診断します。"],
    ["開催時間",       "14:00 〜 15:30"],
    ["所要時間",       "90分"],
    ["参加費",         "無料"],
    ["定員",           "10"]
  ]},
  { title: "【会場（対面の回で使用）】", rows: [
    ["会場名",     "Café＆Bar ツボバル"],
    ["会場住所",   "（住所を入力）"],
    ["地図リンク", "https://maps.app.goo.gl/rYUED1nsaJ7CEat17"],
    ["地図埋込URL","https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d894.865614533331!2d127.6954395!3d26.2141591!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x34e569cb16dea07d%3A0x1a20f9f3ebacd842!2z44OE44Oc44OQ44OrQ2FmZe-8hkJhcg!5e0!3m2!1sja!2sjp!4v1778600875620!5m2!1sja!2sjp"],
    ["駐車場",     "先着4台店舗前 / 近隣コインパーキングあり（有料）"]
  ]},
  { title: "【オンライン（Zoomの回で使用）】", rows: [
    ["オンラインURL",      ""],
    ["オンライン注意事項", "開催前日までにZoom URLをメールでお送りします。"]
  ]},
  { title: "【その他】", rows: [
    ["特例告知", ""]  // 入力するとLP上部に告知バナー（例：「今回は特例でオンライン開催です」）
  ]}
];

// =============================================
// カスタムメニュー
// =============================================
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("📋 MEO Workshop")
    .addItem("↕ 申込一覧：新しい順に並べ替え", "sortByDateDesc")
    .addItem("↕ 申込一覧：名前順に並べ替え",   "sortByName")
    .addSeparator()
    .addItem("⏭ 開催後：スケジュールを1つ繰り上げ", "shiftSchedule")
    .addItem("♻ 設定シートを新レイアウトに作り直す（値は引継ぎ）", "rebuildConfigSheet")
    .addItem("🔧 初期セットアップ（初回のみ）", "setupSheets")
    .addItem("⏰ リマインドトリガー設定",        "setupReminderTrigger")
    .addSeparator()
    .addItem("📧 送信元エイリアスをチェック", "checkSenderAlias")
    .addItem("📧 テストメール送信（自分宛）", "sendTestEmail")
    .addToUi();
}

// =============================================
// 送信元エイリアス診断
// GAS の MailApp は from= に指定したメールが Gmail のエイリアスとして
// 登録されていないと、送信アカウント本体のアドレスに勝手にフォールバックする。
// ここで「登録済みかどうか」をUIに表示する。
// =============================================
function checkSenderAlias() {
  var ui = SpreadsheetApp.getUi();
  var aliases = [];
  try {
    aliases = GmailApp.getAliases() || [];
  } catch (err) {
    ui.alert("エイリアスを取得できませんでした：\n" + err.toString() +
             "\n\n『権限が必要です』と出た場合は認可してから再実行してください。");
    return;
  }
  var primary = Session.getActiveUser().getEmail();
  var msg = "■ 送信アカウント（実体）\n" + primary + "\n\n";
  msg += "■ 登録済みエイリアス\n";
  msg += (aliases.length ? aliases.map(function(a){ return "・" + a; }).join("\n") : "（未登録）");
  msg += "\n\n■ Code.gs の SENDER_EMAIL\n" + SENDER_EMAIL + "\n\n";
  if (aliases.indexOf(SENDER_EMAIL) !== -1) {
    msg += "✅ OK：SENDER_EMAIL がエイリアスに含まれています。\n" +
           "メールは " + SENDER_EMAIL + " から送信されます。";
  } else {
    msg += "⚠️ 未登録：\n" +
           SENDER_EMAIL + " が上のエイリアス一覧にありません。\n" +
           "Gmail → 設定 → アカウント → 名前 → 「他のメールアドレスを追加」で\n" +
           SENDER_EMAIL + " を追加してください。\n" +
           "（登録するまでは送信アカウント本体 " + primary + " から送られます）";
  }
  ui.alert(msg);
}

// =============================================
// テストメール送信（自分宛）
// SENDER_EMAIL が正しく反映されるか実際に送って確認するための便宜関数
// =============================================
function sendTestEmail() {
  var ui = SpreadsheetApp.getUi();
  try {
    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      subject: "【テスト送信】SENDER_EMAIL 確認",
      body:
        "これはテストメールです。\n\n" +
        "SENDER_EMAIL: " + SENDER_EMAIL + "\n" +
        "SENDER_NAME:  " + SENDER_NAME + "\n\n" +
        "受信メールの「From」欄が上記どおりか確認してください。\n" +
        "違うアドレスから届いていたら、エイリアス未登録です。",
      name: SENDER_NAME,
      from: SENDER_EMAIL
    });
    ui.alert("✅ " + ADMIN_EMAIL + " 宛にテストメールを送信しました。\n" +
             "受信箱の From を確認してください。");
  } catch (err) {
    ui.alert("送信失敗：" + err.toString());
  }
}

// =============================================
// 設定シート：新レイアウト（スケジュール表＋セクション別の項目）
// =============================================

// 設定シートを読み取り、スケジュール3枠と「項目→値」を返す（新旧どちらのレイアウトでも読める）
function readConfigSheetRaw_(sheet) {
  var out = { schedule: {}, kv: {} };
  if (!sheet || sheet.getLastRow() < 1) return out;
  var rows = sheet.getRange(1, 1, sheet.getLastRow(), 4).getValues();
  rows.forEach(function(r) {
    var a = (r[0] || "").toString().trim();
    if (!a || a.charAt(0) === "【" || a === "回" || a === "項目") return;
    var slot = slotKeyOf_(a);
    if (slot) {
      out.schedule[slot] = { date: r[1], format: (r[2] || "").toString().trim(), theme: (r[3] || "").toString().trim() };
    } else {
      out.kv[a] = r[1];
    }
  });
  return out;
}

// A列ラベル → スケジュール枠キー（"次回（申込受付中）"→"次回"）。該当しなければ null
function slotKeyOf_(label) {
  // 旧レイアウトの「次回開催日」「次々回テーマ」等は項目扱いにするため、完全一致（＋「（…）」付き）のみ
  var base = label.replace(/（.*）$/, "").replace(/\(.*\)$/, "").trim();
  if (base === "次回" || base === "次々回" || base === "その次") return base;
  return null;
}

// 設定シートを新レイアウトで書き出す（sched: {次回:{date,format,theme},...}, kv: {項目:値}）
function writeConfigLayout_(sheet, sched, kv) {
  sheet.clear();
  sheet.getDataRange().clearDataValidations();
  sheet.setFrozenRows(0);

  var row = 1;
  // ── スケジュール表 ──
  sheet.getRange(row, 1, 1, 4).setValues([["【開催スケジュール】 次回＝LPで申込受付中の回", "", "", ""]]);
  sheet.getRange(row, 1, 1, 4).merge().setFontWeight("bold").setBackground("#202124").setFontColor("#FFFFFF");
  row++;
  sheet.getRange(row, 1, 1, 4).setValues([["回", "開催日", "開催形式", "テーマ"]])
       .setFontWeight("bold").setBackground("#4285F4").setFontColor("#FFFFFF");
  row++;
  var schedStart = row;
  SCHEDULE_SLOTS.forEach(function(s) {
    var v = sched[s.key] || {};
    sheet.getRange(row, 1, 1, 4).setValues([[s.label, v.date || "", v.format || "", v.theme || ""]]);
    row++;
  });
  // 日付＝カレンダー入力 / 形式＝プルダウン
  var n = SCHEDULE_SLOTS.length;
  sheet.getRange(schedStart, 2, n, 1).setNumberFormat("yyyy/MM/dd")
       .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(true).build());
  sheet.getRange(schedStart, 3, n, 1)
       .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(FORMAT_OPTIONS, true).setAllowInvalid(true).build());
  sheet.getRange(schedStart, 1, 1, 4).setBackground("#E6F4EA").setFontWeight("bold");   // 次回＝緑で強調
  sheet.getRange(schedStart + 1, 1, n - 1, 4).setBackground("#F8F9FA");
  row++; // 空行

  // ── 項目｜値 セクション ──
  DEFAULT_CONFIG_SECTIONS.forEach(function(sec) {
    sheet.getRange(row, 1, 1, 2).setValues([[sec.title, "値"]])
         .setFontWeight("bold").setBackground("#E8EAED");
    row++;
    sec.rows.forEach(function(pair) {
      var key = pair[0];
      var val = (kv[key] !== undefined && kv[key] !== null && kv[key] !== "") ? kv[key] : pair[1];
      sheet.getRange(row, 1, 1, 2).setValues([[key, val]]);
      row++;
    });
    row++; // セクション間の空行
  });

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 360);
  sheet.setColumnWidth(3, 110);
  sheet.setColumnWidth(4, 320);
}

// 旧レイアウト → 新レイアウトへ値を引き継いで作り直す（開催別タブ・申込一覧には触れない）
function rebuildConfigSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG_SHEET, 0);

  var ok = ui.alert("設定シートを作り直します",
    "「設定」シートだけを新レイアウトに作り直します（今の値は引き継ぎます）。\n" +
    "申込一覧・開催別タブには一切触れません。\n\n実行しますか？", ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;

  var raw = readConfigSheetRaw_(sheet);
  var kv = raw.kv, sched = raw.schedule;

  // 旧レイアウトからの引継ぎ（スケジュール表がまだ無い場合）
  if (!sched["次回"]) {
    sched["次回"] = { date: kv["開催日"] || "", format: (kv["開催形式"] || "").toString().trim(), theme: (kv["テーマ"] || "").toString().trim() };
    var curD = parseDate_(kv["開催日"]);
    var nxt = parseDate_(kv["次々回開催日"]) || parseDate_(kv["次回開催日"]);
    if (nxt && curD && nxt.getTime() === curD.getTime()) nxt = null; // 今回と同じ日付は捨てる
    var nxtTheme = (kv["次々回テーマ"] || kv["次回テーマ"] || "").toString().trim();
    if (nxtTheme === "調整中") nxtTheme = "";
    sched["次々回"] = { date: nxt || "", format: (kv["次々回開催形式"] || "").toString().trim(), theme: nxtTheme };
    sched["その次"] = { date: "", format: "", theme: "" };
  }

  writeConfigLayout_(sheet, sched, kv);
  ui.alert("✅ 設定シートを作り直しました。\n\n" +
    "上の表の「次回」がLPで申込受付中の回です。\n" +
    "開催が終わったら メニュー「⏭ 開催後：スケジュールを1つ繰り上げ」で\n次々回→次回、その次→次々回 に自動で移動できます。");
}

// 開催が終わったら：次々回→次回、その次→次々回、その次は空に
function shiftSchedule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  var rows = sheet.getRange(1, 1, sheet.getLastRow(), 4).getValues();
  var idx = {};
  rows.forEach(function(r, i) {
    var k = slotKeyOf_((r[0] || "").toString().trim());
    if (k && !idx[k]) idx[k] = i + 1;
  });
  if (!idx["次回"] || !idx["次々回"] || !idx["その次"]) {
    ui.alert("スケジュール表が見つかりません。先に「♻ 設定シートを新レイアウトに作り直す」を実行してください。");
    return;
  }
  var cur = sheet.getRange(idx["次回"], 2, 1, 3).getValues()[0];
  var nx  = sheet.getRange(idx["次々回"], 2, 1, 3).getValues()[0];
  var nx2 = sheet.getRange(idx["その次"], 2, 1, 3).getValues()[0];
  var ok = ui.alert("スケジュールを繰り上げます",
    "次回：" + fmtSlot_(cur) + "  → 終了扱い\n" +
    "次々回：" + fmtSlot_(nx) + "  → 次回（申込受付開始）\n" +
    "その次：" + fmtSlot_(nx2) + "  → 次々回\n\n実行しますか？", ui.ButtonSet.OK_CANCEL);
  if (ok !== ui.Button.OK) return;
  sheet.getRange(idx["次回"], 2, 1, 3).setValues([nx]);
  sheet.getRange(idx["次々回"], 2, 1, 3).setValues([nx2]);
  sheet.getRange(idx["その次"], 2, 1, 3).setValues([["", "", ""]]);
  ui.alert("✅ 繰り上げました。「その次」に新しい予定を入れてください。");
}

function fmtSlot_(v) {
  var d = parseDate_(v[0]);
  return (d ? Utilities.formatDate(d, "Asia/Tokyo", "M/d") : "未定") + (v[1] ? "（" + v[1] + "）" : "");
}


// =============================================
// POST: フォーム申込み受信
// =============================================
function doPost(e) {
  try {
    var data    = JSON.parse(e.postData.contents);
    var eventId = (data.eventId || "_unknown").toString();
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var config  = readConfig_(ss);
    // 参加方法：フォーム側の送信値を優先、無ければ設定シートの開催形式を採用
    var joinMode = (data.joinMode || config["開催形式"] || "対面").toString();

    var dataRow = [
      new Date(),
      eventId,
      joinMode,
      data.name     || "",
      data.email    || "",
      data.phone    || "",
      data.shopName || "",
      Array.isArray(data.source) ? data.source.join(", ") : (data.source || ""),
      data.note     || "",
      // 同意項目（オンライン参加時に画面でチェックされた同意事項を "録画同意, URL非共有, ..." 形式で保存）
      Array.isArray(data.consent) ? data.consent.join(", ") : (data.consent || "")
    ];

    // 申込一覧：累積ログ（チェックなし・シンプル追記）
    appendToMaster_(ss, dataRow);

    // 開催別シート：✓付きで残席カウント対象
    appendToEventSheet_(ss, eventId, dataRow);

    // メール送信
    if (data.email) sendConfirmationEmail_(data, ss);
    sendAdminNotification_(data, ss);

    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.toString() });
  }
}

// =============================================
// GET: 残席数（開催別シートの✓カウント）/ 設定取得
// =============================================
function doGet(e) {
  try {
    var action  = (e.parameter.action  || "count").toString();
    var eventId = (e.parameter.eventId || "").toString();
    var ss      = SpreadsheetApp.getActiveSpreadsheet();

    if (action === "count") {
      var count = countChecked_(ss, eventId);
      return jsonOut_({ ok: true, eventId: eventId, count: count });
    }

    if (action === "config") {
      return jsonOut_({ ok: true, config: readConfig_(ss) });
    }

    return jsonOut_({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonOut_({ ok: false, error: err.toString() });
  }
}

// =============================================
// 並べ替え（申込一覧対象）
// =============================================
function sortByDateDesc() { sortSheet_(MASTER_SHEET, 1, false); } // 申込日時
function sortByName()     { sortSheet_(MASTER_SHEET, 4, true);  } // お名前（参加方法列追加でシフト）

function sortSheet_(sheetName, colIndex, asc) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var ui    = SpreadsheetApp.getUi();
  if (!sheet || sheet.getLastRow() < 3) {
    ui.alert("並べ替えるデータがありません。"); return;
  }
  sheet.getRange(2, 1, sheet.getLastRow() - 1, MASTER_COLS.length)
       .sort({ column: colIndex, ascending: asc });
  ui.alert("並べ替えが完了しました。");
}

// =============================================
// 初期セットアップ
// =============================================
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  // 設定シート（既にあれば値を引き継いで新レイアウトへ）
  var configSheet = ss.getSheetByName(CONFIG_SHEET);
  if (!configSheet) configSheet = ss.insertSheet(CONFIG_SHEET, 0);
  var raw = readConfigSheetRaw_(configSheet);
  writeConfigLayout_(configSheet, raw.schedule, raw.kv);

  // 申込一覧シート（累積ログ）
  var masterSheet = ss.getSheetByName(MASTER_SHEET);
  if (!masterSheet) masterSheet = ss.insertSheet(MASTER_SHEET, 1);
  if (masterSheet.getLastRow() === 0) setupMasterSheet_(masterSheet);

  ui.alert(
    "✅ セットアップ完了\n\n" +
    "「設定」シート上段の表に 次回／次々回／その次 を入力してください。\n\n" +
    "【シートの使い分け】\n" +
    "・設定 … 上段＝開催スケジュール、下段＝基本情報・会場・Zoom\n" +
    "・申込一覧 … 全開催の累積ログ（閲覧・並べ替え用）\n" +
    "・[開催日]タブ … A列✓で残席をLPに反映\n\n" +
    "【開催が終わったら】\n" +
    "メニュー「⏭ 開催後：スケジュールを1つ繰り上げ」"
  );
}

// =============================================
// 申込み完了メール
// =============================================
function sendConfirmationEmail_(data, ss) {
  var config   = readConfig_(ss);
  var isOnline = (config["開催形式"] === "オンライン");
  var joinMode = (data.joinMode || config["開催形式"] || "対面");

  // Zoom情報を URL から抽出（ミーティングIDを 3 桁ずつ整形して読みやすく）
  var zoomUrl = (config["オンラインURL"] || "").toString().trim();
  var zoomId = "";
  if (isOnline && zoomUrl) {
    var m = zoomUrl.match(/\/j\/(\d+)/);
    if (m) {
      var raw = m[1];
      // 10桁以上なら「XXX XXX XXXX」形式、それ以外はそのまま
      if (raw.length >= 10) zoomId = raw.substring(0,3) + " " + raw.substring(3,6) + " " + raw.substring(6);
      else if (raw.length >= 9) zoomId = raw.substring(0,3) + " " + raw.substring(3,6) + " " + raw.substring(6);
      else zoomId = raw;
    }
  }

  var venueLine = isOnline
    ? "参加形式　：オンライン（Zoom）\n" +
      (zoomUrl ? "参加URL　　：" + zoomUrl + "\n" : "") +
      (zoomId  ? "ミーティングID：" + zoomId + "\n" : "")
    : "参加形式　：対面\n会　場　　：" + (config["会場名"] || "") + "\n";

  var closing = isOnline
    ? "■ 参加方法\n" +
      "上記の【参加URL】をクリック、または Zoom アプリで【ミーティングID】を入力してご参加ください。\n" +
      "PC・タブレット・スマホどれでも参加可能です。\n\n" +
      "■ ご準備のお願い\n" +
      "Googleビジネスプロフィールにログインできる状態でご参加いただくと、その場で診断・改善を反映できます。\n" +
      "（未登録の方も参加OKです。当日ご一緒に登録もできます）\n"
    : "当日はパソコンまたはタブレットをご持参ください。\n" +
      "Googleビジネスプロフィールにログインできる状態でお越しください。\n";

  var deliverabilityNote =
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "■ このメールが届いた場合の確認\n" +
    "本メールが受信できていれば、お申込みは正常に完了しています。\n" +
    "もし今後の案内メール（リマインド等）が届かない場合は、以下をご確認ください：\n" +
    "・迷惑メールフォルダに振り分けられていないか\n" +
    "・info@search-mania.net をアドレス帳／許可リストに追加\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  var subject = "【申込み完了】" + (config["タイトル"] || "Googleマップ診断会＋勉強会");
  var body =
    data.name + " 様\n\n" +
    "この度はお申し込みいただき、ありがとうございます。\n" +
    "以下の内容で受け付けました。\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "お名前　　：" + data.name + "\n" +
    "店舗名　　：" + (data.shopName || "（未入力）") + "\n" +
    "開催日　　：" + (config["開催日"]   || "") + "\n" +
    "時　間　　：" + (config["開催時間"] || "") + "\n" +
    venueLine +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    closing + "\n" +
    "開催3日前にリマインドメールをお送りします。\n\n" +
    deliverabilityNote +
    SENDER_EMAIL + "\n" + SENDER_NAME + "\nhttps://search-mania.net/";

  MailApp.sendEmail({ to: data.email, subject: subject, body: body, name: SENDER_NAME, from: SENDER_EMAIL });
}

// =============================================
// 管理者への新規申込み通知
// =============================================
function sendAdminNotification_(data, ss) {
  var config = readConfig_(ss);
  MailApp.sendEmail({
    to:      ADMIN_EMAIL,
    subject: "【新規申込み】" + (data.name || "（名前未入力）") + " 様 ／ " + (config["タイトル"] || "MEO Workshop"),
    body:
      "新規申込みがありました。\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
      "参加方法　：" + (data.joinMode || config["開催形式"] || "対面") + "\n" +
      "お名前　　：" + (data.name     || "") + "\n" +
      "メール　　：" + (data.email    || "") + "\n" +
      "電話番号　：" + (data.phone    || "") + "\n" +
      "店舗名　　：" + (data.shopName || "") + "\n" +
      "流入経路　：" + (Array.isArray(data.source) ? data.source.join(", ") : (data.source || "")) + "\n" +
      "備考　　　：" + (data.note     || "") + "\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "スプレッドシートの「" + (data.eventId || "") + "」タブで確認してください。",
    name: SENDER_NAME
  });
}

// =============================================
// 3日前リマインド（毎朝9時 自動実行）
// =============================================
function sendReminders() {
  var today   = new Date();
  today.setHours(0, 0, 0, 0);
  var in3Days = new Date(today);
  in3Days.setDate(today.getDate() + 3);
  var target  = Utilities.formatDate(in3Days, "Asia/Tokyo", "yyyy-MM-dd");

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var config  = readConfig_(ss);

  // 設定シートの eventId から日付を自動取得（先頭10文字 = YYYY-MM-DD）
  var eventId   = (config["eventId"] || "").trim();
  var eventDate = eventId.substring(0, 10);
  if (!eventId || eventDate !== target) return;

  var sheet = ss.getSheetByName(eventId);
  if (!sheet || sheet.getLastRow() < 2) return;

  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, EVENT_COLS.length).getValues();
  rows.forEach(function(row) {
    if (row[0] !== true) return;
    var email = row[5]; // メールアドレス（F列）※参加方法列追加で1つ右にシフト
    var name  = row[4]; // お名前（E列）
    if (!email) return;
    sendReminderEmail_(name, email, config);
  });
}

function sendReminderEmail_(name, email, config) {
  var isOnline = (config["開催形式"] === "オンライン");
  var subject = "【開催3日前】" + (config["タイトル"] || "Googleマップ診断会＋勉強会") + "のご案内";

  // Zoom URL からミーティングIDを抽出（3桁ずつ整形）
  var zoomUrl = (config["オンラインURL"] || "").toString().trim();
  var zoomId = "";
  if (isOnline && zoomUrl) {
    var m = zoomUrl.match(/\/j\/(\d+)/);
    if (m) {
      var raw = m[1];
      if (raw.length >= 9) zoomId = raw.substring(0,3) + " " + raw.substring(3,6) + " " + raw.substring(6);
      else zoomId = raw;
    }
  }

  var venueBlock = isOnline
    ? "参加形式：オンライン（Zoom）\n" +
      (zoomUrl ? "参加URL　：" + zoomUrl + "\n" : "") +
      (zoomId  ? "ミーティングID：" + zoomId + "\n" : "")
    : "会　場　：" + (config["会場名"]   || "") + "\n" +
      "住　所　：" + (config["会場住所"] || "") + "\n" +
      (config["地図リンク"] ? "地　図　：" + config["地図リンク"] + "\n" : "");

  var reminderTips = isOnline
    ? "・PC・タブレット・スマホどれでも参加OK（Zoom アプリ推奨・ブラウザ参加可）\n" +
      "・通信環境（Wi-Fi等）は当日ご確認ください\n" +
      "・Googleビジネスプロフィール（登録済みの方）にログインできる状態でご参加いただくと、その場で診断・改善を反映できます\n"
    : "・パソコン、タブレット、またはスマートフォンをご持参ください\n" +
      "・Googleビジネスプロフィールにログインできる状態でお越しください\n";

  var body =
    name + " 様\n\n" +
    "いよいよ開催まであと3日となりました！\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "開催日　：" + (config["開催日"]   || "") + "\n" +
    "時　間　：" + (config["開催時間"] || "") + "\n" +
    venueBlock +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    reminderTips + "\n" +
    SENDER_EMAIL + "\n" + SENDER_NAME + "\nhttps://search-mania.net/";

  MailApp.sendEmail({ to: email, subject: subject, body: body, name: SENDER_NAME, from: SENDER_EMAIL });
}

// =============================================
// トリガー設定
// =============================================
function setupReminderTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "sendReminders"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  ScriptApp.newTrigger("sendReminders")
    .timeBased().atHour(9).everyDays(1).inTimezone("Asia/Tokyo").create();

  SpreadsheetApp.getUi().alert("⏰ リマインドトリガーを設定しました。\n毎朝9時（日本時間）に自動実行されます。");
}

// =============================================
// ヘルパー
// =============================================

// 申込一覧（累積ログ）に追記 — シンプルappendRow
function appendToMaster_(ss, dataRow) {
  var sheet = ss.getSheetByName(MASTER_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(MASTER_SHEET);
    setupMasterSheet_(sheet);
  }
  sheet.appendRow(dataRow);
}

// 開催別シートに追記 — ✓チェックあり
function appendToEventSheet_(ss, eventId, dataRow) {
  var sheet = ss.getSheetByName(eventId);
  if (!sheet) {
    sheet = ss.insertSheet(eventId);
    setupEventSheet_(sheet);
  }
  var targetRow = nextDataRow_(sheet);
  // B列以降にデータ書き込み（A列は✓）
  sheet.getRange(targetRow, 2, 1, dataRow.length).setValues([dataRow]);
  // A列：チェックボックスをON
  var cell = sheet.getRange(targetRow, 1);
  try { cell.insertCheckboxes(); } catch (ex) {}
  cell.setValue(true);
}

// 開催別シートの✓=TRUEの件数をカウント（index残席用）
function countChecked_(ss, eventId) {
  var sheet = ss.getSheetByName(eventId);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  return rows.filter(function(r) { return r[0] === true; }).length;
}

// お名前列（E列 = 5列目）が空の最初の行を返す
function nextDataRow_(sheet) {
  var nameCol = 5; // E列（✓=A, 申込日時=B, 開催ID=C, 参加方法=D, お名前=E）
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 2;
  var values = sheet.getRange(2, nameCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (!values[i][0]) return i + 2;
  }
  return lastRow + 1;
}

function readConfig_(ss) {
  var sheet = ss.getSheetByName(CONFIG_SHEET);
  if (!sheet || sheet.getLastRow() < 1) return {};
  var raw = readConfigSheetRaw_(sheet);
  var cfg = {};

  // 項目｜値（Dateは文字列化）
  Object.keys(raw.kv).forEach(function(k) {
    var v = raw.kv[k];
    cfg[k] = (v === undefined || v === null) ? "" : (v instanceof Date ? formatJpDate_(v) : v.toString());
  });

  // スケジュール表（次回・次々回・その次）
  var schedule = [];
  SCHEDULE_SLOTS.forEach(function(s) {
    var v = raw.schedule[s.key] || {};
    var d = parseDate_(v.date);
    schedule.push({
      slot:      s.key,
      date:      d ? Utilities.formatDate(d, "Asia/Tokyo", "yyyy-MM-dd") : "",
      dateLabel: d ? formatJpDate_(d) : "",
      format:    FORMAT_OPTIONS.indexOf(v.format) !== -1 ? v.format : "",
      theme:     v.theme || ""
    });
  });

  if (raw.schedule["次回"]) {
    // 新レイアウト：既存処理（メール・リマインド・残席）が使うキーを「次回」から生成
    var cur = schedule[0];
    cfg["開催日"]   = cur.dateLabel;
    cfg["eventId"]  = cur.date;
    cfg["開催形式"] = cur.format || "対面";
    cfg["テーマ"]   = cur.theme;
  } else {
    // 旧レイアウト（作り直し前）の互換：旧項目からスケジュールを組み立てる
    var d0 = parseDate_(raw.kv["開催日"]);
    if (d0) { cfg["開催日"] = formatJpDate_(d0); cfg["eventId"] = Utilities.formatDate(d0, "Asia/Tokyo", "yyyy-MM-dd"); }
    var d1 = parseDate_(raw.kv["次々回開催日"]) || parseDate_(raw.kv["次回開催日"]);
    if (d1 && d0 && d1.getTime() === d0.getTime()) d1 = null;
    var t1 = (raw.kv["次々回テーマ"] || raw.kv["次回テーマ"] || "").toString().trim();
    var f1 = (raw.kv["次々回開催形式"] || "").toString().trim();
    schedule[0] = { slot:"次回", date: d0 ? cfg["eventId"] : "", dateLabel: d0 ? cfg["開催日"] : "",
                    format: (raw.kv["開催形式"] || "").toString().trim(), theme: (raw.kv["テーマ"] || "").toString().trim() };
    schedule[1] = { slot:"次々回", date: d1 ? Utilities.formatDate(d1, "Asia/Tokyo", "yyyy-MM-dd") : "", dateLabel: d1 ? formatJpDate_(d1) : "",
                    format: FORMAT_OPTIONS.indexOf(f1) !== -1 ? f1 : "", theme: t1 === "調整中" ? "" : t1 };
  }
  cfg.schedule = schedule;
  return cfg;
}

// 値（Date型/文字列）を Date に変換。失敗時は null
function parseDate_(val) {
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  if (val) {
    var m = val.toString().trim().match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (m) return new Date(parseInt(m[1],10), parseInt(m[2],10) - 1, parseInt(m[3],10));
  }
  return null;
}

// 「2026年5月22日（金）」形式に整形
function formatJpDate_(dateObj) {
  var days = ["日", "月", "火", "水", "木", "金", "土"];
  return Utilities.formatDate(dateObj, "Asia/Tokyo", "yyyy年M月d日") + "（" + days[dateObj.getDay()] + "）";
}

// 申込一覧シートのセットアップ（チェックボックスなし）
function setupMasterSheet_(sheet) {
  sheet.appendRow(MASTER_COLS);
  sheet.getRange(1, 1, 1, MASTER_COLS.length)
       .setFontWeight("bold").setBackground("#5F6368").setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); // 申込日時
  sheet.setColumnWidth(2, 160); // 開催ID
  sheet.setColumnWidth(3, 90);  // 参加方法
  sheet.setColumnWidth(4, 120); // お名前
  sheet.setColumnWidth(5, 200); // メール
  sheet.setColumnWidth(6, 130); // 電話
  sheet.setColumnWidth(7, 160); // 店舗名
  sheet.setColumnWidth(8, 160); // 流入経路
  sheet.setColumnWidth(9, 200); // 備考
  sheet.setColumnWidth(10, 240); // 同意項目（オンライン参加時のみ埋まる）
}

// 開催別シートのセットアップ（チェックボックスあり）
function setupEventSheet_(sheet) {
  sheet.appendRow(EVENT_COLS);
  sheet.getRange(1, 1, 1, EVENT_COLS.length)
       .setFontWeight("bold").setBackground("#34A853").setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  // A列：手動入力用チェックボックス30行分
  sheet.getRange(2, 1, 30, 1).insertCheckboxes();
  sheet.setColumnWidth(1, 40);  // ✓
  sheet.setColumnWidth(2, 160); // 申込日時
  sheet.setColumnWidth(3, 160); // 開催ID
  sheet.setColumnWidth(4, 90);  // 参加方法
  sheet.setColumnWidth(5, 120); // お名前
  sheet.setColumnWidth(6, 200); // メール
  sheet.setColumnWidth(7, 130); // 電話
  sheet.setColumnWidth(8, 160); // 店舗名
  sheet.setColumnWidth(9, 160); // 流入経路
  sheet.setColumnWidth(10, 200); // 備考
  sheet.setColumnWidth(11, 240); // 同意項目（オンライン参加時のみ埋まる）
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
