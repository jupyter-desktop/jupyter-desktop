# 🔧 開発環境のセットアップ

## 前提条件

- Node.js 18 以上
- Python 3.8 以上
- npm または yarn

## セットアップ手順

1. 依存関係のインストール
```powershell
npm install
```

2. バックエンドサーバーの起動
```powershell
npm run backend
```

   **注意**: 初回起動前に、Python の依存関係をインストールしてください：
   ```powershell
   cd backend
   pip install -r requirements.txt
   ```
   
   **接続設定**: バックエンドサーバーは `backend/jupyter_server_config.py` の設定を自動的に読み込みます。
   - CORS設定により、`localhost:4200` からのアクセスが許可されています
   - トークン認証は無効化されています（開発環境用）

3. フロントエンドの起動
```powershell
npm run serve
```

4. 開発モードでの起動（フロントエンド + バックエンド + Electron）
```powershell
npm run dev
```

# 📝 テストの実行

## 接続テスト

バックエンドとフロントエンドの接続をテストするには：

1. バックエンドサーバーを起動（別のターミナル）:
```powershell
npm run backend
```

2. フロントエンドを起動（別のターミナル）:
```powershell
npm run serve
```

3. ブラウザで `http://localhost:4200` を開き、開発者ツールのコンソールで接続ログを確認
   - `[PythonRuntime] カーネル作成成功` が表示されれば接続成功
   - CORS エラーが表示される場合は、`backend/jupyter_server_config.py` の設定を確認

## ユニットテスト
```powershell
npm test
```

## E2E テスト
```powershell
npx playwright test
```

# 🏗️ ビルド

## プロダクションビルド
```powershell
npm run build
```

## Electron アプリのビルド
```powershell
npm run build:electron
```

