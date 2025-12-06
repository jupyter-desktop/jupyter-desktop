import { 
  AfterViewInit, 
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  Component, 
  ElementRef, 
  Input, 
  OnDestroy, 
  ViewChild, 
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatingWindow, FloatingWindowManagerService } from '../services/floating-window-manager.service';
import { ExecutionState, ExecutionService } from '../services/python-runtime/execution.service';
import { OutputService, RuntimeOutput } from '../services/python-runtime/output.service';
import { RichOutputRendererService } from '../services/python-runtime/rich-output-renderer.service';
import { ConsoleResizeStrategyFactory } from '../services/console-resize/console-resize-strategy-factory.service';
import { SafeHtml } from '@angular/platform-browser';
import { Subscription, combineLatest, pairwise, startWith } from 'rxjs';

/**
 * FloatingConsoleWindowComponent
 * 
 * 【役割】
 * - Pythonコードの実行結果をコンソール表示する独立ウィンドウ
 * - エディタウィンドウとは別の3D空間位置にCSS2Dで配置
 * - PythonRuntimeServiceの出力と実行状態を購読して表示
 * 
 * 【責務の境界】
 * - コンソール表示のみを担当（実行制御はエディタ側）
 * - 出力のフォーマットとスクロール管理
 * - 実行状態の視覚的フィードバック
 */
@Component({
  selector: 'app-floating-console-window',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #consolePanel
      class="floating-window console-window"
      [class.is-active]="isActiveWindow"
      [attr.data-window-id]="windowId"
      [class.minimized]="window.isMinimized"
      [style.left.px]="window.x"
      [style.top.px]="window.y"
      [style.width.px]="window.width"
      [style.height.px]="window.height"
      [style.z-index]="window.zIndex"
      (mousedown)="windowManager.handleWindowMouseDown(windowId)"
    >
    <div class="window-titlebar" (mousedown)="onTitleBarMouseDown($event)">
      <div class="titlebar-left">
        <span class="window-title">{{ window.title }}</span>
        <!-- <span class="window-status" [class.running]="isRunning">{{ isRunning ? '実行中...' : 'Ready' }}</span> -->
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
    <div class="window-content console-panel">
      <div class="console-output" #consoleOutput>
        @for (output of filteredOutputs; track $index) {
          <div class="console-line" [class]="'console-' + output.type">
            @if (isRichOutput(output)) {
              <div class="console-content rich-output" [innerHTML]="renderOutput(output)"></div>
            } @else {
              <span class="console-content">{{ output.content }}</span>
            }
          </div>
        }
        @if (filteredOutputs.length === 0) {
          <div class="console-empty">コンソール出力はここに表示されます</div>
        }
      </div>
    </div>
    <div class="resize-handle gradient-style" (mousedown)="onResizeMouseDown($event)"></div>
  </div>
  `,
  styleUrls: ['../styles/floating-window-base.styles.scss'],
  styles: [`
    /* コンソールウィンドウ固有のスタイル */
    .floating-window.console-window {
      border: 2px solid var(--bg-window);
      box-shadow: none;
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      transition: transform 0.2s ease, box-shadow 0.3s ease, border 0.3s ease;
    }

    .floating-window.console-window:hover,
    .floating-window.console-window.is-active {
      border: 2px solid var(--accent-primary);
    }

    .floating-window.console-window .window-titlebar {
      background: var(--bg-window);
      border-bottom: none;
      backdrop-filter: blur(12px);
    }

    .floating-window.console-window .window-title {
      color: var(--text-primary);
      letter-spacing: 0.02em;
    }

    .floating-window.console-window .window-status {
      color: var(--accent-cyan-light);
      text-shadow: 0 0 6px var(--accent-primary);
    }

    .floating-window.console-window .resize-handle {
      background: linear-gradient(
        135deg,
        transparent 0%,
        transparent 40%,
        var(--accent-cyan) 40%,
        var(--accent-cyan) 60%,
        transparent 60%
      );
    }

    .console-output {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 8px;
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.5;
      position: relative;
      z-index: 1;
      user-select: text;
      -webkit-user-select: text;
    }

    .window-content.console-panel {
      flex-direction: column;
      color: var(--text-secondary);
    }

    .console-line {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
      white-space: pre-wrap;
      word-break: break-word;
      user-select: text;
      -webkit-user-select: text;
    }

    .console-time {
      color: var(--text-muted);
      flex-shrink: 0;
      font-size: 10px;
    }

    .console-content {
      flex: 1;
      user-select: text;
      -webkit-user-select: text;
    }

    .console-stdout {
      color: var(--text-window-title);
    }

    .console-stderr {
      color: var(--status-error);
    }

    .console-result {
      color: var(--accent-cyan);
    }

    .console-error {
      color: var(--status-error);
      font-weight: 600;
    }

    .console-output::-webkit-scrollbar {
      width: 6px;
    }

    .console-output::-webkit-scrollbar-track {
      background: transparent;
    }

    .console-output::-webkit-scrollbar-thumb {
      background: var(--bg-scrollbar-thumb);
      border-radius: 3px;
    }

    .console-empty {
      color: var(--text-muted);
      font-style: italic;
      text-align: center;
      padding: 20px;
    }

    .rich-output {
      // リッチ出力のスタイル
      user-select: text;
      -webkit-user-select: text;
      img {
        max-width: 100%;
        height: auto;
        border-radius: 4px;
        margin: 4px 0;
      }

      pre.json-output {
        background: var(--bg-tertiary);
        padding: 8px;
        border-radius: 4px;
        overflow-x: auto;
        code {
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 12px;
          color: var(--accent-cyan);
        }
      }

      pre.latex-output {
        background: var(--bg-tertiary);
        padding: 8px;
        border-radius: 4px;
        code {
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 12px;
          color: var(--text-window-title);
        }
      }
    }
  `]
})
export class FloatingConsoleWindowComponent implements AfterViewInit, OnDestroy {
  @Input() windowId!: string;
  @ViewChild('consoleOutput') consoleOutputRef!: ElementRef<HTMLDivElement>;
  @ViewChild('consolePanel') consolePanelRef!: ElementRef<HTMLDivElement>;

  windowManager = inject(FloatingWindowManagerService);
  private executionService = inject(ExecutionService);
  private outputService = inject(OutputService);
  private richOutputRenderer = inject(RichOutputRendererService);
  private resizeStrategyFactory = inject(ConsoleResizeStrategyFactory);
  private cdr = inject(ChangeDetectorRef);
  
  isRunning = false;
  outputs: RuntimeOutput[] = [];
  private latestExecutionState: ExecutionState = 'idle';
  isActiveWindow = false;

  private viewModelSubscription: Subscription | null = null;
  private windowStateSubscription: Subscription | null = null;
  private consoleScrollScheduled = false;
  private editorId: string | null = null;
  private contentResizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  private executedScripts = new Set<string>(); // 実行済みスクリプトのIDを追跡
  private autoResizeEnabled = true;
  private autoResizeScheduled = false; // リサイズがスケジュール済みかを追跡
  private hasUserManuallyResized = false; // ユーザーが手動でリサイズしたかを追跡
  
  // 自動リサイズの制約値
  private readonly MIN_WINDOW_HEIGHT = 200;
  private readonly MAX_WINDOW_HEIGHT = 800;
  private readonly MIN_WINDOW_WIDTH = 300;
  private readonly MAX_WINDOW_WIDTH = 1200;
  private readonly TITLEBAR_HEIGHT = 40; // タイトルバーの高さ
  private readonly WINDOW_PADDING = 20; // ウィンドウのパディング（スクロールバー等）

  get window() {
    return this.windowManager.getWindow(this.windowId) || {
      id: this.windowId,
      title: 'Console',
      x: 100,
      y: 100,
      width: 600,
      height: 400,
      zIndex: 1000,
      isMinimized: false,
      content: ''
    };
  }

  /**
   * フィルタリング済み出力配列
   */
  get filteredOutputs(): RuntimeOutput[] {
    // [IPyflow DEBUG]で始まるデバッグメッセージを非表示にする
    return this.outputs.filter(output => {
      const content = output.content || '';
      return !content.trim().startsWith('[IPyflow DEBUG]');
    });
  }

  ngAfterViewInit(): void {
    // ウィンドウ要素を登録
    if (this.consolePanelRef?.nativeElement) {
      this.windowManager.registerWindowElement(this.windowId, this.consolePanelRef.nativeElement);
    }
    
    // Pythonランタイムの状態/出力を購読
    Promise.resolve().then(() => {
      const windowData = this.windowManager.getWindow(this.windowId);
      this.editorId = this.getPairedEditorId(windowData);
      const output$ = this.editorId
        ? this.outputService.getOutput$(this.editorId)
        : this.outputService.output$;
      // ウィンドウごとの実行状態を取得（editorIdがある場合）
      const executionState$ = this.editorId
        ? this.executionService.getWindowExecutionState$(this.editorId)
        : this.executionService.executionState$;
      
      // 実行状態遷移を検出するために、pairwiseを使用
      const executionStateWithPrevious$ = executionState$.pipe(
        startWith(this.latestExecutionState), // 初期値を設定
        pairwise() // [previous, current]のペアを生成
      );
      
      this.viewModelSubscription = combineLatest([
        output$,
        executionState$,
        executionStateWithPrevious$
      ]).subscribe(([outputs, executionState, [previousState, currentState]]) => {
        this.outputs = outputs;
        this.isRunning = executionState === 'running';
        
        // 実行状態の遷移を検出
        const isExecutionCompleted = previousState === 'running' && currentState === 'idle';
        
        // 実行完了時に自動リサイズをスケジュール
        // ただし、ユーザーが手動でリサイズしていない場合のみ
        if (isExecutionCompleted && outputs.length > 0 && !this.hasUserManuallyResized) {
          this.scheduleAutoResize();
        }
        
        this.latestExecutionState = currentState;

        this.scheduleConsoleScroll();
        // 出力が変更されたらスクリプトを実行（DOM更新後に実行）
        this.scheduleScriptExecution();
        this.cdr.markForCheck();
      });

      this.windowStateSubscription = this.windowManager.windows.subscribe(windows => {
        const currentWindow = windows.find(w => w.id === this.windowId);
        if (!currentWindow) {
          this.isActiveWindow = false;
          this.cdr.markForCheck();
          return;
        }

        const maxZIndex = windows.reduce((max, w) => Math.max(max, w.zIndex), Number.NEGATIVE_INFINITY);
        const pairedEditorId = this.getPairedEditorId(currentWindow);
        const pairedEditorWindow = pairedEditorId ? windows.find(w => w.id === pairedEditorId) : null;
        const isEditorActive = pairedEditorWindow ? pairedEditorWindow.zIndex === maxZIndex : false;

        this.isActiveWindow = currentWindow.zIndex === maxZIndex || isEditorActive;
        this.cdr.markForCheck();
      });

      // コンテンツのサイズ変更を監視
      this.setupContentResizeObserver();
      
      // 画像などのリッチ出力の追加を監視
      this.setupMutationObserver();
    });
  }

  private scheduleConsoleScroll(): void {
    if (this.consoleScrollScheduled) {
      return;
    }

    this.consoleScrollScheduled = true;

    const executeScroll = () => {
      this.consoleScrollScheduled = false;
      const element = this.consoleOutputRef?.nativeElement;
      if (element) {
        element.scrollTop = element.scrollHeight;
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => executeScroll());
    } else {
      Promise.resolve().then(executeScroll);
    }
  }

  formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  }

  /**
   * リッチ出力をレンダリング
   */
  renderOutput(output: RuntimeOutput): SafeHtml | string {
    return this.richOutputRenderer.render(output);
  }

  /**
   * リッチ出力かどうかを判定
   */
  isRichOutput(output: RuntimeOutput): boolean {
    return !!(output.mimeType && output.data);
  }

  onTitleBarMouseDown(event: MouseEvent): void {
    this.windowManager.startDrag(event, this.windowId, this.consolePanelRef);
  }

  onResizeMouseDown(event: MouseEvent): void {
    // ユーザーが手動でリサイズを開始したことを検出
    if (!this.hasUserManuallyResized) {
      this.hasUserManuallyResized = true;
      // 以降の自動リサイズを無効化
      this.autoResizeEnabled = false;
    }
    this.windowManager.startResize(event, this.windowId, this.consolePanelRef);
  }

  closeWindow(): void {
    this.windowManager.closeWindow(this.windowId);
  }

  minimizeWindow(): void {
    this.windowManager.minimizeWindow(this.windowId);
  }
  
  ngOnDestroy(): void {
    // ウィンドウ要素の登録を解除
    this.windowManager.unregisterWindowElement(this.windowId);
    if (this.viewModelSubscription) {
      this.viewModelSubscription.unsubscribe();
    }
    if (this.windowStateSubscription) {
      this.windowStateSubscription.unsubscribe();
    }
    if (this.contentResizeObserver) {
      this.contentResizeObserver.disconnect();
      this.contentResizeObserver = null;
    }
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
    }
  }

  /**
   * コンソールパネルのDOM要素を取得します
   * マネージャーがCSS2Dコンテナに追加する際に使用
   */
  getConsolePanelElement(): HTMLElement | undefined {
    return this.consolePanelRef?.nativeElement;
  }

  private getPairedEditorId(windowData: FloatingWindow | undefined): string | null {
    if (!windowData) {
      return null;
    }

    if (windowData.editorId) {
      return windowData.editorId;
    }

    if (windowData.id.endsWith('-console')) {
      return windowData.id.replace(/-console$/, '');
    }

    return null;
  }

  /**
   * コンテンツのサイズ変更を監視するResizeObserverを設定
   */
  private setupContentResizeObserver(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    Promise.resolve().then(() => {
      const outputElement = this.consoleOutputRef?.nativeElement;
      if (!outputElement) {
        return;
      }

      this.contentResizeObserver = new ResizeObserver(() => {
        if (!this.autoResizeEnabled || this.hasUserManuallyResized) {
          return;
        }

        // リサイズが発生した場合、自動リサイズを再度確認
        setTimeout(() => {
          this.scheduleAutoResize();
        }, 50);
      });

      this.contentResizeObserver.observe(outputElement);
    });
  }

  /**
   * コンテンツサイズに応じてウィンドウサイズを調整（制約値の適用）
   * @param contentWidth - コンテンツの幅
   * @param contentHeight - コンテンツの高さ
   */
  private adjustWindowSizeToContent(contentWidth: number, contentHeight: number): void {
    if (!this.autoResizeEnabled || this.hasUserManuallyResized) {
      return;
    }

    const currentWindow = this.windowManager.getWindow(this.windowId);
    if (!currentWindow || currentWindow.isMinimized) {
      return;
    }

    // ウィンドウサイズ = コンテンツサイズ + タイトルバー + パディング
    const requiredWidth = contentWidth + this.WINDOW_PADDING;
    const requiredHeight = contentHeight + this.TITLEBAR_HEIGHT + this.WINDOW_PADDING;
    
    // 最小/最大サイズの制約を適用
    const newWidth = Math.max(
      this.MIN_WINDOW_WIDTH,
      Math.min(this.MAX_WINDOW_WIDTH, requiredWidth)
    );
    
    const newHeight = Math.max(
      this.MIN_WINDOW_HEIGHT,
      Math.min(this.MAX_WINDOW_HEIGHT, requiredHeight)
    );

    // サイズが現在と異なる場合のみ更新（5px以上の差）
    const heightChanged = Math.abs(newHeight - currentWindow.height) > 5;
    const widthChanged = Math.abs(newWidth - currentWindow.width) > 5;
    
    if (heightChanged || widthChanged) {
      this.windowManager.updateSize(this.windowId, newWidth, newHeight);
      this.cdr.markForCheck();
    }
  }

  /**
   * スクリプト実行をスケジュール（出力変更後に実行）
   * Angularの変更検出サイクルが完了した後、さらに遅延させて実行
   */
  private scheduleScriptExecution(): void {
    // 複数のフレームを待ってから実行（DOM要素が確実に存在することを確認）
    Promise.resolve().then(() => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        // 最初のフレームで変更検出が完了するのを待つ
        window.requestAnimationFrame(() => {
          // 2回目のフレームでDOM要素が確実に存在することを確認
          window.requestAnimationFrame(() => {
            // さらに少し遅延させてスクリプトを実行（チャートコンテナが存在することを確認）
            setTimeout(() => {
              this.executeModuleScriptsInContainer();
            }, 100);
          });
        });
      } else {
        setTimeout(() => {
          this.executeModuleScriptsInContainer();
        }, 200);
      }
    });
  }
  
  /**
   * コンテナ内のスクリプトを実行
   */
  private executeModuleScriptsInContainer(): void {
    const outputElement = this.consoleOutputRef?.nativeElement;
    if (!outputElement) {
      return;
    }
    this.executeModuleScripts(outputElement);
  }

  /**
   * 自動リサイズをスケジュール（出力変更後に実行）
   */
  private scheduleAutoResize(): void {
    if (!this.autoResizeEnabled || this.hasUserManuallyResized || this.autoResizeScheduled) {
      return;
    }

    this.autoResizeScheduled = true;

    // DOM更新後にリサイズを実行
    Promise.resolve().then(() => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            this.performAutoResize();
          });
        });
      } else {
        setTimeout(() => {
          this.performAutoResize();
        }, 100);
      }
    });
  }

  /**
   * 自動リサイズを実行（戦略パターンを使用）
   */
  private async performAutoResize(): Promise<void> {
    this.autoResizeScheduled = false;

    if (!this.autoResizeEnabled || this.hasUserManuallyResized) {
      return;
    }

    const outputElement = this.consoleOutputRef?.nativeElement;
    if (!outputElement) {
      return;
    }

    // ResizeObserverを一時的に切断
    const observer = this.contentResizeObserver;
    if (observer) {
      observer.disconnect();
    }

    try {
      // 戦略ファクトリーから適切な戦略を取得
      const strategy = this.resizeStrategyFactory.getStrategy(outputElement);
      if (!strategy) {
        return;
      }

      // 戦略を使ってコンテンツサイズを計算
      const contentSize = await strategy.calculateSize(outputElement);
      if (!contentSize) {
        return;
      }

      // 計算されたサイズでウィンドウをリサイズ
      this.adjustWindowSizeToContent(contentSize.width, contentSize.height);
    } finally {
      // ResizeObserverを再接続
      if (observer && outputElement) {
        observer.observe(outputElement);
      }
    }
  }

  /**
   * リッチ出力（画像、スクリプト等）の追加を監視するMutationObserverを設定
   */
  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined') {
      return;
    }

    Promise.resolve().then(() => {
      const outputElement = this.consoleOutputRef?.nativeElement;
      if (!outputElement) {
        return;
      }

      this.mutationObserver = new MutationObserver((mutations) => {
        let hasNewContent = false;
        let hasNewScripts = false;
        
        mutations.forEach((mutation) => {
          // 追加されたノードをチェック
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              
              // 何らかの要素が追加された場合、リサイズをスケジュール
              hasNewContent = true;
              
              // scriptタグを検索
              if (element.tagName === 'SCRIPT') {
                hasNewScripts = true;
              } else {
                const moduleScripts = element.querySelectorAll('script');
                if (moduleScripts.length > 0) {
                  hasNewScripts = true;
                }
              }
            }
          });
        });
        
        // 新しいスクリプトが追加された場合、少し遅延させてから実行
        if (hasNewScripts && outputElement) {
          setTimeout(() => {
            this.executeModuleScripts(outputElement);
          }, 200);
        }
        
        // 新しいコンテンツが追加された場合、リサイズをスケジュール
        if (hasNewContent && !this.hasUserManuallyResized) {
          this.scheduleAutoResize();
        }
      });

      // 子要素の追加を監視
      this.mutationObserver.observe(outputElement, {
        childList: true,
        subtree: true
      });
      
      // 既存のスクリプトタグも実行
      this.executeModuleScripts(outputElement);
    });
  }

  /**
   * innerHTMLで挿入された<script>タグを実行
   * type="module"とプレーンなスクリプトの両方に対応する
   */
  private executeModuleScripts(container: HTMLElement): void {
    const scripts = Array.from(container.querySelectorAll('script'));
    
    scripts.forEach((scriptElement) => {
      const script = scriptElement as HTMLScriptElement;
      const scriptContent = script.textContent || script.innerHTML || '';
      const hasInlineContent = scriptContent.trim().length > 0;
      const srcAttr = script.getAttribute('src');
      const hasSrc = !!(srcAttr && srcAttr.trim().length > 0);
      
      if (!hasInlineContent && !hasSrc) {
        return; // 実行対象がない場合はスキップ
      }
      
      // スクリプトのハッシュ値を生成（重複実行を防ぐ）
      const scriptSource = hasSrc ? srcAttr! : scriptContent;
      const scriptId = this.hashString(`${hasSrc ? 'src:' : 'inline:'}${scriptSource}`);
      
      // 既に実行済みの場合はスキップ
      if (this.executedScripts.has(scriptId)) {
        return;
      }
      // 新しいscriptタグを作成して実行
      // innerHTMLで挿入されたscriptタグは実行されないため、
      // 新しいscriptタグを作成してDOMに追加する必要がある
      const newScript = document.createElement('script');
      
      if (script.type) {
        newScript.type = script.type;
      }
      
      // 既存属性を移植（type/srcは別途設定）
      script.getAttributeNames().forEach((attr) => {
        if (attr === 'type' || attr === 'src') {
          return;
        }
        const value = script.getAttribute(attr);
        if (value !== null) {
          newScript.setAttribute(attr, value);
        }
      });
      
      if (hasSrc && srcAttr) {
        newScript.src = srcAttr;
      } else {
        newScript.textContent = scriptContent;
      }
      
      // スクリプトの実行完了を待つ（エラーハンドリング付き）
      const errorHandler = (event: ErrorEvent) => {
        console.error('Module script execution error:', event.error);
        return false; // 他のエラーハンドラーにも伝播させる
      };
      
      // エラーハンドラーを一時的に設定
      window.addEventListener('error', errorHandler, { once: true });
      
      // 親要素に追加して実行
      // document.bodyに追加すると、グローバルスコープで実行され、
      // かつ、DOM要素を参照できる
      // コンテナ内の要素を参照できるように、document.bodyに追加
      const parent = document.body;
      
      // scriptタグを追加
      parent.appendChild(newScript);
      
      // 実行済みとしてマーク
      this.executedScripts.add(scriptId);
      
      // 元のスクリプトタグは空にする（実行済みなので不要）
      // DOM構造を保つため、削除せずに空にする
      script.textContent = '';
      script.removeAttribute('type');
      script.removeAttribute('src');
      
      // クリーンアップ（エラーハンドラーを削除）
      setTimeout(() => {
        window.removeEventListener('error', errorHandler);
      }, 1000);
    });
  }
  
  /**
   * 文字列のハッシュ値を生成（スクリプトの重複検出用）
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}

