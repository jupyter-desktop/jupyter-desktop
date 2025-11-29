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
}

