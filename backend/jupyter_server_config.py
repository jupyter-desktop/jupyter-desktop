# -*- coding: utf-8 -*-
"""
Jupyter Server 設定ファイル

このファイルは Jupyter Server の設定を定義します。
主な設定内容：
- CORS設定: Angular開発サーバー（localhost:4200）からのアクセスを許可
- トークン認証の無効化: 開発環境用
- XSRF保護の無効化: 開発環境用
"""

import os
import sys
from pathlib import Path
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
# Jupyter Server 2.x では、allow_origin で WebSocket も制御される
# 上記で allow_origin = '*' を設定しているので、WebSocket も許可される

# backendディレクトリをPythonパスに追加（拡張機能を見つけるため）
backend_dir = Path(__file__).parent.absolute()
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# ipyflow 拡張機能の有効化（既に ipyflow.json で設定されているが、念のため）
# カスタム拡張機能も有効化
c.ServerApp.jpserver_extensions = {
    'ipyflow': True,
    'jupyter_server_extensions': True,  # カスタム拡張機能を有効化（Google Drive拡張機能も含む）
}

# デバッグ: 拡張機能の設定を確認
DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'
if DEBUG:
    print(f'[Jupyter Server Config] jpserver_extensions設定: {c.ServerApp.jpserver_extensions}', file=sys.stderr)
    # モジュールがインポート可能か確認
    try:
        import jupyter_server_extensions
        print(f'[Jupyter Server Config] jupyter_server_extensionsモジュールのインポートに成功', file=sys.stderr)
    except ImportError as e:
        print(f'[Jupyter Server Config] jupyter_server_extensionsモジュールのインポートに失敗: {e}', file=sys.stderr)

# ログレベルの設定（環境変数で制御可能）
# デフォルトはINFO、ENV=developmentの場合はDEBUG
log_level = os.environ.get('LOG_LEVEL', 'INFO' if os.environ.get('ENV') != 'development' else 'DEBUG')
c.Application.log_level = log_level
c.ServerApp.log_level = log_level

# IPythonカーネルの環境変数を設定
# IPythonカーネルがstartupスクリプトを実行するために必要

# デバッグモードの判定（環境変数で制御可能）
# 上で既に定義されている場合は再定義しない
if 'DEBUG' not in locals():
    DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'

# IPYTHONDIR環境変数を取得（run.pyで設定される）
ipython_dir = os.environ.get('IPYTHONDIR', None)

# カスタムカーネル設定のパスを設定
# backend/.ipython/kernels/python3/kernel.json を使用
if ipython_dir:
    kernel_spec_dir = str(Path(ipython_dir) / 'kernels')
    
    # KernelSpecManagerの設定
    # jupyter_client 7.0+ では allowed_kernelspecs を使用
    c.KernelSpecManager.allowed_kernelspecs = {'python3'}  # カスタムカーネルのみを許可
    
    if DEBUG:
        print(f'[Jupyter Server] カスタムカーネル設定ディレクトリ: {kernel_spec_dir}')
        print(f'[Jupyter Server] IPYTHONDIR: {ipython_dir}')
    
    # Jupyter Server 2.x では MappingKernelManager を使用
    c.MappingKernelManager.default_kernel_name = 'python3'
    
    # カーネルマネージャーのルートディレクトリを設定
    # 現在の作業ディレクトリ（backend/）を使用
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    c.MappingKernelManager.root_dir = backend_dir
    
    if DEBUG:
        print(f'[Jupyter Server] MappingKernelManager root_dir: {backend_dir}')
        print(f'[Jupyter Server] MappingKernelManagerの設定が完了しました')
else:
    print(f'[Jupyter Server] 警告: IPYTHONDIRが設定されていません', file=sys.stderr)

