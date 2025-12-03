#!/bin/bash
# IPythonカーネルランチャーのラッパースクリプト
# 環境変数を設定してからカーネルを起動

# IPYTHONDIR環境変数を設定
export IPYTHONDIR=/backend/.ipython

# デバッグモードの判定（環境変数で制御可能）
if [ "${ENV}" = "development" ] || [ "${DEBUG_STARTUP}" = "true" ]; then
    # デバッグ情報を出力
    echo "[Kernel Launcher] IPYTHONDIR: $IPYTHONDIR" >&2
    echo "[Kernel Launcher] Starting IPython kernel..." >&2
fi

# IPythonカーネルを起動
exec python -m ipykernel_launcher "$@"

