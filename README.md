# <img src="https://raw.githubusercontent.com/botterYosuke/jupyter-desktop/main/public/favicon.drawio.svg" alt="jupyter-desktop Logo" width="40" height="24"> jupyter-desktop

JupyterLab + ipyflow で動作する Angular 製フロントエンドアプリケーション

## 📋 プロジェクト概要

このプロジェクトは、JupyterLab と ipyflow を統合したデスクトップアプリケーションです。Three.js を使用した 3D 空間にフローティングウィンドウを配置し、Python コードの実行環境を提供します。

### 技術スタック

- **フロントエンド**: Angular 18.2, TypeScript, Three.js, Monaco Editor
- **バックエンド**: Jupyter Server (Tornado + JSP), ipyflow
- **ビルドツール**: Angular CLI, Electron Builder
- **テスト**: Playwright (E2E), Jasmine/Karma (ユニットテスト)

詳細な開発環境のセットアップ、テストの実行、ビルド手順については、[docs/setup.md](docs/setup.md) を参照してください。
