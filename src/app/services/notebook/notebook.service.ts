import { Injectable, inject } from '@angular/core';
import { ElectronService } from '../electron.service';
import { FloatingWindow } from '../floating-window-manager.service';
import { windowsToNotebook, notebookToWindows } from '../../utils/notebook-converter';
import { NotebookFile } from '../../models/notebook';
import { OutputService, RuntimeOutput } from '../python-runtime/output.service';

const LOCAL_STORAGE_KEY = 'jupyter:lastDesktop';

/**
 * NotebookService
 * 
 * 【役割】
 * - Notebook形式（.ipynb）での保存/読み込み
 * - ローカルストレージへの自動保存と復元
 * - Electron環境でのファイル保存/読み込み
 * - Notebook形式への変換（notebook-converterを使用）
 * - Notebook形式の検証
 * 
 * 【責務の境界】
 * - Notebook形式のI/O処理のみを担当
 * - ウィンドウの作成・削除・復元の管理はFloatingWindowManagerComponentが担当
 * - データ形式の変換はnotebook-converterが担当
 * - ファイルI/Oの実装はElectronServiceが担当
 */
@Injectable({
  providedIn: 'root'
})
export class NotebookService {
  private outputService = inject(OutputService);
  
  constructor(private electronService: ElectronService) {}

  /**
   * ウィンドウ情報をローカルストレージに保存します
   */
  async saveToLocalStorage(windows: FloatingWindow[]): Promise<void> {
    if (typeof window === 'undefined' || !window.localStorage) {
      alert('ローカルストレージが利用できないため、保存できません。');
      return;
    }

    try {
      if (windows.length === 0) {
        const shouldContinue = confirm('保存するウィンドウがありません。空の状態を保存しますか？');
        if (!shouldContinue) {
          return;
        }
      }

      // エディタIDから出力へのマップを作成
      const outputsByEditorId = new Map<string, RuntimeOutput[]>();
      for (const window of windows) {
        if ((window.type ?? 'editor') === 'editor') {
          const editorId = window.id;
          const outputs = this.outputService.getCurrentOutput(editorId);
          if (outputs.length > 0) {
            outputsByEditorId.set(editorId, outputs);
          }
        }
      }

      const notebook = windowsToNotebook(windows, {
        savedAt: new Date().toISOString(),
        version: '1.0',
        outputsByEditorId,
      });

      const jsonContent = JSON.stringify(notebook);
      window.localStorage.setItem(LOCAL_STORAGE_KEY, jsonContent);
      alert('現在の状態を保存しました。');
    } catch (error: any) {
      console.error('ローカル保存中にエラーが発生しました:', error);
      const errorMessage = error?.message ?? error?.toString() ?? '不明なエラー';
      alert(`ローカル保存に失敗しました:\n${errorMessage}`);
    }
  }

  /**
   * ローカルストレージからウィンドウ情報を復元します
   */
  async loadFromLocalStorage(): Promise<FloatingWindow[] | null> {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }

    const savedContent = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!savedContent) {
      return null;
    }

    try {
      const notebook: NotebookFile = JSON.parse(savedContent);
      if (!this.isValidNotebookFile(notebook)) {
        throw new Error('Notebook形式が正しくありません。');
      }

      const restoredWindows = notebookToWindows(notebook);
      console.log('ローカルストレージから前回の状態を復元しました。');
      return restoredWindows;
    } catch (error: any) {
      console.error('ローカルストレージからの復元に失敗しました:', error);
      const errorMessage = error?.message ?? error?.toString() ?? '不明なエラー';
      alert(`前回の状態を復元できませんでした:\n${errorMessage}`);
      
      // 破損したデータを削除
      try {
        window.localStorage.removeItem(LOCAL_STORAGE_KEY);
      } catch {
        // 削除に失敗しても処理を継続
      }
      return null;
    }
  }

  /**
   * Electron環境でウィンドウ情報をファイルに保存します
   */
  async saveToFile(windows: FloatingWindow[]): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (!this.electronService.isElectron) {
      return { success: false, error: 'Electron環境ではありません。保存機能は使用できません。' };
    }

    try {
      // ウィンドウが0個の場合は警告
      if (windows.length === 0) {
        const shouldContinue = confirm('保存するウィンドウがありません。空のファイルを保存しますか？');
        if (!shouldContinue) {
          return { success: false };
        }
      }

      // エディタIDから出力へのマップを作成
      const outputsByEditorId = new Map<string, RuntimeOutput[]>();
      for (const window of windows) {
        if ((window.type ?? 'editor') === 'editor') {
          const editorId = window.id;
          const outputs = this.outputService.getCurrentOutput(editorId);
          if (outputs.length > 0) {
            outputsByEditorId.set(editorId, outputs);
          }
        }
      }

      // Notebook形式に変換
      const notebook = windowsToNotebook(
        windows.map(window => ({ ...window })),
        {
          savedAt: new Date().toISOString(),
          version: '1.0',
          outputsByEditorId,
        }
      );

      // .ipynbとして出力
      const jsonContent = JSON.stringify(notebook, null, 2);

      // ElectronServiceを使ってファイルを保存
      const result = await this.electronService.saveFile(jsonContent);
      
      if (result.success) {
        console.log(`全てのウィンドウ情報を保存しました: ${result.filePath}`);
        return { success: true, filePath: result.filePath };
      } else if (result.error) {
        console.error(`保存エラー: ${result.error}`);
        return { success: false, error: result.error };
      } else {
        // キャンセルされた場合
        console.log('保存がキャンセルされました');
        return { success: false };
      }
    } catch (error: any) {
      console.error('保存処理中にエラーが発生しました:', error);
      const errorMessage = error?.message || error?.toString() || '不明なエラー';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Electron環境でファイルからウィンドウ情報を読み込みます
   */
  async loadFromFile(): Promise<{ success: boolean; windows?: FloatingWindow[]; error?: string }> {
    if (!this.electronService.isElectron) {
      return { success: false, error: 'Electron環境ではありません。読み込み機能は使用できません。' };
    }

    // ファイルを開く
    const result = await this.electronService.openFile();
    
    // キャンセルされた場合
    if (!result.success && !result.error) {
      // ユーザーがキャンセルした場合は何もしない
      return { success: false };
    }
    
    // エラーが発生した場合
    if (result.error) {
      console.error(`ファイル読み込みエラー: ${result.error}`);
      return { success: false, error: result.error };
    }
    
    // コンテンツが空の場合
    if (!result.content) {
      console.error('ファイルの内容が空です');
      return { success: false, error: 'ファイルの内容が空です' };
    }

    try {
      const notebook: NotebookFile = JSON.parse(result.content);
      if (!this.isValidNotebookFile(notebook)) {
        return { success: false, error: 'Notebookファイルの形式が正しくありません。' };
      }

      const restoredWindows = notebookToWindows(notebook);
      return { success: true, windows: restoredWindows };
    } catch (error: any) {
      console.error('ファイル読み込みエラー:', error);
      const errorMessage = error.message || error.toString() || '不明なエラー';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * データが有効なNotebookファイルかどうかを検証します
   */
  isValidNotebookFile(data: unknown): data is NotebookFile {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const notebook = data as Partial<NotebookFile>;
    return (
      typeof notebook.nbformat === 'number' &&
      Array.isArray(notebook.cells)
    );
  }
}




