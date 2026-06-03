# Googleマップ診断会＋勉強会 — 申込みLP

シンプル構成のセミナー申込みLPです。
**Netlify（静的ホスティング） × GAS（Webhook + 残席返却）× Googleスプレッドシート（自動タブ生成）** だけで運用できます。

---

## 📁 同梱ファイル

| ファイル | 役割 |
|---|---|
| `index.html` | Netlifyへデプロイする単一HTML（CSS/JSインライン） |
| `Code.gs` | GAS Web App。スプレッドシートへの書込みと残席返却を担当 |
| `README.md` | このセットアップ手順 |

---

## Aパート：初回セットアップ（1回だけ）

### ① スプレッドシート作成
1. https://drive.google.com にアクセス → **新規スプレッドシート**
2. URL から `/d/` と `/edit` の間の文字列（**シートID**）をコピー
   - 例：`https://docs.google.com/spreadsheets/d/【コレ】/edit`

### ② GAS設置
1. https://script.google.com → **新規プロジェクト**
2. 既存の `Code.gs` をすべて削除し、本プロジェクトの `Code.gs` をペースト
3. 先頭の `SHEET_ID = "ここにスプレッドシートIDを貼る"` を、①で控えたIDに差し替え
4. 保存（💾）
5. 右上「**デプロイ**」→「**新しいデプロイ**」→ 種類で「**ウェブアプリ**」を選択
6. 設定：
   - 実行するユーザー：**自分**
   - アクセスできるユーザー：**全員**
7. 「**デプロイ**」→ 表示された URL（`https://script.google.com/macros/s/.../exec`）を控える
   - 初回はGoogleアカウントの権限承認ダイアログが出るので、許可してください。

### ③ HTMLに反映
1. `index.html` を開く
2. 冒頭の `EVENT_CONFIG.gasUrl` を、②で控えた URL に書き換え

```js
gasUrl: "https://script.google.com/macros/s/XXXXX/exec",
```

### ④ Netlifyにデプロイ
1. https://app.netlify.com → **Sites** → **Add new site** → **Deploy manually**
2. `index.html` を含むフォルダをドラッグ＆ドロップ
3. 発行されたURLが**本番URL**

---

## Bパート：開催ごとの作業（毎回）

1. `index.html` の `EVENT_CONFIG` を編集
   - `eventId` を新しい開催IDに変更（例：`2026-05-22-cafeA`）
   - `title` / `date` / `time` / `venue` / `schedule` / `capacity` を更新
   - **残席数の更新は不要**（GASがスプレッドシートから自動取得）
2. Netlifyの該当サイト →「**Deploys**」タブを開く
3. フォルダをドラッグ＆ドロップ
4. 数秒で公開URLが更新されます

> ヒント：`eventId` をユニークなものにしておくと、スプレッドシート側に
> その回専用のタブが自動生成され、開催ごとのデータがきれいに分離されます。

---

## Cパート：データ確認・運用Tips

- **`_master` タブ**：全イベント横断の全申込
- **`{eventId}` タブ**：その回だけの申込（初回送信時に自動作成）
- **残席を手動で調整したい**：該当タブで該当行を削除すれば、残席が即時1名増えます
- **キャンセル管理**：行を削除するか、`cancelled` 等の列を任意で追加してフィルタ運用

### GASを更新した場合

GAS側のコードを変更した場合：

1. GASエディタで「**デプロイ**」→「**デプロイの管理**」
2. 鉛筆アイコン（編集）をクリック
3. バージョンで「**新しいバージョン**」を選択 → デプロイ
4. **URLは同じまま** なので、HTML側の修正は不要

### 残席APIの直接確認

ブラウザで以下にアクセスすると、JSONで現在の申込数を確認できます：

```
https://script.google.com/macros/s/XXXXX/exec?action=count&eventId=2026-04-17-tubobaru
```

レスポンス例：
```json
{ "ok": true, "eventId": "2026-04-17-tubobaru", "count": 3 }
```

→ 残席 = `EVENT_CONFIG.capacity` − `count`

---

## 🛠 トラブルシューティング

| 症状 | 対処 |
|---|---|
| 残席カードが「概算（取得失敗）」になる | `EVENT_CONFIG.gasUrl` の値、GASのアクセス権限「全員」、デプロイ済みかを確認 |
| 申込後に行が増えない | GASの実行ログ（GASエディタ →「実行数」）でエラーを確認。`SHEET_ID` の値が正しいか再確認 |
| eventIdタブが文字化け | 半角英数とハイフン（`-`）で構成すると安全 |
| no-cors のため送信成功判定がゆるい | スプレッドシートの行追加で実成功を確認。本番では `_master` をリアルタイム表示しておくのがおすすめ |

---

## 🎨 デザイン仕様（参考）

- ダークモード基調、`#0A0A0F` + シアン×バイオレットのアクセント
- Noto Sans JP / Inter / JetBrains Mono
- GSAP + ScrollTrigger / Lenis スムーススクロール / Lucide Icons
- `prefers-reduced-motion` 対応
- ヒーロー：パーティクル背景、スプリットテキスト、マグネティックCTA、残席カウントダウン
- 送信成功時：SVGチェック描画モーダル
- 満席時：SOLD OUTスタンプアニメーション
