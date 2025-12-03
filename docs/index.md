# 📚 Jupyter Desktop ドキュメント

## 📖 ドキュメント一覧

### 📋 プロジェクト概要

- **[プロジェクトの README](../README.md)**
  - プロジェクト概要
  - 技術スタック

### 🚀 はじめに

- **[開発環境のセットアップ](setup.md)**
  - 前提条件とセットアップ手順
  - テストの実行方法
  - ビルド手順

### 🔧 開発ガイド

- **[改修および開発が必要な項目](tasks.md)**
  - ipyflow との統合状況
  - Jupyter Server Protocol (JSP) の実装状況
  - 機能拡張の計画
  - パフォーマンス最適化の課題

### 📚 アーキテクチャ解説

- **[Jupyter カーネルとセッションのアーキテクチャ](kernel-session-architecture.md)**
  - カーネル起動とセッション確立の違い
  - IPyflowのReactive機能の動作単位
  - 複数フロントエンドインスタンス間での変数共有

- **[Jupyter カーネル起動時の自動初期化設定](JUPYTER_STARTUP_README.md)**
  - カーネル起動時の初期化スクリプトの詳細
  - `bt`変数と`get_stock_price`関数の自動初期化

## 🔗 関連リンク

