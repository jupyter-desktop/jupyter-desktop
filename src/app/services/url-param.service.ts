import { Injectable } from '@angular/core';
import { NotebookService } from './notebook/notebook.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

/**
 * UrlParamProcessingService
 * 
 * 【役割】
 * - URLパラメータに基づく処理フローの統合・オーケストレーション
 * - アプリケーション初期化時のURLパラメータ処理の管理
 * - 各サービスを組み合わせて処理を実行
 * 
 * 【責務の境界】
 * - 処理フローの統合・オーケストレーションのみを担当
 * - URLパラメータの読み取りはUrlParamServiceに委譲
 * - Google DriveからのダウンロードはNotebookServiceのloadFromGoogleDrive()に委譲
 * - Notebook形式のI/O処理はNotebookServiceに委譲
 * - 具体的な実装は知らない（各サービスの公開APIのみを使用）
 * - ウィンドウの復元は行わない（FloatingWindowManagerComponentが担当）
 */
@Injectable({
  providedIn: 'root'
})
export class UrlParamProcessingService {
  constructor(
    private urlParamService: UrlParamService,
    private notebookService: NotebookService
  ) {}

  /**
   * URLパラメータをチェックし、存在する場合はGoogle DriveからダウンロードしてlocalStorageに保存
   * 
   * 【処理フロー】
   * 1. URLパラメータ`ipynb`をチェック
   * 2. パラメータが存在する場合、Google Drive URLとして処理
   * 3. NotebookService.loadFromGoogleDrive()を呼び出してダウンロードと保存
   * 4. 処理完了後、URLパラメータをクリア（URL履歴を更新）
   * 
   * @throws ダウンロードに失敗した場合、またはNotebook形式が無効な場合
   */
  async processUrlParams(): Promise<void> {
    // URLパラメータ`ipynb`をチェック
    const ipynbParam = this.urlParamService.getParam('ipynb');
    
    if (!ipynbParam) {
      // パラメータが存在しない場合は何もしない
      return;
    }

    try {
      // Google DriveからダウンロードしてlocalStorageに保存
      await this.notebookService.loadFromGoogleDrive(ipynbParam);
      
      // 処理完了後、URLパラメータをクリア（URL履歴を更新）
      this.urlParamService.clearParam('ipynb');
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || '不明なエラー';
      console.error('URLパラメータ処理中にエラーが発生しました:', error);
      throw new Error(`Google Driveからのファイル読み込みに失敗しました: ${errorMessage}`);
    }
  }
}

/**
 * UrlParamService
 * 
 * 【役割】
 * - ブラウザのURLパラメータの読み取り・操作
 * - 特定のパラメータ（`ipynb`など）の取得
 * - URLパラメータのデコード処理
 * - URLパラメータのクリア（URL履歴の更新）
 * 
 * 【責務の境界】
 * - URLパラメータの読み取り・操作のみを担当（低レベルなユーティリティサービス）
 * - パラメータの意味や処理は知らない（値の取得・操作のみ）
 * - URLパラメータに基づく具体的な処理は他のサービスが担当
 * - `window.location`と`URLSearchParams`を使用（`ActivatedRoute`は使用しない）
 */
@Injectable({
  providedIn: 'root'
})
export class UrlParamService {
  /**
   * 指定されたキーのパラメータ値を取得する
   * 
   * @param key パラメータキー
   * @returns パラメータ値（存在しない場合はnull）
   */
  getParam(key: string): string | null {
    if (typeof window === 'undefined' || !window.location) {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  }

  /**
   * 指定されたキーのパラメータが存在するか確認する
   * 
   * @param key パラメータキー
   * @returns パラメータが存在する場合はtrue
   */
  hasParam(key: string): boolean {
    return this.getParam(key) !== null;
  }

  /**
   * 指定されたキーのパラメータをクリアする（URL履歴を更新）
   * 
   * @param key パラメータキー
   */
  clearParam(key: string): void {
    if (typeof window === 'undefined' || !window.location || !window.history) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.has(key)) {
      params.delete(key);
      const newUrl = window.location.pathname + (params.toString() ? `?${params.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
  }
}


/**
 * GoogleDriveService
 * 
 * 【役割】
 * - Google Drive URLからファイルIDを抽出
 * - バックエンドエンドポイントを呼び出してファイルをダウンロード
 * - ダウンロードしたJSON文字列を返す
 * 
 * 【責務の境界】
 * - Google Drive URLの解析のみを担当
 * - バックエンドAPIとの通信のみを担当
 * - Notebook形式の検証は行わない（NotebookServiceが担当）
 * - localStorageへの保存は行わない（NotebookServiceが担当）
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {
  private readonly backendUrl = environment.pythonBackendUrl || 'http://localhost:8888';

  constructor(private http: HttpClient) {}

  /**
   * Google Drive URLからファイルIDを抽出する
   * 
   * 対応形式:
   * - https://drive.google.com/file/d/<FILE_ID>/view
   * - https://drive.google.com/open?id=<FILE_ID>
   * - https://drive.google.com/uc?id=<FILE_ID>
   * - 直接ファイルIDのみ（<FILE_ID>）
   * 
   * @param gdriveUrl Google DriveのURL
   * @returns ファイルID（抽出できない場合はnull）
   */
  extractFileId(gdriveUrl: string): string | null {
    if (!gdriveUrl) {
      return null;
    }

    // パターン1: https://drive.google.com/file/d/<FILE_ID>/view
    const filePattern = /\/file\/d\/([a-zA-Z0-9_-]+)/;
    const fileMatch = gdriveUrl.match(filePattern);
    if (fileMatch) {
      return fileMatch[1];
    }

    // パターン2: https://drive.google.com/open?id=<FILE_ID>
    // パターン3: https://drive.google.com/uc?id=<FILE_ID>
    try {
      const url = new URL(gdriveUrl);
      const idParam = url.searchParams.get('id');
      if (idParam) {
        return idParam;
      }
    } catch {
      // URL解析に失敗した場合は次のパターンを試す
    }

    // パターン4: 直接ファイルIDのみの場合
    if (/^[a-zA-Z0-9_-]+$/.test(gdriveUrl)) {
      return gdriveUrl;
    }

    return null;
  }

  /**
   * バックエンド経由でGoogle Driveからファイルをダウンロードする
   * 
   * @param fileId Google DriveのファイルID
   * @returns ダウンロードしたファイルのJSON文字列
   * @throws ダウンロードに失敗した場合
   */
  async downloadFile(fileId: string): Promise<string> {
    const url = `${this.backendUrl}/api/google-drive/download?file_id=${encodeURIComponent(fileId)}`;
    
    try {
      const response = await firstValueFrom(
        this.http.get(url, { responseType: 'text' })
      );
      return response;
    } catch (error: any) {
      if (error.status === 0) {
        throw new Error('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else if (error.status === 400) {
        throw new Error('ファイルIDが無効です。');
      } else if (error.status === 404) {
        throw new Error('ファイルが見つかりません。');
      } else if (error.status === 504) {
        throw new Error('ダウンロードがタイムアウトしました。ファイルが大きすぎる可能性があります。');
      } else if (error.status === 500) {
        throw new Error(`ダウンロードに失敗しました: ${error.error || error.message || '不明なエラー'}`);
      } else {
        throw new Error(`ダウンロードに失敗しました: ${error.message || '不明なエラー'}`);
      }
    }
  }
}

