import { 
  AfterViewInit, 
  ChangeDetectorRef,
  Component, 
  ElementRef, 
  Input, 
  OnDestroy, 
  ViewChild, 
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatingWindowManagerService } from '../services/floating-window-manager.service';
import { ElectronService } from '../services/electron.service';
import { ExecutionState, ExecutionService } from '../services/python-runtime/execution.service';
import { OutputService } from '../services/python-runtime/output.service';
import { IpyflowCommService } from '../services/python-runtime/ipyflow-comm.service';
import { ThemeService } from '../services/theme.service';
import { Subscription, combineLatest } from 'rxjs';

/**
 * FloatingEditorWindowComponent
 * 
 * 【役割】
 * - フローティングPythonエディタウィンドウの表示と操作
 * - Monaco Editorの初期化と管理
 * - Pythonコードの実行（PythonRuntimeServiceを使用）
 * - 実行状態の表示（実行中/完了/エラー）
 * - ウィンドウのドラッグ、リサイズ、最小化などのUI操作
 * - エディタコンテンツの保存と読み込み
 * 
 * 【責務の境界】
 * - このコンポーネントはウィンドウの表示と操作のみを担当
 * - ウィンドウの作成や削除はFloatingWindowManagerComponentが担当
 * - コンソール出力の表示はFloatingConsoleWindowComponentが担当
 * - ウィンドウに保持されているコンテンツの編集と実行
 */
@Component({
  selector: 'app-floating-editor-window',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div 
      #windowRoot
      class="floating-window"
      [attr.data-window-id]="windowId"
      [class.minimized]="window.isMinimized"
      [class.running]="isRunning"
      [style.left.px]="window.x"
      [style.top.px]="window.y"
      [style.width.px]="window.width"
      [style.height.px]="window.height"
      [style.z-index]="window.zIndex"
      (mousedown)="windowManager.handleWindowMouseDown(windowId)"
    >
      <div class="window-titlebar" (mousedown)="onTitleBarMouseDown($event)">
        <div class="titlebar-controls">
          @if (connectionReady) {
            @if (isRunning) {
              <button class="titlebar-btn stop-btn" (click)="stopCode()" title="Stop execution">
                ⏹️
              </button>
            } @else {
              <button class="titlebar-btn run-btn" (click)="runCode()" title="Run Python code (Ctrl+Enter)">
                ▶️
              </button>
            }
          }
          <button class="titlebar-btn clear-btn" (click)="clearConsole()" title="Clear console">
            🗑️
          </button>
        </div>
        <div class="titlebar-left">
          <span class="window-title">{{ window.title }}</span>
          <span class="window-status" [class.error]="hasError">{{ statusMessage }}</span>
          @if (needsReexecution) {
            <div class="reexecution-indicator">
              ⚠️ 変数が変更されました。再実行が必要です。
              <button class="reexecution-btn" (click)="runCode()">再実行</button>
            </div>
          }
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
        <div #editor class="editor-host"></div>
      </div>
      <div class="resize-handle gradient-style" (mousedown)="onResizeMouseDown($event)"></div>
    </div>
  `,
  styleUrls: ['../styles/floating-window-base.styles.scss'],
  styles: [`
    /* エディタウィンドウ固有のスタイル */
    .titlebar-controls {
      display: flex;
      gap: 4px;
      align-items: center;
      margin-right: 16px;
    }

    .window-status.error {
      color: var(--status-error);
    }

    .titlebar-btn.run-btn:hover {
      background: var(--status-success);
    }

    .titlebar-btn.stop-btn:hover {
      background: var(--status-close);
    }

    .titlebar-btn.clear-btn:hover {
      background: var(--border-color);
    }

    .reexecution-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: 12px;
      padding: 4px 8px;
      background: var(--status-warning, #ffa500);
      color: var(--text-primary);
      border-radius: 4px;
      font-size: 12px;
    }

    .reexecution-btn {
      padding: 2px 8px;
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      cursor: pointer;
      font-size: 11px;
    }

    .reexecution-btn:hover {
      background: var(--bg-secondary);
    }

    .editor-host {
      width: 100%;
      height: 100%;
    }

    /* 実行中のグロー効果 */
    .floating-window.running {
      animation: glow-pulse 2s ease-in-out infinite;
    }

    @keyframes glow-pulse {
      0%, 100% {
        box-shadow: 
          0 0 20px rgba(76, 175, 80, 0.5),
          0 0 40px rgba(76, 175, 80, 0.4),
          0 0 60px rgba(76, 175, 80, 0.3),
          0 0 80px rgba(76, 175, 80, 0.2);
      }
      50% {
        box-shadow: 
          0 0 30px rgba(76, 175, 80, 0.8),
          0 0 60px rgba(76, 175, 80, 0.6),
          0 0 90px rgba(76, 175, 80, 0.4),
          0 0 120px rgba(76, 175, 80, 0.3);
      }
    }
  `]
})
export class FloatingEditorWindowComponent implements AfterViewInit, OnDestroy {
  @Input() windowId!: string;
  @ViewChild('editor') editorRef!: ElementRef<HTMLDivElement>;
  @ViewChild('windowRoot') windowRootRef!: ElementRef<HTMLDivElement>;

  private editorInstance: any;
  windowManager = inject(FloatingWindowManagerService);
  electronService = inject(ElectronService);
  private executionService = inject(ExecutionService);
  private outputService = inject(OutputService);
  private ipyflowComm = inject(IpyflowCommService);
  private themeService = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);
  
  statusMessage = '接続待機中...';
  hasError = false;
  isRunning = false;
  needsReexecution = false; // IPyflow統合用: 再実行が必要かどうか
  private latestExecutionState: ExecutionState = 'idle';
  connectionReady = false;
  private previousNeedsReexecution = false; // 自動再実行用: 前回のneedsReexecution状態
  private isAutoReexecuting = false; // 自動再実行中フラグ（無限ループ防止）

  private viewModelSubscription: Subscription | null = null;
  private readyCellsSubscription: Subscription | null = null;
  private resolveEditorReady: (() => void) | null = null;
  private editorReadyPromise: Promise<void> | null = null;
  private themeCheckInterval: number | null = null;
  private lastThemeId: string | null = null;

  get window() {
    return this.windowManager.getWindow(this.windowId) || {
      id: this.windowId,
      title: 'Editor',
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      zIndex: 1000,
      isMinimized: false,
      content: ''
    };
  }

  ngAfterViewInit(): void {
    if (this.windowRootRef?.nativeElement) {
      this.windowManager.registerWindowElement(this.windowId, this.windowRootRef.nativeElement);
    }

    this.initializeMonaco();
    this.startThemeMonitoring();

    // Pythonランタイムの状態/出力を購読
    Promise.resolve().then(() => {
      // IPyflow統合用: ウィンドウ単位の実行状態を購読
      const windowExecutionState$ = this.executionService.getWindowExecutionState$(this.windowId);
      
      // executionState$ とウィンドウ単位の状態を統合
      this.viewModelSubscription = combineLatest([
        this.outputService.getOutput$(this.windowId),
        windowExecutionState$
      ]).subscribe(([outputs, executionState]) => {
        this.isRunning = executionState === 'running';
        this.latestExecutionState = executionState;
        
        // IPyflow統合用: 再実行が必要かどうかを確認
        const currentNeedsReexecution = this.executionService.needsReexecution(this.windowId);
        const needsReexecutionChanged = this.previousNeedsReexecution !== currentNeedsReexecution;
        this.needsReexecution = currentNeedsReexecution;
        
        // Phase 3: 自動再実行の実装
        // needsReexecutionがfalseからtrueに変化したとき、かつ実行中でない場合に自動実行
        if (needsReexecutionChanged && currentNeedsReexecution && !this.isRunning && !this.isAutoReexecuting) {
          this.isAutoReexecuting = true;
          // 非同期で実行（現在の変更検知サイクルを完了させてから実行）
          Promise.resolve().then(() => {
            this.runCode().finally(() => {
              this.isAutoReexecuting = false;
            });
          });
        }
        
        this.previousNeedsReexecution = currentNeedsReexecution;
        
        this.updateStatusFromState();

        this.cdr.detectChanges();
      });

      // IPyflow統合用: readyCells$を購読してneedsReexecutionフラグを更新
      this.readyCellsSubscription = this.ipyflowComm.readyCells$.subscribe(readyCells => {
        if (readyCells.includes(this.windowId)) {
          // このウィンドウがready_cellsに含まれている場合、needsReexecutionフラグを更新
          // ExecutionService.markWindowsForReexecution()が既に呼ばれているため、
          // executionService.needsReexecution()で確認できるが、UI更新のタイミングを早める
          const currentNeedsReexecution = this.executionService.needsReexecution(this.windowId);
          const needsReexecutionChanged = this.previousNeedsReexecution !== currentNeedsReexecution;
          this.needsReexecution = currentNeedsReexecution;
          
          // Phase 3: 自動再実行の実装（readyCells$からの通知時にも自動実行）
          // needsReexecutionがfalseからtrueに変化したとき、かつ実行中でない場合に自動実行
          if (needsReexecutionChanged && currentNeedsReexecution && !this.isRunning && !this.isAutoReexecuting) {
            this.isAutoReexecuting = true;
            // 非同期で実行（現在の変更検知サイクルを完了させてから実行）
            Promise.resolve().then(() => {
              this.runCode().finally(() => {
                this.isAutoReexecuting = false;
              });
            });
          }
          
          this.previousNeedsReexecution = currentNeedsReexecution;
          this.cdr.detectChanges();
        }
      });
    });

    // Pythonランタイムの初期化（windowIdを指定）
    void this.executionService.initializeForEditor(this.windowId)
      .then(() => {
        this.connectionReady = true;
        this.updateStatusFromState();
      })
      .catch(error => {
        console.error('Pythonランタイム初期化エラー:', error);
        this.statusMessage = '接続失敗（再試行中...）';
        this.hasError = true;
        this.cdr.detectChanges();
      });

    Promise.resolve().then(() => {
      this.windowManager.ensureInitialPlacement(this.windowId, this.windowRootRef);
    });
  }
  
  /**
   * JupyterLab環境を検出してMonaco EditorのベースURLを取得
   */
  private baseUrl = () => {
    // JupyterLab環境を検出（パスに/lab/が含まれている場合）
    if (typeof window !== 'undefined' && window.location.pathname.includes('/lab/')) {
      return '/lab/extensions/jupyter-desktop/static/browser/';
    }
    // 通常のWeb環境
    return '';
  }

  /**
   * Monaco Editorを初期化します
   * 
   * 役割：
   * - Monaco Editorのインスタンスを作成
   * - ウィンドウに保存されているコンテンツを読み込み
   * - コンテンツがない場合は空文字列をフォールバックとして使用
   * - エディタのイベントハンドラーを設定
   */
  private initializeMonaco(): void {
    const w = window as any;
    const host = this.editorRef?.nativeElement;

    if (!host) {
      if (!this.editorReadyPromise) {
        this.editorReadyPromise = Promise.resolve();
      }
      return;
    }

    if (this.editorInstance && this.editorInstance.dispose) {
      this.editorInstance.dispose();
      this.editorInstance = null;
    }

    this.editorReadyPromise = new Promise(resolve => {
      this.resolveEditorReady = resolve;
    });

    const windowData = this.windowManager.getWindow(this.windowId);
    const initialContent = (windowData && windowData.content) ? windowData.content : '';

    const resolveEditorReady = () => {
      if (this.resolveEditorReady) {
        this.resolveEditorReady();
        this.resolveEditorReady = null;
      }
    };

    const initEditor = () => {
      w.require.config({ 
        paths: { vs: `${this.baseUrl()}assets/monaco/vs` },
        'vs/nls': { availableLanguages: {} }
      });
      
      w.require(['vs/editor/editor.main'], () => {
        try {
          // テーマサービスから現在のテーマを取得
          const currentTheme = this.themeService.getCurrentTheme();
          const monacoTheme = this.getMonacoThemeName(currentTheme);
          
          this.editorInstance = w.monaco.editor.create(host, {
            value: initialContent,
            language: 'python',
            automaticLayout: true,
            theme: monacoTheme,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            roundedSelection: true,
            scrollBeyondLastLine: false,
            tabSize: 4,
          });

          // エディタ内容の変更を監視
          this.editorInstance.onDidChangeModelContent(() => {
            this.onEditorContentChange();
          });

          // Ctrl+Enterで実行
          this.editorInstance.addCommand(
            w.monaco.KeyMod.CtrlCmd | w.monaco.KeyCode.Enter,
            () => {
              if (!this.isRunning) {
                this.runCode();
              }
            }
          );
        } catch (error) {
          console.error('Monaco Editor初期化エラー:', error);
        } finally {
          resolveEditorReady();
        }
      });
    };

    if (!w.require) {
      const existingScript = document.querySelector(`script[src="${this.baseUrl()}assets/monaco/vs/loader.js"]`);
      if (existingScript) {
        if (w.require) {
          initEditor();
        } else {
          existingScript.addEventListener('load', initEditor, { once: true });
          existingScript.addEventListener('error', resolveEditorReady, { once: true });
        }
      } else {
        const loaderScript = document.createElement('script');
        loaderScript.type = 'text/javascript';
        loaderScript.src = `${this.baseUrl()}assets/monaco/vs/loader.js`;
        loaderScript.addEventListener('load', initEditor, { once: true });
        loaderScript.addEventListener('error', resolveEditorReady, { once: true });
        document.body.appendChild(loaderScript);
      }
    } else {
      initEditor();
    }
  }

  private onEditorContentChange(): void {
    if (!this.editorInstance) return;

    try {
      const content = this.editorInstance.getValue();
      this.windowManager.updateContent(this.windowId, content);
      this.hasError = false;
    } catch (error: any) {
      this.hasError = true;
    }
  }

  async runCode(): Promise<void> {
    if (!this.editorInstance || this.isRunning) {
      return;
    }

    this.windowManager.ensureConsoleWindow(this.windowId);
    let code = this.editorInstance.getValue();
    
    // コードを正規化（先頭・末尾の空白を削除、ただし空行は保持）
    // 各行の先頭の共通インデントを削除（すべての行が同じインデントを持つ場合）
    code = code.trimEnd(); // 末尾の空白行を削除
    
    // 先頭の空行を削除
    const lines = code.split('\n');
    while (lines.length > 0 && lines[0].trim() === '') {
      lines.shift();
    }
    
    // すべての行が同じインデントを持つ場合、そのインデントを削除
    if (lines.length > 0) {
      const nonEmptyLines = lines.filter((line: string) => line.trim() !== '');
      if (nonEmptyLines.length > 0) {
        // 最初の非空行の先頭の空白数を取得
        const firstLine = nonEmptyLines[0];
        const leadingSpaces = firstLine.length - firstLine.trimStart().length;
        
        // すべての非空行が同じかそれ以上のインデントを持つ場合、共通インデントを削除
        if (leadingSpaces > 0 && nonEmptyLines.every((line: string) => line.length - line.trimStart().length >= leadingSpaces)) {
          code = lines.map((line: string) => {
            if (line.trim() === '') {
              return line; // 空行はそのまま
            }
            return line.substring(leadingSpaces);
          }).join('\n');
        } else {
          code = lines.join('\n');
        }
      } else {
        code = lines.join('\n');
      }
    } else {
      code = '';
    }

    try {
      this.latestExecutionState = 'running';
      this.updateStatusFromState();
      this.hasError = false;
      this.outputService.clearOutput(this.windowId);
      
      // IPyflow統合用: 再実行マークをクリア（実行開始時）
      this.executionService.clearReexecutionMark(this.windowId);
      this.needsReexecution = false;
      
      await this.executionService.runPython(code, this.windowId);
      
      // IPyflow統合用: 実行完了後、再実行が必要かどうかを確認
      this.needsReexecution = this.executionService.needsReexecution(this.windowId);
    } catch (error: any) {
      console.error('Python execution error:', error);
      this.statusMessage = 'エラーが発生しました';
      this.hasError = true;
    }
  }

  async stopCode(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.statusMessage = '停止中...';

    try {
      await this.executionService.interruptExecution();
      this.statusMessage = '実行が停止されました';
    } catch (error: any) {
      console.error('Stop execution error:', error);
      this.statusMessage = '停止中にエラーが発生しました';
      this.hasError = true;
    }
  }

  clearConsole(): void {
    this.outputService.clearOutput(this.windowId);
  }

  onTitleBarMouseDown(event: MouseEvent): void {
    this.windowManager.startDrag(event, this.windowId, this.windowRootRef);
  }

  onResizeMouseDown(event: MouseEvent): void {
    this.windowManager.startResize(event, this.windowId, this.windowRootRef);
  }

  closeWindow(): void {
    this.windowManager.closeWindow(this.windowId);
  }

  minimizeWindow(): void {
    // エディタの内容を保存してから最小化
    if (this.editorInstance) {
      const content = this.editorInstance.getValue();
      this.windowManager.updateContent(this.windowId, content);
    }
    
    // エディタは破棄せずに保持し、表示だけ非表示にする
    this.windowManager.minimizeWindow(this.windowId);
  }

  async openFile(): Promise<void> {
    const result = await this.electronService.openFile();
    
    if (result.success && result.content) {
      if (this.editorInstance) {
        this.editorInstance.setValue(result.content);
        // ウィンドウ固有のコンテンツとして保存
        this.windowManager.updateContent(this.windowId, result.content);
        this.windowManager.updateTitle(this.windowId, result.filePath || 'Untitled');
        this.statusMessage = 'Loaded';
        this.hasError = false;
      }
    } else if (result.error) {
      this.statusMessage = `Error: ${result.error}`;
      this.hasError = true;
    }
  }

  /**
   * エディタの現在の内容を取得します
   * 外部から呼び出し可能なpublicメソッド
   */
  getEditorContent(): string {
    if (!this.editorInstance) {
      // エディタが初期化されていない場合は、ウィンドウに保存されているコンテンツを返す
      return this.window.content || '';
    }
    return this.editorInstance.getValue();
  }

  /**
   * エディタの内容をウィンドウマネージャーに保存します
   * メニューからのSaveコマンドで全ウィンドウを保存する前に、各ウィンドウの内容を同期するために使用
   */
  syncEditorContent(): void {
    if (this.editorInstance) {
      const content = this.editorInstance.getValue();
      this.windowManager.updateContent(this.windowId, content);
    }
  }

  /**
   * エディタの内容を設定します
   * ファイルから読み込んだコンテンツをエディタに設定する際に使用
   * エディタが初期化されていない場合は、初期化を待ってから設定します
   */
  async setEditorContent(content: string): Promise<void> {
    // エディタが初期化されるまで待つ
    if (this.editorReadyPromise) {
      await this.editorReadyPromise;
    }
    
    // さらに少し待って、エディタインスタンスが確実に作成されるのを待つ
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (this.editorInstance) {
      this.editorInstance.setValue(content);
      this.windowManager.updateContent(this.windowId, content);
    } else {
      // エディタがまだ初期化されていない場合は、ウィンドウのコンテンツとして保存
      // エディタが初期化された時に自動的に読み込まれます
      this.windowManager.updateContent(this.windowId, content);
    }
  }

  async saveFile(): Promise<void> {
    if (!this.editorInstance) return;

    const content = this.editorInstance.getValue();
    // ウィンドウ固有のコンテンツとして保存
    this.windowManager.updateContent(this.windowId, content);
    
    const result = await this.electronService.saveFile(content);
    
    if (result.success) {
      this.windowManager.updateTitle(this.windowId, result.filePath || 'Untitled');
      this.statusMessage = 'Saved';
      this.hasError = false;
    } else if (result.error) {
      this.statusMessage = `Error: ${result.error}`;
      this.hasError = true;
    }
  }

  ngOnDestroy(): void {
    if (this.editorInstance && this.editorInstance.dispose) {
      this.editorInstance.dispose();
    }
    if (this.viewModelSubscription) {
      this.viewModelSubscription.unsubscribe();
    }
    if (this.readyCellsSubscription) {
      this.readyCellsSubscription.unsubscribe();
    }
    this.stopThemeMonitoring();
    // インタラクションサービスのクリーンアップ
    this.windowManager.cleanupInteractions();
    this.windowManager.unregisterWindowElement(this.windowId);
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

  private updateStatusFromState(): void {
    this.connectionReady = this.executionService.isReady();
    switch (this.latestExecutionState) {
      case 'running':
        this.statusMessage = '実行中...';
        this.hasError = false;
        break;
      case 'error':
        this.statusMessage = 'エラーが発生しました';
        this.hasError = true;
        break;
      default:
        this.hasError = false;
        this.statusMessage = this.connectionReady ? 'Ready' : '接続待機中...';
        break;
    }
  }
}

