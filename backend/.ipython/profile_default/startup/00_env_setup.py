# -*- coding: utf-8 -*-
"""
環境変数設定スクリプト

このスクリプトは最初に実行され、IPythonカーネルの環境変数を確実に設定します。
"""
import os
import sys

# デバッグモードの判定（環境変数で制御可能）
DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'

# IPYTHONDIRが設定されているか確認
ipython_dir = os.environ.get('IPYTHONDIR', 'Not set')
if DEBUG:
    print(f"[00_env_setup] IPYTHONDIR: {ipython_dir}")
    print(f"[00_env_setup] Python version: {sys.version}")
    print(f"[00_env_setup] Python executable: {sys.executable}")

# 環境変数が設定されていない場合は警告
if ipython_dir == 'Not set':
    print("⚠️ 警告: IPYTHONDIRが設定されていません", file=sys.stderr)
    # Dockerコンテナ内の場合、デフォルトパスを設定
    default_ipython_dir = '/backend/.ipython'
    if os.path.exists(default_ipython_dir):
        os.environ['IPYTHONDIR'] = default_ipython_dir
        if DEBUG:
            print(f"[00_env_setup] IPYTHONDIRをデフォルトに設定: {default_ipython_dir}")
    else:
        print(f"[00_env_setup] デフォルトIPYTHONDIRが存在しません: {default_ipython_dir}", file=sys.stderr)
elif DEBUG:
    print(f"✓ IPYTHONDIRが正しく設定されています")

# startupディレクトリのパスを確認
startup_dir = os.path.join(ipython_dir, 'profile_default', 'startup')
if not os.path.exists(startup_dir):
    print(f"⚠️ startupディレクトリが存在しません: {startup_dir}", file=sys.stderr)
elif DEBUG:
    print(f"✓ startupディレクトリが存在します: {startup_dir}")
    # startupディレクトリ内のファイルをリスト表示
    try:
        files = sorted(os.listdir(startup_dir))
        print(f"  startupスクリプト: {', '.join(f for f in files if f.endswith('.py'))}")
    except Exception as e:
        print(f"  ⚠️ startupディレクトリの読み込みエラー: {e}", file=sys.stderr)

