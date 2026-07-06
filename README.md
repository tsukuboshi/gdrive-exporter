# gdrive-exporter

Google Drive の指定フォルダからファイルを一括エクスポートする CLI ツール。

| Drive 上のファイル | エクスポート形式 |
| --- | --- |
| Google ドキュメント | Markdown (`.md`) |
| Google スプレッドシート | CSV (`.csv`) |
| Google スライド | PDF (`.pdf`) |
| その他のファイル（画像・PDF 等） | 元の形式のまま |

サブフォルダは再帰的に探索し、Drive のフォルダ構造をローカルにそのまま再現します。

## 前提条件

- Node.js >= 18
- pnpm（ソースからビルドする場合）

## セットアップ

### 1. Google Cloud プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) でプロジェクトを作成（既存でも可）
2. 以下の API を有効化する
   - **Google Drive API**（必須）
   - **Google Docs API**（`--all-tabs` / ドキュメントタブ機能を使う場合）
   - **Google Sheets API**（`--all-sheets` を使う場合）
3. 「API とサービス > 認証情報」で **OAuth クライアント ID（デスクトップアプリ）** を作成
4. JSON をダウンロードし、以下のいずれかに `credentials.json` として配置（上から順に探索）
   1. `--credentials <path>` で明示指定したパス
   2. 環境変数 `GDRIVE_CREDENTIALS_PATH` のパス
   3. カレントディレクトリの `./credentials.json`
   4. `~/.local/share/gdrive-exporter/credentials.json`

> **テストモードの注意**: OAuth 同意画面が「テスト」ステータスの場合、テストユーザーに自分のアカウントを追加してください。また、テストモードのリフレッシュトークンは **7 日で失効**するため、7 日ごとに `auth` コマンドでの再認証が必要です。

### 2. インストールと認証

```sh
git clone <repository-url>
cd gdrive-exporter
pnpm install
pnpm build

# ブラウザが開き、Google アカウントで認証（credentials.json は自動探索）
node bin/run.js auth
```

トークンは `~/.gdrive-exporter/token.json` に保存され、次回以降は自動的にリフレッシュされます。

以降の例では `gdrive-exporter` コマンドとして表記します。ソースから実行する場合は `node bin/run.js` に読み替えるか、`pnpm link --global` でコマンドとして登録してください。

## 使い方

フォルダは **URL・ID のどちらでも** 指定できます。

```sh
# 全種別を一括エクスポート（デフォルトで ./gdrive-data に出力）
gdrive-exporter all "https://drive.google.com/drive/folders/xxxx"

# Google ドキュメントのみ Markdown で
gdrive-exporter docs <folder-id> -o ./docs-output

# スプレッドシートのみ CSV で（全シートを個別ファイルに）
gdrive-exporter sheets <folder-id> --all-sheets

# スライドのみ PDF で
gdrive-exporter slides <folder-id>

# 特定ファイルだけ上書きで再取得（--include + -f）
gdrive-exporter all <folder-id> --include "プロジェクト/振り返り*.md" -f
```

### コマンド一覧

```text
gdrive-exporter auth [--credentials <path>]
gdrive-exporter docs <folder> [-o <dir>] [-f] [-c <n>] [--credentials <path>] [--include <pattern>] [--all-tabs]
gdrive-exporter sheets <folder> [-o <dir>] [-f] [-c <n>] [--credentials <path>] [--include <pattern>] [--all-sheets]
gdrive-exporter slides <folder> [-o <dir>] [-f] [-c <n>] [--credentials <path>] [--include <pattern>]
gdrive-exporter all <folder> [-o <dir>] [-f] [-c <n>] [--credentials <path>] [--include <pattern>] [--all-sheets] [--all-tabs]
```

### 共通オプション

| オプション | 説明 | デフォルト |
| --- | --- | --- |
| `-o, --output <dir>` | 出力先ディレクトリ | `./gdrive-data` |
| `-f, --force` | 既存ファイルを上書き | オフ（既存ファイルはスキップ） |
| `-c, --concurrency <n>` | 並列ダウンロード数 | 5 |
| `--credentials <path>` | credentials.json のパス | 自動探索（上記の探索順） |
| `--include <pattern>` | エクスポート対象を glob で絞り込み（複数指定可） | なし（全ファイル対象） |

### 対象の絞り込み（`--include`）

`--include` はエクスポート後のローカル相対パス（例: `プロジェクト/振り返り 06_29.md`）に対してマッチします。

- `*` はパス区切り（`/`）以外の任意文字、`**` は `/` を含む任意文字、`?` は任意の 1 文字
- パターンに `/` を含まない場合はファイル名のみでマッチ（`*.csv` は全サブフォルダの CSV にマッチ）
- 複数回指定でき、いずれかにマッチしたファイルが対象になります
- `-f` と組み合わせると「特定ファイルだけ上書きで再取得」ができます

### ドキュメントのタブ（`--all-tabs`）

タブ機能を使った Google ドキュメント（Gemini の議事メモなど）は、**デフォルトで最初のタブのみ**をエクスポートします。議事メモの「メモ」タブだけを取得し、「文字起こし」タブを除外する、といった使い方ができます。

`--all-tabs` を付けると全タブを `ファイル名_タブ名.md` として個別に保存します。

> タブ単位のエクスポートは Google の非公開 URL パラメータを利用しています（[参考記事](https://dev.to/googleworkspace/exporting-individual-tabs-from-google-docs-as-pdfs-2903)）。将来利用できなくなった場合は、警告を表示した上で全タブ連結のエクスポートにフォールバックします。

### シート（`--all-sheets`）

スプレッドシートは**デフォルトで最初のシートのみ** CSV 化します（Drive API の仕様）。`--all-sheets` を付けると Sheets API 経由で全シートを `ファイル名_シート名.csv` として個別に保存します。

## 挙動の補足

- 同名ファイルがフォルダ内に複数ある場合は `_1`, `_2` を付与します
- エクスポートに失敗したファイルはスキップして続行し、最後に失敗一覧を表示します
- レートリミット（403/429）は指数バックオフで自動リトライします
- Google 図形描画・フォーム・ショートカットなどエクスポート先形式がない Google ファイルは警告を出してスキップします
- `files.export` の 10MB 制限を超える巨大な Google ドキュメント等はエラーになります

## セキュリティ上の注意

- エクスポートされた CSV はスプレッドシートの内容をそのまま保持します。`=` などで始まるセルは Excel 等で開くと数式として評価されるため（CSV インジェクション）、**信頼できない共有スプレッドシートをエクスポートした CSV を表計算ソフトで開く際は注意**してください
- OAuth 認証は PKCE + state パラメータ付きのループバックフローで、トークンは `~/.gdrive-exporter/token.json`（パーミッション 600）に保存されます

## 開発

```sh
pnpm test          # vitest でユニットテスト
pnpm lint          # biome check --fix
pnpm build         # tsc
```

## License

MIT
