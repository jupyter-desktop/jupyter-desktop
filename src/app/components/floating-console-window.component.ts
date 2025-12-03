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
    .floating-window.console-window {
      border: none;
      box-shadow: none;
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      transition: transform 0.2s ease, box-shadow 0.3s ease;
    }

    .floating-window.console-window:hover,
    .floating-window.console-window.is-active {
      box-shadow:
        0 0 30px rgba(0, 172, 193, 0.35),
        0 40px 130px rgba(0, 172, 193, 0.4);
    }

    .floating-window.console-window .window-titlebar {
      background: linear-gradient(
        180deg,
        var(--bg-window-titlebar-gradient-start) 0%,
        var(--bg-window-titlebar-gradient-end) 100%
      );
      border-bottom: none;
      backdrop-filter: blur(12px);
    }

    .floating-window.console-window .window-title {
      color: var(--text-primary);
      letter-spacing: 0.02em;
    }

    .floating-window.console-window .window-status {
      color: var(--accent-cyan-light);
      text-shadow: 0 0 6px rgba(0, 172, 193, 0.45);
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
    }

    .console-time {
      color: var(--text-muted);
      flex-shrink: 0;
      font-size: 10px;
    }

    .console-content {
      flex: 1;
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
  private imageLoadListeners = new Map<HTMLImageElement, () => void>();
  private executedScripts = new Set<string>(); // 実行済みスクリプトのIDを追跡
  private autoResizeEnabled = true;
  private autoResizeState: 'idle' | 'pending' | 'running' | 'done' = 'idle';
  private hasUserManuallyResized = false; // ユーザーが手動でリサイズしたかを追跡
  
  // 自動リサイズの制約値
  private readonly MIN_WINDOW_HEIGHT = 200;
  private readonly MAX_WINDOW_HEIGHT = 800;
  private readonly MIN_WINDOW_WIDTH = 300;
  private readonly MAX_WINDOW_WIDTH = 1200;
  private readonly TITLEBAR_HEIGHT = 40; // タイトルバーの高さ
  private readonly CONTENT_PADDING = 16; // コンテンツのパディング（上下8px × 2）
  private readonly DEFAULT_IMAGE_WIDTH = 650; // 画像表示時のデフォルト幅
  private readonly DEFAULT_IMAGE_HEIGHT = 500; // 画像表示時のデフォルト高さ
  private readonly IMAGE_LOAD_TIMEOUT_MS = 1500; // 画像読み込み待機の上限
  private readonly INITIAL_LAYOUT_DELAY_MS = 120; // レイアウト安定化のための追加待機

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
        
        // 実行完了時、または出力が追加された時に自動リサイズをスケジュール
        // ただし、ユーザーが手動でリサイズしていない場合のみ
        if (isExecutionCompleted && outputs.length > 0 && !this.hasUserManuallyResized) {
          // 画像出力がある場合は、MutationObserverとobserveImageLoadで画像が追加・読み込み完了した時にリサイズが実行される
          // テキスト出力のみの場合は即座にリサイズを実行
          const hasImageOutput = outputs.some(o => o.mimeType && o.mimeType.startsWith('image/'));
          if (!hasImageOutput) {
            this.scheduleAutoResize();
          }
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
    // 画像のロードリスナーをクリーンアップ
    this.imageLoadListeners.forEach((cleanup, img) => {
      cleanup();
    });
    this.imageLoadListeners.clear();
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
   * コンテンツサイズに応じてウィンドウサイズを調整
   * @param contentHeight - コンテンツの高さ
   * @param contentWidth - コンテンツの幅（オプション）
   */
  private adjustWindowSizeToContent(contentHeight: number, contentWidth?: number): void {
    if (!this.autoResizeEnabled) {
      return;
    }

    const currentWindow = this.windowManager.getWindow(this.windowId);
    if (!currentWindow || currentWindow.isMinimized) {
      return;
    }

    // コンテンツサイズに基づいてウィンドウサイズを計算
    let requiredHeight = contentHeight + this.TITLEBAR_HEIGHT + this.CONTENT_PADDING;
    let requiredWidth: number;
    
    // 小さいコンテンツかどうかを判定するためのしきい値
    const SMALL_CONTENT_HEIGHT_THRESHOLD = 200; // 高さが200px以下は小さいコンテンツとみなす
    const SMALL_WIDTH_THRESHOLD = 500; // 幅が500px以下は小さいコンテンツとみなす
    const OPTIMAL_TEXT_WIDTH = 400; // テキストコンテンツの推奨幅
    
    // 小さいコンテンツの判定：
    // 1. 幅が指定されていない場合（テキストのみ）→ 常に小さいコンテンツとして扱う
    // 2. 幅が指定されているが、高さが小さく幅も小さい場合
    const isSmallContent = contentWidth === undefined || 
                           (contentHeight <= SMALL_CONTENT_HEIGHT_THRESHOLD && 
                            contentWidth <= SMALL_WIDTH_THRESHOLD);
    
    if (isSmallContent) {
      // 小さいコンテンツ（テキストのみなど）の場合は、適切な最小サイズを使用
      requiredWidth = OPTIMAL_TEXT_WIDTH;
      // 高さもコンテンツに合わせて調整（ただし最小高さは維持）
      requiredHeight = Math.max(
        this.MIN_WINDOW_HEIGHT,
        contentHeight + this.TITLEBAR_HEIGHT + this.CONTENT_PADDING
      );
    } else if (contentWidth && contentWidth > 0) {
      // 大きいコンテンツ（画像など）の場合
      // コンテンツの幅が指定されている場合、それに基づいて幅を計算
      // ウィンドウサイズ = コンテンツサイズ + パディング + スクロールバー + マージン
      requiredWidth = contentWidth + this.CONTENT_PADDING + 20 + 40;
      
      // コンテンツが大きい場合は、デフォルトサイズを上限として調整
      if (contentWidth > this.DEFAULT_IMAGE_WIDTH || contentHeight > this.DEFAULT_IMAGE_HEIGHT) {
        const aspectRatio = contentHeight / contentWidth;
        const defaultAspectRatio = this.DEFAULT_IMAGE_HEIGHT / this.DEFAULT_IMAGE_WIDTH;
        
        let targetContentWidth: number;
        let targetContentHeight: number;
        
        if (aspectRatio > defaultAspectRatio) {
          // 縦長の場合、高さを基準にする
          targetContentHeight = Math.min(contentHeight, this.DEFAULT_IMAGE_HEIGHT);
          targetContentWidth = targetContentHeight / aspectRatio;
        } else {
          // 横長の場合、幅を基準にする
          targetContentWidth = Math.min(contentWidth, this.DEFAULT_IMAGE_WIDTH);
          targetContentHeight = targetContentWidth * aspectRatio;
        }
        
        requiredWidth = targetContentWidth + this.CONTENT_PADDING + 20 + 40;
        requiredHeight = targetContentHeight + this.TITLEBAR_HEIGHT + this.CONTENT_PADDING;
      }
    } else {
      // コンテンツの幅が指定されていないが、大きいコンテンツの場合
      // 現在の幅を維持
      requiredWidth = currentWindow.width;
    }
    
    // 最小/最大サイズの制約を適用
    const newHeight = Math.max(
      this.MIN_WINDOW_HEIGHT,
      Math.min(this.MAX_WINDOW_HEIGHT, requiredHeight)
    );
    
    const newWidth = Math.max(
      this.MIN_WINDOW_WIDTH,
      Math.min(this.MAX_WINDOW_WIDTH, requiredWidth)
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
    if (!this.autoResizeEnabled || this.autoResizeState !== 'idle' || this.hasUserManuallyResized) {
      return;
    }

    this.autoResizeState = 'pending';
    void this.runInitialAutoResize();
  }

  private async runInitialAutoResize(): Promise<void> {
    if (this.autoResizeState !== 'pending') {
      return;
    }

    this.autoResizeState = 'running';
    await this.waitForAnimationFrames(2);

    const outputElement = this.consoleOutputRef?.nativeElement;
    if (!outputElement) {
      this.finishAutoResize();
      return;
    }

    await this.waitForImagesToLoad(outputElement);
    await this.waitForAnimationFrames(1);
    await this.delay(this.INITIAL_LAYOUT_DELAY_MS);

    if (this.autoResizeState !== 'running') {
      return;
    }

    try {
      this.performAutoResize();
    } finally {
      this.finishAutoResize();
    }
  }

  private finishAutoResize(): void {
    this.autoResizeState = 'idle'; // 次のリサイズが可能な状態に戻す
    // ユーザーが手動でリサイズしていない場合は、自動リサイズを継続
    if (this.hasUserManuallyResized) {
      this.autoResizeEnabled = false;
    } else {
      // ユーザーが手動でリサイズしていない場合は、自動リサイズを有効のままにする
      this.autoResizeEnabled = true;
    }
  }

  private waitForAnimationFrames(frames: number): Promise<void> {
    if (frames <= 0) {
      return Promise.resolve();
    }

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      return new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    }

    return new Promise((resolve) => {
      let remaining = frames;
      const step = () => {
        remaining -= 1;
        if (remaining <= 0) {
          resolve();
        } else {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window !== 'undefined') {
        window.setTimeout(resolve, ms);
      } else {
        setTimeout(resolve, ms);
      }
    });
  }

  private waitForImagesToLoad(container: HTMLElement): Promise<void> {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }

    const images = Array.from(container.querySelectorAll('img'));
    const pendingImages = images.filter(img => !img.complete);

    if (pendingImages.length === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      let remaining = pendingImages.length;
      let timeoutId: number | null = null;
      const cleanupHandlers: Array<() => void> = [];

      const cleanup = () => {
        cleanupHandlers.forEach(fn => fn());
        cleanupHandlers.length = 0;
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const maybeFinish = () => {
        remaining -= 1;
        if (remaining <= 0) {
          cleanup();
          resolve();
        }
      };

      pendingImages.forEach((img) => {
        if (img.complete) {
          remaining -= 1;
          return;
        }

        const handler = () => {
          maybeFinish();
        };

        img.addEventListener('load', handler, { once: true });
        img.addEventListener('error', handler, { once: true });
        cleanupHandlers.push(() => {
          img.removeEventListener('load', handler);
          img.removeEventListener('error', handler);
        });
      });

      if (remaining <= 0) {
        cleanup();
        resolve();
        return;
      }

      timeoutId = window.setTimeout(() => {
        cleanup();
        resolve();
      }, this.IMAGE_LOAD_TIMEOUT_MS);
    });
  }

  /**
   * 自動リサイズを実行
   */
  private performAutoResize(): void {
    if (!this.autoResizeEnabled || this.hasUserManuallyResized) {
      return;
    }

    const outputElement = this.consoleOutputRef?.nativeElement;
    if (!outputElement) {
      return;
    }

    const observer = this.contentResizeObserver;
    if (observer) {
      observer.disconnect();
    }
    // 画像要素の自然サイズを取得
    const images = outputElement.querySelectorAll('img');
    let hasImage = false;
    let imageWidth: number | undefined = undefined;
    let imageHeight = 0;
    
    images.forEach((img: HTMLImageElement) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // 画像の自然サイズを使用
        hasImage = true;
        imageWidth = Math.max(imageWidth || 0, img.naturalWidth);
        imageHeight = Math.max(imageHeight, img.naturalHeight);
      } else if (img.offsetWidth > 0 || img.offsetHeight > 0) {
        // 画像がまだ読み込まれていない場合、表示サイズを使用
        hasImage = true;
        imageWidth = Math.max(imageWidth || 0, img.offsetWidth || 0);
        imageHeight = Math.max(imageHeight, img.offsetHeight || 0);
      }
    });
    
    let contentHeight: number;
    let contentWidth: number | undefined;
    
    if (hasImage) {
      // 画像がある場合、画像のサイズを使用
      contentHeight = imageHeight;
      contentWidth = imageWidth;
    } else {
      // テキストコンテンツの場合、実際のコンテンツ要素の高さを合計
      const consoleLines = outputElement.querySelectorAll('.console-line');
      contentHeight = 0;
      
      consoleLines.forEach((line: Element) => {
        const lineElement = line as HTMLElement;
        // 実際に表示されている高さを使用
        const lineHeight = lineElement.offsetHeight || lineElement.scrollHeight || 0;
        contentHeight += lineHeight;
      });
      
      // パディング分を追加（上下8px × 2 = 16px）
      contentHeight += this.CONTENT_PADDING;
      
      // テキストコンテンツの場合は幅を考慮しない
      contentWidth = undefined;
    }
    
    // コンテンツサイズに基づいてリサイズ
    this.adjustWindowSizeToContent(contentHeight, contentWidth);
  }

  /**
   * 画像などのリッチ出力の追加を監視するMutationObserverを設定
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
        let hasNewImages = false;
        let hasNewScripts = false;
        
        mutations.forEach((mutation) => {
          // 追加されたノードをチェック
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              
              // 画像要素を検索
              const images = element.querySelectorAll('img');
              if (images.length > 0 || element.tagName === 'IMG') {
                hasNewImages = true;
                
                // 既存の画像も含めて監視
                if (element.tagName === 'IMG') {
                  this.observeImageLoad(element as HTMLImageElement);
                }
                images.forEach((img: HTMLImageElement) => {
                  this.observeImageLoad(img);
                });
              }
              
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
        // DOM要素が確実に存在することを確認するため
        if (hasNewScripts && outputElement) {
          setTimeout(() => {
            this.executeModuleScripts(outputElement);
          }, 200);
        }
        
        // 新しい画像が追加された場合、リサイズをスケジュール
        // ただし、ユーザーが手動でリサイズしていない場合のみ
        if (hasNewImages && !this.hasUserManuallyResized) {
          // autoResizeEnabledがfalseの場合は、再度有効化してリサイズを実行
          if (!this.autoResizeEnabled) {
            this.autoResizeEnabled = true;
            this.autoResizeState = 'idle';
          }
          this.scheduleAutoResize();
        }
      });

      // 子要素の追加を監視
      this.mutationObserver.observe(outputElement, {
        childList: true,
        subtree: true
      });
      
      // 既存の画像も監視
      const existingImages = outputElement.querySelectorAll('img');
      existingImages.forEach((img: HTMLImageElement) => {
        this.observeImageLoad(img);
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

  /**
   * 画像の読み込み完了を監視し、読み込み後にリサイズを実行
   */
  private observeImageLoad(img: HTMLImageElement): void {
    // 既に監視中の場合はスキップ
    if (this.imageLoadListeners.has(img)) {
      return;
    }

    const handleLoad = () => {
      // 画像の読み込み完了後、リサイズをスケジュール
      // ただし、ユーザーが手動でリサイズしていない場合のみ
      if (this.hasUserManuallyResized) {
        return;
      }
      // autoResizeEnabledがfalseの場合は、再度有効化してリサイズを実行
      if (!this.autoResizeEnabled) {
        this.autoResizeEnabled = true;
        this.autoResizeState = 'idle';
      }
      setTimeout(() => {
        this.scheduleAutoResize();
      }, 100);
    };

    const handleError = () => {
      // エラー時もリサイズを試みる（ただし、ユーザーが手動でリサイズしていない場合のみ）
      if (!this.hasUserManuallyResized) {
        this.scheduleAutoResize();
      }
    };

    if (img.complete) {
      // 既に読み込み済みの場合は即座にリサイズ
      handleLoad();
    } else {
      // 読み込み中の場合はイベントを監視
      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', handleError, { once: true });
      
      // クリーンアップ関数を保存
      this.imageLoadListeners.set(img, () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
      });
    }
  }
}

