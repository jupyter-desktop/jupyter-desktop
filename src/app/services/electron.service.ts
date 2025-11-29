import { Injectable } from '@angular/core';

/**
 * ElectronService
 * 
 * 【役割】
 * - Electron環境とWeb環境の差異を吸収するアダプター
 * - ファイルの開く/保存ダイアログの提供
 * - 外部URLの開く処理（既定ブラウザまたは新規タブ）
 * - アプリケーション終了処理
 * - メニューコマンドの受信
 * 
 * 【責務の境界】
 * - Electron APIのラッパーとして機能（実装はElectron側）
 * - 環境判定（Electron/Web）のみを担当
 * - ファイル操作のUI（ダイアログ）はElectron側が提供
 * - 実際のファイルI/OはElectron側が担当
 */

// Electron API の型定義
interface ElectronAPI {
  openFile: () => Promise<{ success: boolean; content?: string; filePath?: string; error?: string; canceled?: boolean }>;
  saveFile: (content: string) => Promise<{ success: boolean; filePath?: string; error?: string; canceled?: boolean }>;
  getAppVersion: () => Promise<string>;
  openExternal: (url: string) => Promise<boolean>;
  exitApp: () => Promise<void>;
  onMenuCommand: (callback: (command: string) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  get isElectron(): boolean {
    return !!(window && window.electronAPI);
  }

  async openFile(): Promise<{ success: boolean; content?: string; filePath?: string; error?: string }> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return await window.electronAPI!.openFile();
  }

  async saveFile(content: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (!this.isElectron) {
      return { success: false, error: 'Not running in Electron' };
    }
    return await window.electronAPI!.saveFile(content);
  }

  async getAppVersion(): Promise<string> {
    if (!this.isElectron) {
      return 'N/A';
    }
    return await window.electronAPI!.getAppVersion();
  }

  async openExternal(url: string): Promise<boolean> {
    if (this.isElectron) {
      try {
        await window.electronAPI!.openExternal(url);
        return true;
      } catch {
        return false;
      }
    }
    window.open(url, '_blank', 'noopener');
    return true;
  }

  async exitApp(): Promise<boolean> {
    if (this.isElectron) {
      try {
        await window.electronAPI!.exitApp();
        return true;
      } catch {
        return false;
      }
    }

    window.location.reload();
    return true;
  }

  onMenuCommand(callback: (command: string) => void): void {
    if (this.isElectron) {
      window.electronAPI!.onMenuCommand(callback);
    }
  }
}

