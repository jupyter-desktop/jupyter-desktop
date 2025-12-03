# -*- coding: utf-8 -*-
"""
IPython設定ファイル

このファイルはIPythonプロファイルの設定を定義します。
startupスクリプトが確実に実行されるように設定します。
"""

from traitlets.config import get_config

c = get_config()

# IPythonプロファイルのパスは環境変数IPYTHONDIRで設定されます
# startupスクリプトの実行を有効化（デフォルトで有効だが明示的に設定）
c.InteractiveShellApp.exec_files = []

# ログレベルの設定（デバッグ用）
c.Application.log_level = 'INFO'

