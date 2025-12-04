# Google Driveからipynbを開く機能の実装

## 概要

URLパラメータ `?ipynb=<google drive url>` を受け取り、バックエンドサーバー経由でGoogle Driveの公開ファイルからipynbファイルをダウンロードし、localStorageに保存します。その後、既存のlocalStorage読み込み機能を利用してアプリ内で開く機能を追加します。各サービスの役割と責務の境界を明確に分離します。

**重要な前提**: ブラウザからの直接アクセスでは、Google Driveのファイルをダウンロードできません（CORS制限など）。そのため、バックエンドサーバー（Jupyter Server）経由でダウンロードする必要があります。

## 実装内容

### 1. バックエンド: Google Driveダウンロードエンドポイントの追加

- **ファイル**: `backend/jupyter_server_extensions.py` または新しい拡張モジュール

- **役割**: 
  - Jupyter Server拡張としてカスタムAPIエンドポイントを追加
  - Google Drive URLからファイルIDを抽出
  - バックエンドからGoogle Driveの公開ファイルをダウンロード
  - ダウンロードしたファイルをJSONとしてフロントエンドに返す

- **エンドポイント**: `GET /api/google-drive/download?file_id=<FILE_ID>`

- **実装方法**:
  - Jupyter Server拡張機能としてTornadoハンドラーを実装
  - Pythonの`requests`ライブラリを使用してGoogle Driveからダウンロード
  - 公開ファイルのダウンロードURL: `https://drive.google.com/uc?export=download&id=<FILE_ID>`
  - 警告ページ対応（大きなファイルやウイルススキャンが必要な場合）

- **責務の境界**:
  - Google Driveからのファイルダウンロードのみを担当
  - ファイル形式の検証は行わない（フロントエンドで行う）
  - URL解析はエンドポイントで行う（ファイルIDの抽出）
  - エラーハンドリング（ネットワークエラー、ファイルが見つからないなど）

- **必要な依存関係**:
  - `requests`ライブラリ（`backend/requirements.txt`に追加）

### 2. フロントエンド: GoogleDriveServiceの作成

- **ファイル**: `src/app/services/google-drive.service.ts` (新規作成)

- **役割**: 
  - Google Drive URLからファイルIDを抽出
  - バックエンドエンドポイントを呼び出してファイルをダウンロード
  - ダウンロードしたJSON文字列を返す

- **責務の境界**:
  - Google Drive URLの解析のみを担当
  - バックエンドAPIとの通信のみを担当
  - Notebook形式の検証は行わない（NotebookServiceが担当）
  - localStorageへの保存は行わない（NotebookServiceが担当）

- **主要メソッド**:
  - `extractFileId(gdriveUrl: string): string | null`: Google Drive URLからファイルIDを抽出
  - `downloadFile(fileId: string): Promise<string>`: バックエンド経由でファイルをダウンロードしてJSON文字列として返す

### 3. フロントエンド: URLパラメータ読み取りサービスの作成

- **ファイル**: `src/app/services/url-param.service.ts` (新規作成)

- **役割**:
  - ブラウザのURLパラメータの読み取り・操作
  - 特定のパラメータ（`ipynb`など）の取得
  - URLパラメータのデコード処理
  - URLパラメータのクリア（URL履歴の更新）

- **責務の境界**:
  - URLパラメータの読み取り・操作のみを担当（低レベルなユーティリティサービス）
  - パラメータの意味や処理は知らない（値の取得・操作のみ）
  - URLパラメータに基づく具体的な処理は他のサービスが担当
  - `window.location`と`URLSearchParams`を使用（`ActivatedRoute`は使用しない）

- **主要メソッド**:
  - `getParam(key: string): string | null`: 指定されたキーのパラメータ値を取得
  - `hasParam(key: string): boolean`: 指定されたキーのパラメータが存在するか確認
  - `clearParam(key: string): void`: 指定されたキーのパラメータをクリア（URL履歴を更新）

### 4. フロントエンド: NotebookServiceにメソッドを追加

- **ファイル**: `src/app/services/notebook/notebook.service.ts`

- **追加メソッド**: 
  - `saveNotebookToLocalStorage(notebookJson: string): Promise<void>`: Notebook形式のJSONを検証してlocalStorageに保存
  - `loadFromGoogleDrive(gdriveUrl: string): Promise<void>`: Google DriveからダウンロードしてlocalStorageに保存

- **役割（追加分）**:
  - Google Driveから取得したNotebook形式のJSONをlocalStorageに保存
  - Notebook形式のJSON文字列を検証してlocalStorageに保存（どこから来たかは問わない）

- **責務の境界（追加分）**:
  - Notebook形式のI/O処理のみを担当（既存の責務を維持）
  - Google DriveからのダウンロードはGoogleDriveServiceに委譲（NotebookServiceは取得済みのJSONを扱う）
  - URLパラメータの読み取りは行わない（UrlParamServiceが担当）
  - 処理フローの統合は行わない（UrlParamProcessingServiceが担当）

- **処理フロー（loadFromGoogleDrive内）**:
  1. GoogleDriveServiceを使ってファイルIDを抽出
  2. GoogleDriveServiceでバックエンド経由でファイルをダウンロード（JSON文字列として取得）
  3. `saveNotebookToLocalStorage()`でJSONを検証してlocalStorageに保存
  4. `FloatingWindow[]`への変換は既存の`loadFromLocalStorage()`が行う

### 5. フロントエンド: URLパラメータ処理専用サービスの作成

- **ファイル**: `src/app/services/url-param-processing.service.ts` (新規作成)

- **役割**:
  - URLパラメータに基づく処理フローの統合・オーケストレーション
  - アプリケーション初期化時のURLパラメータ処理の管理
  - 各サービスを組み合わせて処理を実行

- **責務の境界**:
  - 処理フローの統合・オーケストレーションのみを担当
  - URLパラメータの読み取りはUrlParamServiceに委譲
  - Google DriveからのダウンロードはNotebookServiceの`loadFromGoogleDrive()`に委譲
  - Notebook形式のI/O処理はNotebookServiceに委譲
  - 具体的な実装は知らない（各サービスの公開APIのみを使用）
  - ウィンドウの復元は行わない（FloatingWindowManagerComponentが担当）

- **主要メソッド**:
  - `processUrlParams(): Promise<void>`: URLパラメータをチェックし、存在する場合はGoogle DriveからダウンロードしてlocalStorageに保存

- **使用箇所**: `FloatingWindowManagerComponent`から呼び出し

### 6. フロントエンド: FloatingWindowManagerComponentでのサービス統合

- **ファイル**: `src/app/components/floating-window-manager.component.ts`

- **変更点**:
  - `UrlParamProcessingService`を注入
  - `ngAfterViewInit`で`UrlParamProcessingService.processUrlParams()`を呼び出す（URLパラメータの処理）
  - その後、既存の`initializeWindows()`を呼び出す（既存のlocalStorage読み込みが実行される）

- **責務の境界（変更点）**:
  - URLパラメータ処理の統合はUrlParamProcessingServiceに委譲
  - 処理フローの実行順序（URL処理 → localStorage読み込み）のみを管理

### 7. フロントエンド: HTTPクライアントの設定確認

- **ファイル**: `src/app/app.config.ts`

- **確認事項**: `provideHttpClient()`が既に設定されていることを確認（バックエンドAPIへのHTTPリクエストに必要）

- **バックエンドURLの解決**:
  - `PythonRuntimeService`と同様に、`environment.pythonBackendUrl`を使用
  - デフォルト: `http://localhost:8888`

## 実装の詳細

### バックエンド: Jupyter Server拡張の実装

#### カスタムエンドポイントハンドラーの実装

```python
# backend/google_drive_handler.py (新規作成)
from jupyter_server.base.handlers import APIHandler
from tornado import web
import requests
import re
from urllib.parse import urlparse, parse_qs

class GoogleDriveDownloadHandler(APIHandler):
    """Google Driveからファイルをダウンロードするエンドポイント"""
    
    @web.authenticated
    async def get(self):
        file_id = self.get_argument('file_id', None)
        if not file_id:
            raise web.HTTPError(400, reason="file_id parameter is required")
        
        try:
            # Google Driveからファイルをダウンロード
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            response = requests.get(download_url, allow_redirects=True, timeout=30)
            response.raise_for_status()
            
            # 警告ページのチェック（HTMLが返された場合）
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/html' in content_type:
                # 警告ページの場合はconfirm=tパラメータを追加して再リクエスト
                download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
                response = requests.get(download_url, allow_redirects=True, timeout=30)
                response.raise_for_status()
            
            # JSONとして返す
            self.set_header('Content-Type', 'application/json')
            self.write(response.text)
        except requests.exceptions.RequestException as e:
            raise web.HTTPError(500, reason=f"Failed to download file: {str(e)}")
```

#### 拡張機能の登録

```python
# backend/jupyter_server_extensions.py に追加
from .google_drive_handler import GoogleDriveDownloadHandler

def load_jupyter_server_extension(serverapp: ServerApp):
    # ... 既存のコード ...
    
    # Google Driveダウンロードエンドポイントを追加
    handlers = [
        (r"/api/google-drive/download", GoogleDriveDownloadHandler),
    ]
    serverapp.web_app.add_handlers(".*$", handlers)
```

### フロントエンド: Google Drive URLの形式対応

以下の形式に対応:

- `https://drive.google.com/file/d/<FILE_ID>/view`
- `https://drive.google.com/open?id=<FILE_ID>`
- `https://drive.google.com/uc?id=<FILE_ID>`
- 直接ファイルIDのみ（`<FILE_ID>`）

### バックエンド: Google Driveダウンロードの警告ページ対応

- 大きなファイルやウイルススキャンが必要な場合、HTMLの警告ページが返ることがある
- レスポンスの`Content-Type`を確認し、`text/html`の場合は`confirm=t`パラメータを追加して再リクエスト

### エラーハンドリング

#### バックエンド

- ファイルが見つからない場合（404エラー）
- ネットワークエラーの場合（タイムアウト、接続エラーなど）
- ファイルサイズ制限（大きなファイルのダウンロード時のタイムアウト）
- 無効なファイルIDの場合

#### フロントエンド

- バックエンドAPIへの接続エラー
- ネットワークエラー
- ファイル形式が不正な場合（Notebook形式でない）
- URLパラメータが不正な場合
- バックエンドサーバーが起動していない場合

## サービス間の責務分離の図

```
【バックエンド】
GoogleDriveDownloadHandler (Jupyter Server拡張)
  └─ Google Driveからのファイルダウンロード
  └─ HTTPエンドポイント: GET /api/google-drive/download

【フロントエンド】
UrlParamService (低レベルユーティリティ)
  └─ URLパラメータの読み取り・操作のみ

GoogleDriveService (Google Drive API通信)
  └─ URL解析・バックエンドAPI呼び出し
  └─ バックエンドエンドポイント: /api/google-drive/download

NotebookService (Notebook I/O)
  └─ Notebook形式の検証・localStorage保存
  └─ GoogleDriveServiceを利用してダウンロード

UrlParamProcessingService (統合・オーケストレーション)
  └─ UrlParamServiceでパラメータ取得
  └─ NotebookService.loadFromGoogleDrive()を呼び出し
  └─ 処理フローの統合管理

FloatingWindowManagerComponent (コンポーネント)
  └─ UrlParamProcessingService.processUrlParams()を呼び出し
  └─ その後、既存のinitializeWindows()でlocalStorage読み込み
```

## 実装順序

### バックエンド

1. **requirements.txtに依存関係を追加**
   - `requests>=2.31.0` を追加

2. **Google Driveダウンロードハンドラーの作成**
   - `backend/google_drive_handler.py` を新規作成
   - `GoogleDriveDownloadHandler`クラスを実装
   - 警告ページ対応の実装

3. **Jupyter Server拡張にハンドラーを登録**
   - `backend/jupyter_server_extensions.py` を修正
   - カスタムエンドポイントを登録

4. **バックエンドのテスト**
   - エンドポイントが正しく動作することを確認
   - エラーハンドリングが適切に機能することを確認

### フロントエンド

1. **GoogleDriveServiceの作成**
   - `src/app/services/google-drive.service.ts` を新規作成
   - URL解析とファイルID抽出の実装
   - バックエンドAPI呼び出しの実装

2. **URLParamServiceの作成**
   - `src/app/services/url-param.service.ts` を新規作成
   - `window.location`を使用したURLパラメータ読み取り

3. **NotebookServiceへのメソッド追加**
   - `saveNotebookToLocalStorage()`: Notebook形式のJSONを直接localStorageに保存
   - `loadFromGoogleDrive()`: Google DriveからダウンロードしてlocalStorageに保存

4. **UrlParamProcessingServiceの作成**
   - `src/app/services/url-param-processing.service.ts` を新規作成
   - URLパラメータチェック → Google Driveダウンロード → localStorage保存の処理を統合

5. **FloatingWindowManagerComponentでのサービス統合**
   - `UrlParamProcessingService.processUrlParams()`を呼び出し
   - その後、既存の`initializeWindows()`を呼び出す

6. **エラーハンドリングとユーザーフィードバックの追加**
   - バックエンドサーバーが起動していない場合のエラーメッセージ
   - ネットワークエラーの処理
   - ファイル形式が不正な場合のエラーメッセージ
   - タイムアウトの処理

## 技術的な詳細

### バックエンド: Google DriveファイルIDの抽出

Google Drive URLからファイルIDを抽出する方法:

1. `https://drive.google.com/file/d/<FILE_ID>/view` → `/file/d/` の後のIDを抽出
2. `https://drive.google.com/open?id=<FILE_ID>` → `id=` パラメータを抽出
3. `https://drive.google.com/uc?id=<FILE_ID>` → `id=` パラメータを抽出
4. 直接ファイルIDのみの場合 → そのまま使用

### バックエンド: 警告ページの検出

Google Driveは大きなファイルやウイルススキャンが必要な場合、HTMLの警告ページを返すことがあります。以下の方法で検出・対応:

1. レスポンスの`Content-Type`ヘッダーを確認
2. `text/html`の場合は警告ページと判断
3. `confirm=t`パラメータを追加して再リクエスト
4. それでもHTMLが返される場合はエラーとして処理

### フロントエンド: バックエンドURLの解決

`PythonRuntimeService`と同様に、環境変数からバックエンドURLを解決:

- `environment.pythonBackendUrl`が設定されている場合: その値を使用
- 設定されていない場合: `http://localhost:8888` を使用

### セキュリティ上の考慮事項

1. **バックエンドエンドポイントの認証**
   - Jupyter Serverの認証システムを使用（`@web.authenticated`デコレータ）
   - 開発環境では認証が無効化されているが、本番環境では認証が必要

2. **ファイルサイズ制限**
   - 大きなファイルのダウンロード時のタイムアウトを考慮
   - 必要に応じてファイルサイズ制限を設定

3. **エラーメッセージの漏洩防止**
   - 内部エラーの詳細をユーザーに表示しない
   - 適切なエラーメッセージを返す

## テスト計画

### バックエンド

1. **ユニットテスト**
   - Google Drive URLからファイルIDを抽出するテスト
   - 警告ページの検出と対応のテスト

2. **統合テスト**
   - エンドポイントが正しく動作することを確認
   - エラーハンドリングが適切に機能することを確認

### フロントエンド

1. **ユニットテスト**
   - GoogleDriveServiceのURL解析のテスト
   - UrlParamServiceのパラメータ読み取りのテスト

2. **統合テスト**
   - URLパラメータからGoogle Driveファイルをダウンロードして開くフローのテスト
   - エラーハンドリングのテスト

3. **E2Eテスト**
   - ブラウザでURLパラメータを指定してファイルが正しく開かれることを確認

