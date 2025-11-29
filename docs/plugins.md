# プラグインシステム

## 概要

Jupyter Desktopでは、`plugin/`フォルダにプラグインを配置することで、フロントエンド（Angular）とバックエンド（Python）の両方で機能を拡張できます。

**重要な設計方針：**
- `plugin/`フォルダが存在する場合、自動的にプラグインが検出・ロードされます
- プラグインが0個でもアプリケーションは正常に動作します
- 既存のアプリケーションコード（`src/app`内）を変更せずにプラグインを追加できます

## ディレクトリ構造

```
plugin/
  frontend/
    plugins/
      your-plugin/          # フロントエンドプラグイン
        plugin.config.json  # プラグイン設定（必須）
        index.ts            # プラグインのエントリーポイント
        components/         # プラグイン固有のコンポーネント
        services/           # プラグイン固有のサービス
    themes/
      your-theme/           # カスタムテーマ
        theme.config.ts     # テーマ設定（必須）
  backend/
    your-plugin/            # バックエンドプラグイン
      __init__.py           # プラグインのエントリーポイント（必須）
```

## プラグインの自動検出

### フロントエンドプラグイン

ビルド時に`scripts/generate-plugin-config.ts`が実行され、以下の処理が行われます：

1. `plugin/frontend/plugins/`ディレクトリをスキャン
2. 各サブディレクトリ内の`plugin.config.json`を検出
3. `src/app/plugin/plugin-config.generated.ts`を自動生成
4. プラグインがアプリケーション起動時に自動的にロードされます

**プラグインが0個の場合：**
- エラーにならず、空配列が生成されます
- アプリケーションは通常通り起動します

### バックエンドプラグイン

現在、バックエンドプラグインシステムの実装は計画段階です。仕様は`plugin/README.md`に記載されています。

### カスタムテーマ

ビルド時に`plugin/frontend/themes/`ディレクトリをスキャンし、`theme.config.ts`を持つテーマを自動検出します。

## フロントエンドプラグイン

### プラグイン設定ファイル

各プラグインは`plugin.config.json`を必要とします：

```json
{
  "id": "your-plugin",
  "name": "Your Plugin",
  "version": "1.0.0",
  "apiVersion": "1.0.0",
  "entryPoint": "./plugin/frontend/plugins/your-plugin/index.ts",
  "dependencies": []
}
```

### プラグインインターフェース

プラグインのエントリーポイント（`index.ts`）では、以下のインターフェースを実装します：

```typescript
import { Plugin } from '../../../../src/app/plugin/plugin-loader.service';
import { Routes } from '@angular/router';
import { Provider } from '@angular/core';

const plugin: Plugin = {
  config: {
    id: 'your-plugin',
    name: 'Your Plugin',
    version: '1.0.0',
    apiVersion: '1.0.0',
    dependencies: []
  },
  initialize: async () => {
    // プラグインの初期化処理
  },
  activate: async () => {
    // プラグインの有効化処理
  },
  registerRoutes: () => {
    // 追加のルートを返す
    return [];
  },
  registerProviders: () => {
    // 追加のプロバイダーを返す
    return [];
  },
  registerOverlayComponents: () => {
    // オーバーレイコンポーネントを返す（例：ホーム画面）
    return [];
  },
  registerGlobalEventHandlers: () => {
    // グローバルイベントハンドラーを返す（例：Escキー）
    return [];
  },
  registerHooks: () => {
    // プラグインフックを返す
    return {};
  }
};

export default plugin;
```

### プラグインの機能

プラグインは以下の機能を提供できます：

- **ルート登録**: `registerRoutes()`で新しいルートを追加
- **サービス提供**: `registerProviders()`でAngularサービスを提供
- **フローティングウィンドウ**: `registerFloatingWindows()`で新しいウィンドウタイプを追加
- **オーバーレイコンポーネント**: `registerOverlayComponents()`で画面全体に表示されるコンポーネントを追加
- **グローバルイベントハンドラー**: `registerGlobalEventHandlers()`でキーボードイベントなどを処理
- **ライフサイクルフック**: `registerHooks()`でウィンドウ作成、セッション開始などのイベントを処理

### プラグインのロードプロセス

1. **ビルド時**:
   - `scripts/generate-plugin-config.ts`が実行され、プラグイン設定が自動生成されます
   - `npm run serve`や`npm run build`の前に自動的に実行されます

2. **アプリケーション起動時**:
   - `PluginLoaderService`が自動生成された設定ファイルを読み込みます
   - 各プラグインを順次ロードし、互換性チェックと依存関係チェックを実行します
   - プラグインが初期化・有効化されます

3. **実行時**:
   - プラグインが登録したルート、コンポーネント、イベントハンドラーが有効になります

## カスタムテーマ

### テーマ設定ファイル

各テーマは`theme.config.ts`を必要とします：

```typescript
import { ThemeConfig } from '@app/services/theme.service';

const theme: ThemeConfig = {
  id: 'your-theme',
  name: 'Your Theme',
  variables: {
    '--primary-color': '#60730D',
    '--background-color': '#0a0e1a',
    '--text-color': '#f5f5f5',
  },
  monacoTheme: {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0a0e1a',
    }
  }
};

export default theme;
```

### テーマの自動検出

ビルド時に`plugin/frontend/themes/`ディレクトリをスキャンし、`theme.config.ts`を持つテーマを自動検出します。

**テーマが0個の場合：**
- 公式テーマ（`src/app/themes/`）が使用されます

## プラグイン開発例

### ホーム画面プラグイン

`plugin/frontend/plugins/home-screen/`に実装例があります。このプラグインは：

- Escキーでホーム画面を表示/非表示
- ホーム画面コンポーネントを提供
- セーブ要求などの機能を提供

### バックエンドプラグイン（chart-plugin）

`plugin/backend/chart-plugin/`に実装例があります。このプラグインは：

- カーネル初期化時にchart関数を注入
- Pythonカーネルにカスタム機能を追加

## トラブルシューティング

### プラグインがロードされない

1. `plugin.config.json`が正しい形式か確認
2. ビルド前スクリプトが実行されているか確認（`npm run serve`または`npm run build`）
3. `src/app/plugin/plugin-config.generated.ts`が生成されているか確認
4. ブラウザのコンソールでエラーメッセージを確認

### プラグインが0個でもビルドできるか？

**はい、正常にビルドできます。** プラグインが存在しない場合でも、空配列が生成され、アプリケーションは正常に起動します。

### テーマが適用されない

1. `theme.config.ts`が正しい形式か確認
2. ビルド前スクリプトが実行されているか確認
3. `src/app/plugin/theme-config.generated.ts`が生成されているか確認
4. CSS変数が正しく設定されているか確認

## 参考資料

詳細な仕様については、`plugin/README.md`を参照してください。

