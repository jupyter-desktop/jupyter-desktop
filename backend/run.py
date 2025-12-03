#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Jupyter Server 起動スクリプト

このスクリプトは Jupyter Server を起動します。
Jupyter Server は Jupyter Server Protocol (JSP) を実装しており、
以下の機能を提供します：
- WebSocket 通信（JSP準拠）
- カーネル管理 API
- セッション管理 API
- ipyflow 拡張機能の自動読み込み

カスタムエンドポイント（例：/healthz）が必要な場合は、
Jupyter Server 拡張として実装してください。
"""
import os
import sys
import argparse
from pathlib import Path

from jupyter_server.serverapp import ServerApp


def main():
    """Jupyter Server を起動する"""
    parser = argparse.ArgumentParser(description='Jupyter Server 起動スクリプト')
    parser.add_argument(
        '--port',
        type=int,
        default=int(os.environ.get('PORT', '8888')),
        help='サーバーのポート番号（デフォルト: 8888）'
    )
    parser.add_argument(
        '--host',
        type=str,
        default=os.environ.get('HOST', '127.0.0.1'),
        help='サーバーのホスト（デフォルト: 127.0.0.1）'
    )
    parser.add_argument(
        '--no-browser',
        action='store_true',
        help='ブラウザを自動的に開かない'
    )
    parser.add_argument(
        '--allow-root',
        action='store_true',
        help='root ユーザーでの実行を許可'
    )
    
    args, unknown = parser.parse_known_args()
    
    # 設定ファイルのパスを設定
    # Jupyter Server は現在の作業ディレクトリから jupyter_server_config.py を自動的に読み込む
    # backend/ ディレクトリから実行されることを前提とする
    backend_dir = Path(__file__).parent.absolute()
    config_file = backend_dir / 'jupyter_server_config.py'
    
    # デバッグモードの判定（環境変数で制御可能）
    DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'
    
    # IPythonプロファイルのパスを設定
    # IPythonカーネルがプロジェクトローカルのプロファイルを使用するように設定
    ipython_dir = backend_dir / '.ipython'
    if ipython_dir.exists():
        os.environ['IPYTHONDIR'] = str(ipython_dir)
        # JUPYTER_PATHも設定して、カスタムカーネル設定を読み込む
        jupyter_path = str(ipython_dir)
        os.environ['JUPYTER_PATH'] = jupyter_path
        if DEBUG:
            print(f'[Jupyter Server] IPythonディレクトリを設定: {ipython_dir}')
            print(f'[Jupyter Server] JUPYTER_PATHを設定: {jupyter_path}')
    
    # 設定ファイルが存在する場合、JUPYTER_CONFIG_DIR を設定して確実に読み込む
    if config_file.exists():
        # JUPYTER_CONFIG_DIR を設定（Jupyter Server はこのディレクトリから jupyter_server_config.py を読み込む）
        os.environ['JUPYTER_CONFIG_DIR'] = str(backend_dir)
        if DEBUG:
            print(f'[Jupyter Server] 設定ファイルを読み込みます: {config_file}')
            print(f'[Jupyter Server] JUPYTER_CONFIG_DIR: {backend_dir}')
    else:
        print(f'[Jupyter Server] 警告: 設定ファイルが見つかりません: {config_file}', file=sys.stderr)
    
    # ServerApp に渡す引数を構築
    server_args = [
        '--port', str(args.port),
        '--ip', args.host,
    ]
    
    if args.no_browser:
        server_args.append('--no-browser')
    
    if args.allow_root:
        server_args.append('--allow-root')
    
    # 環境変数から追加の設定を読み込む
    if os.environ.get('ENV') == 'development':
        server_args.extend([
            '--debug',
        ])
    
    # 残りの引数を追加
    server_args.extend(unknown)
    
    # 起動情報をログに出力
    if DEBUG:
        print(f'[Jupyter Server] 起動中...')
        print(f'[Jupyter Server] ホスト: {args.host}, ポート: {args.port}')
        print(f'[Jupyter Server] 引数: {" ".join(server_args)}')
    
    # sys.argv を一時的に置き換えて ServerApp を起動
    original_argv = sys.argv
    try:
        sys.argv = ['jupyter-server'] + server_args
        ServerApp.launch_instance()
    except Exception as e:
        print(f'[Jupyter Server] 起動エラー: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
    finally:
        sys.argv = original_argv


if __name__ == '__main__':
    main()

