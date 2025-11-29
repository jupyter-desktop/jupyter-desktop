# -*- coding: utf-8 -*-
"""
Jupyter Server 設定ファイル

このファイルは Jupyter Server の設定を定義します。
主な設定内容：
- CORS設定: Angular開発サーバー（localhost:4200）からのアクセスを許可
- トークン認証の無効化: 開発環境用
- XSRF保護の無効化: 開発環境用
"""

from traitlets.config import get_config

c = get_config()

# CORS設定: Angular開発サーバーからのアクセスを許可
# Jupyter Server 2.x では allow_origin は文字列またはリストをサポート
# ワイルドカード '*' を使用してすべてのオリジンを許可（開発環境用）
c.ServerApp.allow_origin = '*'
c.ServerApp.allow_credentials = True

# トークン認証の無効化（開発環境用）
# Jupyter Server 2.x では IdentityProvider.token を使用
c.IdentityProvider.token = ''
c.ServerApp.password = ''

# その他の開発環境向け設定
c.ServerApp.open_browser = False
c.ServerApp.disable_check_xsrf = True

# WebSocket接続の設定
# Jupyter Server 2.x では、WebSocket接続時に認証が必要な場合がある
# トークンが空の場合でも、WebSocket接続を許可する
c.ServerApp.allow_websocket_origin = ['*']

# ipyflow 拡張機能の有効化（既に ipyflow.json で設定されているが、念のため）
c.ServerApp.jpserver_extensions = {
    'ipyflow': True
}

# ログレベルの設定（デバッグ用）
c.Application.log_level = 'DEBUG'
# Jupyter Server の WebSocket ログを有効化
c.ServerApp.log_level = 'DEBUG'

