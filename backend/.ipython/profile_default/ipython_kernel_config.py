# -*- coding: utf-8 -*-
"""
IPythonカーネル設定ファイル

このファイルはIPythonカーネルの設定を定義します。
startupスクリプトが確実に実行されるように設定します。
"""

from traitlets.config import get_config
import os
import sys
from pathlib import Path

c = get_config()

# ログレベルの設定（環境変数で制御可能）
# デフォルトはINFO、ENV=developmentの場合はDEBUG
import os
log_level = os.environ.get('LOG_LEVEL', 'INFO' if os.environ.get('ENV') != 'development' else 'DEBUG')
c.Application.log_level = log_level

# デバッグモードの判定（環境変数で制御可能）
DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'

# IPythonプロファイルのパスを明示的に設定
ipython_dir = os.environ.get('IPYTHONDIR', None)
if ipython_dir:
    profile_dir = Path(ipython_dir) / 'profile_default'
    if profile_dir.exists():
        if DEBUG:
            print(f'[IPython Kernel Config] プロファイルディレクトリ: {profile_dir}')
        
        # startupディレクトリを確認
        startup_dir = profile_dir / 'startup'
        if not startup_dir.exists():
            print(f'[IPython Kernel Config] 警告: startupディレクトリが存在しません: {startup_dir}', file=sys.stderr)
        elif DEBUG:
            print(f'[IPython Kernel Config] startupディレクトリ: {startup_dir}')
    else:
        print(f'[IPython Kernel Config] 警告: プロファイルディレクトリが存在しません: {profile_dir}', file=sys.stderr)
else:
    print(f'[IPython Kernel Config] 警告: IPYTHONDIRが設定されていません', file=sys.stderr)

# InteractiveShellの設定
# exec_linesを使用して、起動時にカスタムコードを実行
# デバッグモードの場合のみ環境変数を出力
if DEBUG:
    c.InteractiveShellApp.exec_lines = [
        'import os',
        'print(f"[IPython Kernel] IPYTHONDIR: {os.environ.get(\'IPYTHONDIR\', \'Not set\')}")',
    ]
else:
    c.InteractiveShellApp.exec_lines = []

# startupスクリプトの実行を有効化（デフォルトで有効）
# exec_filesは空のリストにして、startupディレクトリのスクリプトを自動実行させる
c.InteractiveShellApp.exec_files = []

