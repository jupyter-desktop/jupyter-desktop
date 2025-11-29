# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Jupyter Server backend
"""

import os
from pathlib import Path

# プロジェクトのルートディレクトリ（specファイルがあるディレクトリ）
backend_dir = Path(os.path.dirname(os.path.abspath(SPECPATH)))

# データファイルのリスト
datas = []
# Jupyter Server設定ファイル（存在する場合）
config_file = backend_dir / 'jupyter_server_config.py'
if config_file.exists():
    datas.append((str(config_file), '.'))

a = Analysis(
    ['run.py'],
    pathex=[str(backend_dir)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'jupyter_server',
        'jupyter_server.serverapp',
        'jupyter_client',
        'jupyter_core',
        'ipykernel',
        'tornado',
        'ipyflow',
        'ipyflow.core',
        'traitlets',
        'ipython',
        'ipywidgets',
        'nest_asyncio',
        'pyccolo',
        'dotenv',
        'debugpy',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='app',  # 出力ファイル名（Windows: app.exe, Linux/Mac: app）
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # コンソールウィンドウを表示（デバッグ用）
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

