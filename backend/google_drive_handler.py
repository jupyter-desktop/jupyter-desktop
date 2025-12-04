# -*- coding: utf-8 -*-
"""
Google Driveダウンロードハンドラー

【役割】
- Google DriveからファイルをダウンロードするTornadoハンドラーの実装
- ダウンロードしたファイルをJSONとしてフロントエンドに返す

【責務の境界】
- Google Driveからのファイルダウンロードのみを担当
- ファイルIDを受け取り、ダウンロードして返す（ファイルIDの抽出は行わない）
- ファイル形式の検証は行わない（フロントエンドで行う）
- 拡張機能の登録は行わない（google_drive_extension.pyが担当）
"""
from jupyter_server.base.handlers import APIHandler
from tornado import web
import requests
import sys


class GoogleDriveDownloadHandler(APIHandler):
    """Google Driveからファイルをダウンロードするエンドポイント"""
    
    def set_default_headers(self):
        """CORSヘッダーを設定"""
        super().set_default_headers()
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def prepare(self):
        """リクエスト処理前にCORSヘッダーを設定（確実に設定されるように）"""
        super().prepare()
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
    
    def write_error(self, status_code, **kwargs):
        """エラーレスポンスにもCORSヘッダーを設定"""
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
        super().write_error(status_code, **kwargs)
    
    def options(self):
        """OPTIONSリクエストのハンドリング（CORSプリフライトリクエスト用）"""
        # OPTIONSリクエストは認証不要で処理
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.set_header('Access-Control-Allow-Headers', 'Content-Type')
        self.set_status(204)
        self.finish()
    
    def get(self):
        """
        Google Driveからファイルをダウンロードする
        
        クエリパラメータ:
        - file_id: Google DriveのファイルID（必須）
        
        レスポンス:
        - 成功時: ファイルの内容（JSON形式）
        - エラー時: HTTPエラーレスポンス
        """
        # 認証チェック（開発環境ではスキップ可能）
        # 本番環境では認証が必要な場合は @web.authenticated デコレータを使用
        # 開発環境では認証が無効化されているため、手動でチェックしない
        
        file_id = self.get_argument('file_id', None)
        if not file_id:
            raise web.HTTPError(400, reason="file_id parameter is required")
        
        try:
            # Google Driveからファイルをダウンロード
            download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            response = requests.get(download_url, allow_redirects=True, timeout=30)
            response.raise_for_status()
            
            # 警告ページのチェック（HTMLが返された場合）
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/html' in content_type:
                # 警告ページの場合はconfirm=tパラメータを追加して再リクエスト
                download_url = f"https://drive.google.com/uc?export=download&id={file_id}&confirm=t"
                response = requests.get(download_url, allow_redirects=True, timeout=30)
                response.raise_for_status()
                
                # それでもHTMLが返される場合はエラー
                content_type = response.headers.get('Content-Type', '').lower()
                if 'text/html' in content_type:
                    raise web.HTTPError(500, reason="Failed to download file: Warning page could not be bypassed")
            
            # JSONとして返す
            self.set_header('Content-Type', 'application/json')
            self.write(response.text)
        except web.HTTPError:
            # HTTPエラーはそのまま再発生
            raise
        except requests.exceptions.Timeout:
            raise web.HTTPError(504, reason="Request timeout: File download took too long")
        except requests.exceptions.RequestException as e:
            raise web.HTTPError(500, reason=f"Failed to download file: {str(e)}")
        except Exception as e:
            # 予期しないエラーをキャッチ
            import traceback
            error_traceback = traceback.format_exc()
            print(f'[Google Drive Handler] 予期しないエラー: {e}', file=sys.stderr)
            print(f'[Google Drive Handler] トレースバック: {error_traceback}', file=sys.stderr)
            raise web.HTTPError(500, reason=f"Internal server error: {str(e)}")

