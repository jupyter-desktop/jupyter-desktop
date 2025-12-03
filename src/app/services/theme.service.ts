import { Injectable } from '@angular/core';

/**
 * Monaco Editorのテーマ設定インターフェース
 * Monaco EditorのIStandaloneThemeDataに準拠
 */
export interface MonacoThemeConfig {
  base: 'vs' | 'vs-dark' | 'hc-black';  // ベーステーマ
  inherit: boolean;  // ベーステーマを継承するか
  rules?: Array<{
    token?: string;
    foreground?: string;
    background?: string;
    fontStyle?: string;
  }>;  // トークンルール（シンタックスハイライト用）
  colors?: {
    [key: string]: string;  // エディタの色設定（例: 'editor.background', 'editor.foreground'）
  };
}

/**
 * テーマ設定インターフェース
 */
export interface ThemeConfig {
  id: string;
  name: string;
  variables: {
    [key: string]: string;  // CSS変数のキーと値
  };
  styles?: string;  // 追加のSCSS/CSS（オプション）
  monacoTheme?: MonacoThemeConfig | string;  // Monaco Editorのテーマ設定（オプション）
  // stringの場合は、既存のMonaco Editorテーマ名（'vs', 'vs-dark', 'hc-black'など）
}

  /**
   * テーマ管理サービス
   * 
   * テーマの読み込み、適用、保存を管理します。
   * テーマの読み込みは以下の順序で試行されます：
   * 1. 公式テーマ（src/app/themes/${themeId}/theme.config.ts）
   */
@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private currentTheme: ThemeConfig | null = null;
  private readonly STORAGE_KEY = 'selectedTheme';
  private defaultThemeId: string | null = null;
  private monacoReadyPromise: Promise<void> | null = null;

  /**
   * テーマを読み込んで適用する
   * @param themeId テーマID
   */
  async loadTheme(themeId: string): Promise<void> {
    try {
      const theme = await this.loadThemeConfig(themeId);
      this.applyTheme(theme);
      this.currentTheme = theme;
      this.saveThemePreference(themeId);
    } catch (error) {
      console.error(`Failed to load theme: ${themeId}`, error);
      // エラー時はデフォルトテーマを試行
      if (this.defaultThemeId === null) {
        this.defaultThemeId = await this.determineDefaultTheme();
      }

      if (themeId !== this.defaultThemeId) {
        try {
          await this.loadTheme(this.defaultThemeId);
        } catch (fallbackError) {
          console.error('Failed to load default theme', fallbackError);
          // デフォルトテーマも読み込めない場合は、グローバルスタイルのデフォルト値を使用
          console.warn('Using default CSS variables from styles.scss');
        }
      } else {
        // デフォルトテーマの読み込みに失敗した場合も、グローバルスタイルのデフォルト値を使用
        console.warn('Using default CSS variables from styles.scss');
      }
    }
  }

  /**
   * 保存されたテーマ設定を読み込む
   */
  async loadSavedTheme(): Promise<void> {
    // デフォルトテーマを決定（まだ決定していない場合）
    if (this.defaultThemeId === null) {
      this.defaultThemeId = await this.determineDefaultTheme();
    }
    await this.loadTheme(this.defaultThemeId);
  }

  /**
   * デフォルトテーマを決定する
   * src/app/themes/フォルダ内の最初のテーマを返す
   */
  private async determineDefaultTheme(): Promise<string> {

    const officialThemes = await this.scanThemes('src/app/themes');
    if (officialThemes.length > 0) {
      return officialThemes[0];
    }

    // フォールバック（通常は発生しない）
    return 'jupyter-light-theme';
  }

  /**
   * 指定されたディレクトリ内のテーマをスキャンする
   * @param basePath スキャンするベースパス
   * @returns 見つかったテーマIDの配列
   */
  private async scanThemes(basePath: string): Promise<string[]> {
    const themes: string[] = [];

    try {
       // 公式テーマの場合は、既知のテーマ名のリストを使用
      // 公式テーマの既知の名前（src/app/themes/）
      // 動的インポートは開発環境で問題を起こす可能性があるため、既知のリストを使用
      const officialThemeNames = ['jupyter-light-theme'];
      
      // 公式テーマの場合は、既知のテーマ名を返す
      // 実際のテーマファイルの存在確認は、loadThemeConfig()で行う
      if (officialThemeNames.length > 0) {
        themes.push(officialThemeNames[0]);
      }
    } catch (error) {
      console.warn(`Failed to scan themes in ${basePath}:`, error);
    }

    return themes;
  }

  /**
   * テーマ設定を読み込む
   * @param themeId テーマID
   * @returns テーマ設定
   */
  private async loadThemeConfig(themeId: string): Promise<ThemeConfig> {
    // 方法1: 公式テーマから読み込む（src/app/themes/）
    try {
      // @ts-ignore - 動的インポートのパス解決を無視
      const module = await import(/* @vite-ignore */ `../themes/${themeId}/theme.config.ts`);
      return module.default;
    } catch (error) {
      console.warn(`Failed to load official theme: ${themeId}`, error);
    }
   
    // すべての方法が失敗した場合
    throw new Error(`Theme ${themeId} not found in official themes`);
  }

  /**
   * テーマを適用する
   * @param theme テーマ設定
   */
  applyTheme(theme: ThemeConfig): void {
    const root = document.documentElement;
    
    // CSS変数を動的に設定
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    
    // 追加スタイルがあれば動的に追加
    if (theme.styles) {
      const styleId = `theme-${theme.id}`;
      let styleElement = document.getElementById(styleId) as HTMLStyleElement;
      
      if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = styleId;
        document.head.appendChild(styleElement);
      }
      
      styleElement.textContent = theme.styles;
    }
    
    // Monaco Editorのテーマを適用（非同期、fire-and-forget）
    void this.applyMonacoTheme(theme);
  }

  /**
   * Monaco Editorのテーマを適用する
   * @param theme テーマ設定
   */
  private async applyMonacoTheme(theme: ThemeConfig): Promise<void> {
    // monaco-editorが読み込まれるまで待機
    await this.waitForMonaco();
    
    const w = window as any;
    
    // タイムアウト後もmonacoが読み込まれていない場合はスキップ
    if (!w.monaco || !w.monaco.editor) {
      console.warn('[ThemeService] Monaco Editor not available, skipping theme application');
      return;
    }
    
    const monacoTheme = theme.monacoTheme;
    
    if (!monacoTheme) {
      // Monaco Editorテーマが指定されていない場合は、背景色から推測
      const bgColor = theme.variables['--bg-canvas'] || theme.variables['--bg-primary'] || '';
      const isDark = this.isDarkColor(bgColor);
      const defaultTheme = isDark ? 'vs-dark' : 'vs';
      w.monaco.editor.setTheme(defaultTheme);
      return;
    }
    
    // 文字列の場合は既存のテーマ名として使用
    if (typeof monacoTheme === 'string') {
      w.monaco.editor.setTheme(monacoTheme);
      return;
    }
    
    // MonacoThemeConfigオブジェクトの場合は、カスタムテーマを定義
    const themeName = `custom-${theme.id}`;
    
    try {
      // カスタムテーマを定義（既に定義されている場合は上書き）
      w.monaco.editor.defineTheme(themeName, monacoTheme);
      // テーマを適用
      w.monaco.editor.setTheme(themeName);
    } catch (error) {
      console.error('[ThemeService] Failed to apply Monaco Editor theme:', error);
      // エラー時はフォールバックテーマを使用
      const fallbackTheme = monacoTheme.base || 'vs-dark';
      w.monaco.editor.setTheme(fallbackTheme);
    }
  }

  /**
   * Monaco Editorが読み込まれるまで待機する
   * @returns Monaco Editorが読み込まれるまで待機するPromise
   */
  private waitForMonaco(): Promise<void> {
    // 既に待機中のPromiseがあれば再利用
    if (this.monacoReadyPromise) {
      return this.monacoReadyPromise;
    }
    
    const w = window as any;
    
    // 既にmonacoが読み込まれている場合は即座に解決
    if (w.monaco && w.monaco.editor) {
      this.monacoReadyPromise = Promise.resolve();
      return this.monacoReadyPromise;
    }
    
    // 新しいPromiseを作成してキャッシュ
    this.monacoReadyPromise = new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (w.monaco && w.monaco.editor) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // タイムアウト（10秒）- clearIntervalを必ず呼び出す
      setTimeout(() => {
        clearInterval(checkInterval);
        console.warn('[ThemeService] Monaco Editor load timeout');
        resolve();  // タイムアウトしても解決して処理を継続
      }, 10000);
    });
    
    return this.monacoReadyPromise;
  }

  /**
   * 色がダーク系かどうかを判定する
   * @param color 色（HEX形式、例: '#1e1e1e'）
   * @returns ダーク系の場合はtrue
   */
  private isDarkColor(color: string): boolean {
    if (!color) {
      return false;
    }
    
    // HEX形式の色をRGBに変換
    const hex = color.replace('#', '');
    if (hex.length !== 6) {
      return false;
    }
    
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // 輝度を計算（0-255）
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
    
    // 輝度が128未満の場合はダーク系と判定
    return luminance < 128;
  }

  /**
   * テーマ設定を保存する
   * @param themeId テーマID
   */
  private saveThemePreference(themeId: string): void {
    localStorage.setItem(this.STORAGE_KEY, themeId);
  }

  /**
   * 現在のテーマを取得する
   * @returns 現在のテーマ設定、またはnull
   */
  getCurrentTheme(): ThemeConfig | null {
    return this.currentTheme;
  }

  /**
   * 現在のテーマIDを取得する
   * @returns 現在のテーマID、またはnull
   */
  getCurrentThemeId(): string | null {
    return this.currentTheme?.id || null;
  }
}

