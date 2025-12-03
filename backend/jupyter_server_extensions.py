# -*- coding: utf-8 -*-
"""
Jupyter Server 拡張機能

カーネル起動時に環境変数を確実に設定するための拡張機能
"""
import os
import sys
from jupyter_server.serverapp import ServerApp

# デバッグモードの判定（環境変数で制御可能）
DEBUG = os.environ.get('ENV') == 'development' or os.environ.get('DEBUG_STARTUP', '').lower() == 'true'


def _jupyter_server_extension_paths():
    """Jupyter Server拡張機能のパスを返す"""
    return [{
        'module': 'jupyter_server_extensions'
    }]


def load_jupyter_server_extension(serverapp: ServerApp):
    """
    Jupyter Server拡張機能を読み込む
    
    カーネル起動時に環境変数を確実に設定する
    """
    # IPYTHONDIR環境変数を取得
    ipython_dir = os.environ.get('IPYTHONDIR', None)
    
    if ipython_dir:
        if DEBUG:
            print(f'[Jupyter Server Extension] 拡張機能を読み込み中: IPYTHONDIR={ipython_dir}')
        
        # KernelManagerのpre_start_hookを設定
        # カーネル起動前に環境変数を設定
        original_pre_start_hook = None
        if hasattr(serverapp, 'kernel_manager'):
            km = serverapp.kernel_manager
            
            # 既存のpre_start_hookを保存
            if hasattr(km, 'pre_start_hook'):
                original_pre_start_hook = km.pre_start_hook
            
            # 新しいpre_start_hookを定義
            def set_kernel_env(kernel_manager, kernel_id):
                """カーネル起動前に環境変数を設定"""
                # 既存の環境変数をすべてコピー
                kernel_env = dict(os.environ)
                # IPYTHONDIRを確実に設定（上書き）
                kernel_env['IPYTHONDIR'] = ipython_dir
                # KernelManagerの環境変数として設定
                kernel_manager.env = kernel_env
                if DEBUG:
                    print(f'[Jupyter Server Extension] カーネル起動前の環境変数設定: IPYTHONDIR={ipython_dir}')
                
                # 既存のpre_start_hookを実行
                if original_pre_start_hook:
                    original_pre_start_hook(kernel_manager, kernel_id)
            
            # pre_start_hookを設定
            km.pre_start_hook = set_kernel_env
            if DEBUG:
                print(f'[Jupyter Server Extension] pre_start_hookを設定しました')
        
        # KernelManagerクラスのデフォルト環境変数を設定
        from jupyter_server.services.kernels.kernelmanager import AsyncMappingKernelManager
        # 既存の環境変数をすべてコピー
        default_env = dict(os.environ)
        default_env['IPYTHONDIR'] = ipython_dir
        AsyncMappingKernelManager.env = default_env
        if DEBUG:
            print(f'[Jupyter Server Extension] KernelManagerクラスのデフォルト環境変数を設定: IPYTHONDIR={ipython_dir}')
    else:
        print(f'[Jupyter Server Extension] 警告: IPYTHONDIRが設定されていません', file=sys.stderr)

