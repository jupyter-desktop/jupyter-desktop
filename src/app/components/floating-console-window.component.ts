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
import { Subscription, combineLatest } from 'rxjs';

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
        <span class="window-status" [class.running]="isRunning">{{ isRunning ? '実行中...' : 'Ready' }}</span>
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
            <span class="console-time">{{ formatTime(output.timestamp) }}</span>
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
      border: 1px solid var(--border-color-light);
      box-shadow: none;
      backdrop-filter: blur(18px) saturate(140%);
      -webkit-backdrop-filter: blur(18px) saturate(140%);
      transition: transform 0.2s ease, box-shadow 0.3s ease, border-color 0.3s ease;
    }

    .floating-window.console-window:hover,
    .floating-window.console-window.is-active {
      border-color: var(--accent-cyan);
      box-shadow:
        0 0 0 1px var(--accent-cyan),
        0 0 30px rgba(0, 172, 193, 0.35),
        0 40px 130px rgba(0, 172, 193, 0.4);
    }

    .floating-window.console-window .window-titlebar {
      background: linear-gradient(
        180deg,
        var(--bg-window-titlebar-gradient-start) 0%,
        var(--bg-window-titlebar-gradient-end) 100%
      );
      border-bottom: 1px solid var(--border-color-light);
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
  private autoResizeEnabled = true;
  
  // 自動リサイズの制約値
  private readonly MIN_WINDOW_HEIGHT = 200;
  private readonly MAX_WINDOW_HEIGHT = 800;
  private readonly MIN_WINDOW_WIDTH = 300;
  private readonly MAX_WINDOW_WIDTH = 1200;
  private readonly TITLEBAR_HEIGHT = 40; // タイトルバーの高さ
  private readonly CONTENT_PADDING = 16; // コンテンツのパディング（上下8px × 2）
  private readonly DEFAULT_IMAGE_WIDTH = 650; // 画像表示時のデフォルト幅
  private readonly DEFAULT_IMAGE_HEIGHT = 500; // 画像表示時のデフォルト高さ

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
    console.log('filteredOutputs', this.outputs);
    return this.outputs.filter(output => {
      const content = output.content || '';
      return !content.trim().startsWith('[IPyflow DEBUG]');
    });
  }

  ngAfterViewInit(): void {
    // Pythonランタイムの状態/出力を購読
    Promise.resolve().then(() => {
      const windowData = this.windowManager.getWindow(this.windowId);
      this.editorId = this.getPairedEditorId(windowData);
      const output$ = this.editorId
        ? this.outputService.getOutput$(this.editorId)
        : this.outputService.output$;
      this.viewModelSubscription = combineLatest([
        output$,
        this.executionService.executionState$
      ]).subscribe(([outputs, executionState]) => {
        this.outputs = outputs;
        this.isRunning = executionState === 'running';
        this.latestExecutionState = executionState;

        this.scheduleConsoleScroll();
        // 出力が変更されたら自動リサイズをスケジュール
        this.scheduleAutoResize();
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
    this.windowManager.startResize(event, this.windowId, this.consolePanelRef);
  }

  closeWindow(): void {
    this.windowManager.closeWindow(this.windowId);
  }

  minimizeWindow(): void {
    this.windowManager.minimizeWindow(this.windowId);
  }
  
  ngOnDestroy(): void {
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

      this.contentResizeObserver = new ResizeObserver((entries) => {
        if (!this.autoResizeEnabled) {
          return;
        }

        // リサイズが発生した場合、画像サイズも含めて全体を再計算
        // 画像の読み込み完了を待つため、少し遅延させて実行
        setTimeout(() => {
          this.performAutoResize();
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
   * 自動リサイズをスケジュール（出力変更後に実行）
   */
  private scheduleAutoResize(): void {
    if (!this.autoResizeEnabled) {
      return;
    }

    // 次のフレームでリサイズを実行
    Promise.resolve().then(() => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          this.performAutoResize();
        });
      } else {
        setTimeout(() => {
          this.performAutoResize();
        }, 0);
      }
    });
  }

  /**
   * 自動リサイズを実行
   */
  private performAutoResize(): void {
    if (!this.autoResizeEnabled) {
      return;
    }

    const outputElement = this.consoleOutputRef?.nativeElement;
    if (!outputElement) {
      return;
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
        
        mutations.forEach((mutation) => {
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
            }
          });
        });
        
        // 新しい画像が追加された場合、リサイズをスケジュール
        if (hasNewImages) {
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
    });
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
      setTimeout(() => {
        this.scheduleAutoResize();
      }, 100);
    };

    const handleError = () => {
      // エラー時もリサイズを試みる
      this.scheduleAutoResize();
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

