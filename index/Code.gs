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
const MASTER_COLS = ["申込日時","開催ID","お名前","メールアドレス","電話番号","店舗名・会社名","流入経路","ご質問・備考"];

// 開催別シートの列 — A列がチェックボックス
const EVENT_COLS  = ["✓","申込日時","開催ID","お名前","メールアドレス","電話番号","店舗名・会社名","流入経路","ご質問・備考"];

// 設定シートのデフォルト値（eventIdは開催日から自動生成されるため不要）
const DEFAULT_CONFIG = [
  ["タイトル",   "Googleマップ診断会＋勉強会"],
  ["キャッチコピー", "Googleマップ「お店の設定」を見直すだけで、来客数アップへの具体的改善策を無料診断します。"],
  ["開催日",     new Date(2026, 4, 22)],  // カレンダーで選択（月は0始まり）
  ["開催時間",   "14:00 〜 15:30"],
  ["所要時間",   "90分"],
  ["参加費",     "無料"],
  ["定員",       "10"],
  ["会場名",     "Café＆Bar ツボバル"],
  ["会場住所",   "（住所を入力）"],
  ["地図リンク", "https://maps.app.goo.gl/rYUED1nsaJ7CEat17"],
  ["地図埋込URL","https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d894.865614533331!2d127.6954395!3d26.2141591!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x34e569cb16dea07d%3A0x1a20f9f3ebacd842!2z44OE44Oc44OQ44OrQ2FmZe-8hkJhcg!5e0!3m2!1sja!2sjp!4v1778600875620!5m2!1sja!2sjp"],
  ["駐車場",     "先着4台店舗前 / 近隣コインパーキングあり（有料）"]
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
    .addItem("🔧 初期セットアップ（初回のみ）", "setupSheets")
    .addItem("⏰ リマインドトリガー設定",        "setupReminderTrigger")
    .addToUi();
}

// =============================================
// POST: フォーム申込み受信
// =============================================
function doPost(e) {
  try {
    var data    = JSON.parse(e.postData.contents);
    var eventId = (data.eventId || "_unknown").toString();
    var ss      = SpreadsheetApp.getActiveSpreadsheet();

    var dataRow = [
      new Date(),
      eventId,
      data.name     || "",
      data.email    || "",
      data.phone    || "",
      data.shopName || "",
      Array.isArray(data.source) ? data.source.join(", ") : (data.source || ""),
      data.note     || ""
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
function sortByName()     { sortSheet_(MASTER_SHEET, 3, true);  } // お名前

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

  // 設定シート
  var configSheet = ss.getSheetByName(CONFIG_SHEET);
  if (!configSheet) configSheet = ss.insertSheet(CONFIG_SHEET, 0);
  else configSheet.clearContents();
  configSheet.appendRow(["項目", "値"]);
  configSheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#4285F4").setFontColor("#FFFFFF");
  configSheet.setFrozenRows(1);
  DEFAULT_CONFIG.forEach(function(row) { configSheet.appendRow(row); });
  configSheet.setColumnWidth(1, 180);
  configSheet.setColumnWidth(2, 500);

  // 「開催日」セルをカレンダー入力に設定
  var cfgData = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 2).getValues();
  cfgData.forEach(function(row, i) {
    if (row[0] === "開催日") {
      var cell = configSheet.getRange(i + 2, 2);
      cell.setNumberFormat("yyyy/MM/dd");
      cell.setDataValidation(
        SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build()
      );
    }
  });

  // 申込一覧シート（累積ログ）
  var masterSheet = ss.getSheetByName(MASTER_SHEET);
  if (!masterSheet) masterSheet = ss.insertSheet(MASTER_SHEET, 1);
  if (masterSheet.getLastRow() === 0) setupMasterSheet_(masterSheet);

  ui.alert(
    "✅ セットアップ完了\n\n" +
    "「設定」シートに開催情報を入力してください。\n\n" +
    "【シートの使い分け】\n" +
    "・申込一覧 … 全開催の累積ログ（閲覧・並べ替え用）\n" +
    "・[eventId]タブ … A列✓で残席をindex.htmlに反映\n\n" +
    "【次回開催への切り替え】\n" +
    "設定シートの「eventId」を新しい値に変更するだけ。\n" +
    "次の申込みで新しいタブが自動生成されます。"
  );
}

// =============================================
// 申込み完了メール
// =============================================
function sendConfirmationEmail_(data, ss) {
  var config  = readConfig_(ss);
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
    "会　場　　：" + (config["会場名"]   || "") + "\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "当日はパソコンまたはタブレットをご持参ください。\n" +
    "Googleビジネスプロフィールにログインできる状態でお越しください。\n\n" +
    "開催3日前にリマインドメールをお送りします。\n\n" +
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
    var email = row[4]; // メールアドレス（E列）
    var name  = row[3]; // お名前（D列）
    if (!email) return;
    sendReminderEmail_(name, email, config);
  });
}

function sendReminderEmail_(name, email, config) {
  var subject = "【開催3日前】" + (config["タイトル"] || "Googleマップ診断会＋勉強会") + "のご案内";
  var body =
    name + " 様\n\n" +
    "いよいよ開催まであと3日となりました！\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n" +
    "開催日　：" + (config["開催日"]   || "") + "\n" +
    "時　間　：" + (config["開催時間"] || "") + "\n" +
    "会　場　：" + (config["会場名"]   || "") + "\n" +
    "住　所　：" + (config["会場住所"] || "") + "\n" +
    (config["地図リンク"] ? "地　図　：" + config["地図リンク"] + "\n" : "") +
    "━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "・パソコン、タブレット、またはスマートフォンをご持参ください\n" +
    "・Googleビジネスプロフィールにログインできる状態でお越しください\n\n" +
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

// お名前列（D列 = 4列目）が空の最初の行を返す
function nextDataRow_(sheet) {
  var nameCol = 4; // D列（✓=A, 申込日時=B, 開催ID=C, お名前=D）
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
  if (!sheet || sheet.getLastRow() < 2) return {};
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  var cfg  = {};
  rows.forEach(function(row) {
    var key = row[0] ? row[0].toString().trim() : "";
    if (!key) return;
    var val = row[1];

    if (key === "開催日") {
      // Date型・文字列型どちらでも eventId を導出
      var dateObj = null;
      if (val instanceof Date && !isNaN(val.getTime())) {
        dateObj = val;
      } else if (val) {
        var m = val.toString().trim().match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
        if (m) dateObj = new Date(parseInt(m[1],10), parseInt(m[2],10) - 1, parseInt(m[3],10));
      }
      if (dateObj) {
        var days = ["日", "月", "火", "水", "木", "金", "土"];
        cfg["開催日"]  = Utilities.formatDate(dateObj, "Asia/Tokyo", "yyyy年M月d日") + "（" + days[dateObj.getDay()] + "）";
        cfg["eventId"] = Utilities.formatDate(dateObj, "Asia/Tokyo", "yyyy-MM-dd");
      } else if (val) {
        cfg["開催日"] = val.toString();
      }
    } else {
      cfg[key] = val !== undefined ? val.toString() : "";
    }
  });
  return cfg;
}

// 申込一覧シートのセットアップ（チェックボックスなし）
function setupMasterSheet_(sheet) {
  sheet.appendRow(MASTER_COLS);
  sheet.getRange(1, 1, 1, MASTER_COLS.length)
       .setFontWeight("bold").setBackground("#5F6368").setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); // 申込日時
  sheet.setColumnWidth(2, 160); // 開催ID
  sheet.setColumnWidth(3, 120); // お名前
  sheet.setColumnWidth(4, 200); // メール
  sheet.setColumnWidth(5, 130); // 電話
  sheet.setColumnWidth(6, 160); // 店舗名
  sheet.setColumnWidth(7, 160); // 流入経路
  sheet.setColumnWidth(8, 200); // 備考
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
  sheet.setColumnWidth(4, 120); // お名前
  sheet.setColumnWidth(5, 200); // メール
  sheet.setColumnWidth(6, 130); // 電話
  sheet.setColumnWidth(7, 160); // 店舗名
  sheet.setColumnWidth(8, 160); // 流入経路
  sheet.setColumnWidth(9, 200); // 備考
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
