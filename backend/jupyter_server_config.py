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
    'ipyflow': True,
    'jupyter_server_extensions': True  # カスタム拡張機能を有効化
}

# ログレベルの設定（環境変数で制御可能）
# デフォルトはINFO、ENV=developmentの場合はDEBUG
log_level = os.environ.get('LOG_LEVEL', 'INFO' if os.environ.get('ENV') != 'development' else 'DEBUG')
c.Application.log_level = log_level
c.ServerApp.log_level = log_level

# IPythonカーネルの環境変数を設定
# IPythonカーネルがstartupスクリプトを実行するために必要
import os
import sys
from pathlib import Path

# デバッグモードの判定（環境変数で制御可能）
DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'

# IPYTHONDIR環境変数を取得（run.pyで設定される）
ipython_dir = os.environ.get('IPYTHONDIR', None)

# カスタムカーネル設定のパスを設定
# backend/.ipython/kernels/python3/kernel.json を使用
if ipython_dir:
    kernel_spec_manager_class = 'jupyter_client.kernelspec.KernelSpecManager'
    kernel_spec_dir = str(Path(ipython_dir) / 'kernels')
    
    # KernelSpecManagerの設定
    c.KernelSpecManager.kernel_spec_manager_class = kernel_spec_manager_class
    c.KernelSpecManager.whitelist = {'python3'}  # カスタムカーネルのみを許可
    
    if DEBUG:
        print(f'[Jupyter Server] カスタムカーネル設定ディレクトリ: {kernel_spec_dir}')
        print(f'[Jupyter Server] IPYTHONDIR: {ipython_dir}')
    
    # Jupyter Server 2.x では MappingKernelManager を使用
    c.MappingKernelManager.default_kernel_name = 'python3'
    
    # カーネルマネージャーのルートディレクトリを設定
    # これにより、カーネルがIPYTHONDIRを正しく認識する
    c.MappingKernelManager.root_dir = '/backend'
    
    if DEBUG:
        print(f'[Jupyter Server] MappingKernelManagerの設定が完了しました')
else:
    print(f'[Jupyter Server] 警告: IPYTHONDIRが設定されていません', file=sys.stderr)

