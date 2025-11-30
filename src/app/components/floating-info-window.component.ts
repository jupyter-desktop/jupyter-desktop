import { 
  Component, 
  ElementRef, 
  Input, 
  OnDestroy, 
  OnInit,
  AfterViewInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
  ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { marked } from 'marked';
import { FloatingWindowManagerService, FloatingWindow } from '../services/floating-window-manager.service';
import { ThemeService } from '../services/theme.service';

/**
 * FloatingInfoWindowComponent
 * 
 * 【役割】
 * - フローティング情報ウィンドウの表示と操作
 * - ウィンドウのドラッグ、リサイズ、最小化などのUI操作
 * - Monaco EditorによるMarkdown編集モード
 * 
 * 【責務の境界】
 * - このコンポーネントはウィンドウの表示と操作のみを担当
 * - ウィンドウの作成や削除はFloatingWindowManagerComponentが担当
 * - Monaco Editorによる編集機能を提供
 * 
 * 【設計方針】
 * - Monaco Editorによる編集機能を提供
 * 
 * 【パフォーマンス最適化】
 * - OnPush変更検知戦略の採用
 * - Zone.jsの外でのドラッグ/リサイズ処理
 * - requestAnimationFrameによるスロットリング
 */
@Component({
  selector: 'app-floating-info-window',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div 
      #windowRoot
      class="floating-window"
      [attr.data-window-id]="windowId"
      [class.minimized]="window.isMinimized"
      [class.dragging]="isDragging"
      [class.resizing]="isResizing"
      [style.left.px]="displayLeft"
      [style.top.px]="displayTop"
      [style.width.px]="displayWidth"
      [style.height.px]="displayHeight"
      [style.z-index]="window.zIndex"
      (mousedown)="windowManager.handleWindowMouseDown(windowId)"
    >
      <div class="window-titlebar" (mousedown)="onTitleBarMouseDown($event)">
        <div class="titlebar-left">
          <span class="window-title">Information</span>
        </div>
        <div class="titlebar-buttons">
          <button class="titlebar-btn" (click)="minimizeWindow()" title="Minimize">
            −
          </button>
          <button class="titlebar-btn close" (click)="closeWindow()" title="Close">
            ✕
          </button>
        </div>
      </div>
      
      <div class="window-content">
        <div class="info-panel">
          <!-- 編集モード（Monaco Editor） -->
          <div 
            *ngIf="isEditMode"
            #editorHost
            class="editor-host">
          </div>
          
          <!-- 通常表示（編集モードでない場合） -->
          <div 
            *ngIf="!isEditMode"
            class="info-content"
            (dblclick)="onContentDoubleClick($event)"
            (keydown)="onContentKeyDown($event)"
            tabindex="0">
            <!-- マークダウンコンテンツの表示 -->
            <div 
              *ngIf="markdownHtml" 
              class="markdown-content"
              [innerHTML]="markdownHtml">
            </div>
            <!-- ヒント表示（コンテンツがない場合のみ） -->
            <div 
              *ngIf="!markdownHtml"
              class="edit-hint">
              ダブルクリックで編集モードに入ります
            </div>
          </div>
        </div>
      </div>
      
      <div class="resize-handle after-style" (mousedown)="onResizeHandleMouseDown($event)"></div>
    </div>
  `,
  styleUrls: ['../styles/floating-window-base.styles.scss'],
  styles: [`
    /* 情報ウィンドウ固有のスタイル */
    .floating-window.minimized {
      display: none;
    }

    .window-content {
      flex-direction: column;
    }

    .window-title {
      color: var(--text-window-title);
      font-size: 13px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .info-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-window);
    }

    .info-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: auto;
      cursor: text;
      position: relative;
      padding: 16px;
    }

    .markdown-content {
      flex: 1;
      color: var(--text-primary, #333);
      line-height: 1.6;
    }

    .markdown-content ::ng-deep h1,
    .markdown-content ::ng-deep h2,
    .markdown-content ::ng-deep h3,
    .markdown-content ::ng-deep h4,
    .markdown-content ::ng-deep h5,
    .markdown-content ::ng-deep h6 {
      margin-top: 1em;
      margin-bottom: 0.5em;
      font-weight: bold;
    }

    .markdown-content ::ng-deep p {
      margin-bottom: 1em;
    }

    .markdown-content ::ng-deep code {
      background: var(--bg-tertiary, #f5f5f5);
      padding: 2px 4px;
      border-radius: 3px;
      font-family: monospace;
    }

    .markdown-content ::ng-deep pre {
      background: var(--bg-tertiary, #f5f5f5);
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      margin-bottom: 1em;
    }

    .markdown-content ::ng-deep ul,
    .markdown-content ::ng-deep ol {
      margin-left: 1.5em;
      margin-bottom: 1em;
    }

    .edit-hint {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: var(--text-secondary, #888);
      font-size: 12px;
      pointer-events: none;
      user-select: none;
    }

    .editor-host {
      width: 100%;
      height: 100%;
    }
  `]
})
export class FloatingInfoWindowComponent implements OnInit, AfterViewInit, OnDestroy {
  windowManager = inject(FloatingWindowManagerService);
  private cdr = inject(ChangeDetectorRef);
  private themeService = inject(ThemeService);
  private sanitizer = inject(DomSanitizer);
  
  @Input() windowId!: string;
  @ViewChild('windowRoot') windowElement?: ElementRef<HTMLDivElement>;
  @ViewChild('editorHost') editorHostRef?: ElementRef<HTMLDivElement>;
  
  window!: FloatingWindow;
  isEditMode: boolean = false;
  markdownText: string = '';
  markdownHtml: SafeHtml | null = null;
  editorInstance: any = null;
  themeCheckInterval: number | null = null;
  lastThemeId: string | null = null;
  
  // テンプレートで使用するためpublic（サービスから取得）
  get isDragging(): boolean {
    return this.windowManager.isDraggingWindow(this.windowId);
  }
  
  get isResizing(): boolean {
    return this.windowManager.isResizingWindow(this.windowId);
  }
  
  get isDraggingOrResizing(): boolean {
    return this.windowManager.isDraggingOrResizingWindow(this.windowId);
  }
  
  get displayLeft(): number | null {
    if (!this.window) {
      return null;
    }
    const dragPosition = this.windowManager.getActiveWindowPosition(this.windowId);
    return dragPosition?.x ?? this.window.x;
  }

  get displayTop(): number | null {
    if (!this.window) {
      return null;
    }
    const dragPosition = this.windowManager.getActiveWindowPosition(this.windowId);
    return dragPosition?.y ?? this.window.y;
  }

  get displayWidth(): number | null {
    if (!this.window) {
      return null;
    }
    const activeSize = this.windowManager.getActiveWindowSize(this.windowId);
    return activeSize?.width ?? this.window.width;
  }

  get displayHeight(): number | null {
    if (!this.window) {
      return null;
    }
    const activeSize = this.windowManager.getActiveWindowSize(this.windowId);
    return activeSize?.height ?? this.window.height;
  }

  private windowsSubscription?: Subscription;

  ngOnInit(): void {
    if (!this.windowId) {
      console.error('FloatingInfoWindowComponent: windowId is required');
      return;
    }

    // テーマ監視を開始
    this.startThemeMonitoring();

    // ウィンドウ情報を取得して監視
    this.windowsSubscription = this.windowManager.windows.subscribe(windows => {
      const window = windows.find(w => w.id === this.windowId);
      if (window) {
        const previousX = this.window?.x;
        const previousY = this.window?.y;
        const previousWidth = this.window?.width;
        const previousHeight = this.window?.height;
        const previousIsMinimized = this.window?.isMinimized;
        const previousContent = this.window?.content;
        
        this.window = window;
        
        // ウィンドウのcontentが変更された場合、マークダウンを更新
        if (previousContent !== window.content && window.content) {
          this.markdownText = window.content;
          this.updateMarkdownHtml();
        }
        
        // 位置・サイズ・最小化状態が変更された場合のみ変更検知を実行
        // ドラッグ/リサイズ中は変更検知をスキップ（パフォーマンス最適化）
        if (!this.isDraggingOrResizing) {
          const positionChanged = previousX !== window.x || previousY !== window.y;
          const sizeChanged = previousWidth !== window.width || previousHeight !== window.height;
          const minimizedChanged = previousIsMinimized !== window.isMinimized;
          
          if (positionChanged || sizeChanged || minimizedChanged) {
            this.cdr.detectChanges();
          }
        }
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.windowElement?.nativeElement) {
      this.windowManager.registerWindowElement(this.windowId, this.windowElement.nativeElement);
    }
    this.windowManager.ensureInitialPlacement(this.windowId, this.windowElement);
    
    // 初期化時にwindow.contentからマークダウンを読み込む
    if (this.window?.content) {
      this.markdownText = this.window.content;
      this.updateMarkdownHtml();
    }
  }

  ngOnDestroy(): void {
    // Monaco Editorインスタンスを破棄
    if (this.editorInstance && this.editorInstance.dispose) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }

    // テーマ監視を停止
    this.stopThemeMonitoring();

    // インタラクションサービスのクリーンアップ
    this.windowManager.cleanupInteractions();
    
    // サブスクリプションを解除してメモリリークを防止
    if (this.windowsSubscription) {
      this.windowsSubscription.unsubscribe();
    }

    this.windowManager.unregisterWindowElement(this.windowId);
  }


  onTitleBarMouseDown(event: MouseEvent): void {
    this.windowManager.startDrag(event, this.windowId, this.windowElement);
  }

  onResizeHandleMouseDown(event: MouseEvent): void {
    this.windowManager.startResize(event, this.windowId, this.windowElement);
  }

  minimizeWindow(): void {
    this.windowManager.minimizeWindow(this.windowId);
  }

  closeWindow(): void {
    this.windowManager.closeWindow(this.windowId);
  }

  /**
   * コンテンツエリアのダブルクリックハンドラ
   * Jupyterのマークダウンセルのようにダブルクリックで編集モードに入る
   */
  onContentDoubleClick(event: MouseEvent): void {
    if (this.isDraggingOrResizing) {
      return;
    }
    event.stopPropagation();
    this.enterEditMode();
  }

  /**
   * コンテンツエリアでのキーダウンハンドラ
   * JupyterのマークダウンセルのようにEnterキーで編集モードに入る
   */
  onContentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      if (this.isDraggingOrResizing) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      this.enterEditMode();
    }
  }

  /**
   * 編集モードに切り替え
   */
  enterEditMode(): void {
    if (this.isDraggingOrResizing) {
      return;
    }

    this.isEditMode = true;
    this.cdr.detectChanges(); // *ngIfでeditorHostが表示されるまで待つ

    // 次のフレームでMonaco Editorを初期化（DOMが更新されるまで待つ）
    Promise.resolve().then(() => {
      this.initializeMonaco();
    });
  }

  /**
   * 編集モードを解除
   */
  exitEditMode(): void {
    if (this.editorInstance) {
      // Monaco Editorからマークダウンテキストを取得
      const editedText = this.editorInstance.getValue();
      this.markdownText = editedText;

      // window.contentにマークダウンを保存
      this.windowManager.updateContent(this.windowId, editedText);

      // MarkdownをHTMLに変換
      this.updateMarkdownHtml();

      this.editorInstance.dispose();
      this.editorInstance = null;
    }

    this.isEditMode = false;
    this.cdr.detectChanges();
  }

  /**
   * マークダウンテキストをHTMLに変換して表示用に更新
   */
  private updateMarkdownHtml(): void {
    if (this.markdownText) {
      try {
        const html = marked.parse(this.markdownText) as string;
        this.markdownHtml = this.sanitizer.bypassSecurityTrustHtml(html);
      } catch (error) {
        console.error('Markdownのレンダリングに失敗しました:', error);
        // エラー時はプレーンテキストとして表示
        this.markdownHtml = this.sanitizer.bypassSecurityTrustHtml(
          `<pre>${this.markdownText}</pre>`
        );
      }
    } else {
      this.markdownHtml = null;
    }
  }

  /**
   * マークダウンコンテンツをwindow.contentに同期
   * 保存時に呼び出される
   */
  syncMarkdownContent(): void {
    if (this.isEditMode && this.editorInstance) {
      // 編集モードの場合は、エディタから最新の内容を取得
      const editedText = this.editorInstance.getValue();
      this.markdownText = editedText;
      this.windowManager.updateContent(this.windowId, editedText);
    } else {
      // 表示モードの場合は、現在のmarkdownTextを保存
      this.windowManager.updateContent(this.windowId, this.markdownText);
    }
  }

  /**
   * Monaco Editorを初期化
   */
  private initializeMonaco(): void {
    const w = window as any;
    const host = this.editorHostRef?.nativeElement;

    if (!host) {
      return;
    }

    if (this.editorInstance && this.editorInstance.dispose) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }

    const initEditor = () => {
      w.require.config({ 
        paths: { vs: 'assets/monaco/vs' },
        'vs/nls': { availableLanguages: {} }
      });
      
      w.require(['vs/editor/editor.main'], () => {
        try {
          // テーマサービスから現在のテーマを取得
          const currentTheme = this.themeService.getCurrentTheme();
          const monacoTheme = this.getMonacoThemeName(currentTheme);
          
          this.editorInstance = w.monaco.editor.create(host, {
            value: this.markdownText || '',
            language: 'markdown',
            automaticLayout: true,
            theme: monacoTheme,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            wordWrap: 'on',
          });

          // Ctrl+Enterで編集モードを解除
          this.editorInstance.addCommand(
            w.monaco.KeyMod.CtrlCmd | w.monaco.KeyCode.Enter,
            () => {
              this.exitEditMode();
            }
          );

          // エディタに自動的にフォーカスを当てる
          this.editorInstance.focus();
        } catch (error) {
          console.error('Monaco Editor初期化エラー:', error);
        }
      });
    };

    if (!w.require) {
      const existingScript = document.querySelector('script[src="assets/monaco/vs/loader.js"]');
      if (existingScript) {
        if (w.require) {
          initEditor();
        } else {
          existingScript.addEventListener('load', initEditor, { once: true });
        }
      } else {
        const loaderScript = document.createElement('script');
        loaderScript.type = 'text/javascript';
        loaderScript.src = 'assets/monaco/vs/loader.js';
        loaderScript.addEventListener('load', initEditor, { once: true });
        document.body.appendChild(loaderScript);
      }
    } else {
      initEditor();
    }
  }

  /**
   * テーマ変更を監視して、Monaco Editorのテーマを更新する
   */
  private startThemeMonitoring(): void {
    // 初期テーマIDを記録
    this.lastThemeId = this.themeService.getCurrentThemeId();
    
    // 定期的にテーマ変更をチェック（500ms間隔）
    this.themeCheckInterval = window.setInterval(() => {
      const currentThemeId = this.themeService.getCurrentThemeId();
      if (currentThemeId !== this.lastThemeId) {
        this.lastThemeId = currentThemeId;
        this.applyMonacoThemeToEditor();
      }
    }, 500);
  }

  /**
   * テーマ監視を停止する
   */
  private stopThemeMonitoring(): void {
    if (this.themeCheckInterval !== null) {
      window.clearInterval(this.themeCheckInterval);
      this.themeCheckInterval = null;
    }
  }

  /**
   * Monaco Editorのテーマを適用する
   */
  private applyMonacoThemeToEditor(): void {
    if (!this.editorInstance) {
      return;
    }

    const w = window as any;
    if (!w.monaco || !w.monaco.editor) {
      return;
    }

    const currentTheme = this.themeService.getCurrentTheme();
    const themeName = this.getMonacoThemeName(currentTheme);
    
    try {
      w.monaco.editor.setTheme(themeName);
    } catch (error) {
      console.error('Failed to apply Monaco Editor theme:', error);
    }
  }

  /**
   * テーマ設定からMonaco Editorのテーマ名を取得する
   * @param theme テーマ設定（nullの場合はデフォルトテーマ）
   * @returns Monaco Editorのテーマ名
   */
  private getMonacoThemeName(theme: any): string {
    if (!theme) {
      return 'vs-dark';  // デフォルトテーマ
    }

    const monacoTheme = theme.monacoTheme;
    
    if (!monacoTheme) {
      // Monaco Editorテーマが指定されていない場合は、背景色から推測
      const bgColor = theme.variables['--bg-canvas'] || theme.variables['--bg-primary'] || '';
      const isDark = this.isDarkColor(bgColor);
      return isDark ? 'vs-dark' : 'vs';
    }

    // 文字列の場合は既存のテーマ名として使用
    if (typeof monacoTheme === 'string') {
      return monacoTheme;
    }

    // MonacoThemeConfigオブジェクトの場合は、カスタムテーマ名を返す
    return `custom-${theme.id}`;
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
}

