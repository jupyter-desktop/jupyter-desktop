import json
import urllib.request
import urllib.error
import os
import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

class kabusap:
    """
    kabuステーションAPI Client (Singleton)
    """
    
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(kabusap, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        # 既に初期化済みの場合はスキップ
        if hasattr(self, '_initialized'):
            return
            
        self.API_URL = "http://localhost:18080/kabusapi"
        self.api_key = ""
        self.headers = {}  # 初期化を確実にする
        self._initialized = True
        self.isEnable = self._set_token()
        if self.isEnable:
            self.headers = {
                'Content-Type': 'application/json',
                'X-API-KEY': self.api_key
            }

    def _set_token(self) -> bool:
        """
        APIトークンを取得
        
        正しく設定ファイルが作成されていれば、本コードを実行することで、APIトークンを取得することができます。
        「APIを使用する準備が完了しました。」と出力されれば、kabuステーションAPIをコールすることができるようになります！
        """
        api_password = os.getenv('KABUSAP_API_PASSWORD')
        
        # 環境変数が設定されていない場合はAPI呼び出しを行わない
        if not api_password:
            logger.warning("kabuステーションAPIの認証情報（KABUSAP_API_PASSWORD）が設定されていません。")
            return False
        
        # トークン取得
        try:
            obj = {'APIPassword': api_password}
            json_data = json.dumps(obj).encode('utf8')
            
            url = f'{self.API_URL}/token'
            req = urllib.request.Request(url, json_data, method='POST')
            req.add_header('Content-Type', 'application/json')
            
            with urllib.request.urlopen(req) as res:
                content = json.loads(res.read())
                # レスポンスからトークンを取得
                # レスポンス形式は {'ResultCode': 0, 'Token': '...'} の形式を想定
                if 'Token' in content:
                    self.api_key = content['Token']
                    logger.info("API使用の準備が完了しました。")
                    return True
                else:
                    logger.error(f"トークンの取得に失敗しました。レスポンス: {content}")
                    return False
        except urllib.error.HTTPError as e:
            error_content = json.loads(e.read().decode('utf-8'))
            logger.error(f"HTTPエラー: {e.code} - {error_content}")
            return False
        except Exception as e:
            logger.error(f"トークンの取得に失敗しました: {e}")
            return False

    def _refresh_token_if_needed(self) -> bool:
        """
        トークンが期限切れの場合は再取得する
        kabuステーションAPIのトークンは有効期限があるため、必要に応じて再取得する
        """
        # 現在の実装では、トークンが無効になった場合に再取得する
        # 必要に応じて、トークンの有効期限をチェックするロジックを追加可能
        if not self.api_key:
            logger.info("トークンが無効のため、再取得します。")
            return self._set_token()
        return True

