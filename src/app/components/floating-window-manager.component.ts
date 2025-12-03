import { 
  Component, 
  inject, 
  OnInit, 
  AfterViewInit,
  OnDestroy,
  ComponentRef,
  createComponent,
  ApplicationRef,
  EnvironmentInjector
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatingEditorWindowComponent } from './floating-editor-window.component';
import { FloatingInfoWindowComponent } from './floating-info-window.component';
import { FloatingConsoleWindowComponent } from './floating-console-window.component';
import { FloatingWindowManagerService, FloatingWindow } from '../services/floating-window-manager.service';
import { FloatingWindowCSS2DService } from '../services/floating-window-css2d.service';
import { ElectronService } from '../services/electron.service';
import { NotebookService } from '../services/notebook/notebook.service';
import { ExecutionService } from '../services/python-runtime/execution.service';
import { PythonRuntimeService } from '../services/python-runtime/python-runtime.service';
import { IpyflowCommService } from '../services/python-runtime/ipyflow-comm.service';
import { Subscription } from 'rxjs';

interface RestoreWindowsOptions {
  showEmptyConfirm?: boolean;
  emptyConfirmMessage?: string;
  showSuccessAlert?: boolean;
  successMessage?: string;
}

/**
 * FloatingWindowManagerComponent
 * 
 * 【役割】
 * - フローティングウィンドウ（エディタ/情報/コンソール）の全体管理
 * - 新しいウィンドウの作成（エディタ/情報ウィンドウ）
 * - ウィンドウコンポーネントの動的作成と配置
 * - ウィンドウの初期化処理
 * - エディタウィンドウとコンソールウィンドウのペア管理
 * 
 * 【責務の境界】
 * - ウィンドウの作成・削除・復元の管理を担当
 * - 個々のウィンドウの表示・操作は各ウィンドウコンポーネントに委譲
 * - CSS2Dサービスが作成したコンテナに動的にウィンドウコンポーネントを配置
 * - Notebook形式の保存/読み込みはNotebookServiceが担当
 * 
 * 【アーキテクチャ】
 * FloatingWindowCSS2DServiceがfloating-windows-containerを作成・管理します。
 * このコンポーネントは、サービスから取得したコンテナに対して、
 * 動的にFloatingEditorWindowComponent、FloatingInfoWindowComponent、
 * FloatingConsoleWindowComponentを作成・配置します。
 * これにより、DOM管理の責務が完全にサービスに集約されます。
 */
@Component({
  selector: 'app-floating-window-manager',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="floating-window-manager">
      <!-- メインキャンバスエリア -->
      <div class="main-canvas">
        <ng-content></ng-content>
      </div>
      <!-- ツールバー -->
      <div class="toolbar" *ngIf="!isHomeVisible">
        <button class="toolbar-btn" (click)="createNewWindow()" title="新しいエディタウィンドウを開く">
          +
        </button>
        <button class="toolbar-btn info-btn" (click)="createInfoWindow()" title="情報ウィンドウを開く">
          i
        </button>
      </div>
      <!-- セッションリセットボタン（左下） -->
      <button class="session-reset-btn" *ngIf="!isHomeVisible" (click)="onResetSession()" title="セッションをリセット">
        🔄
      </button>

    </div>
  `,
  styles: [`
    .floating-window-manager {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .main-canvas {
      width: 100%;
      height: 100%;
    }

    /* フローティングウィンドウコンテナのスタイルはサービスが管理 */

    .toolbar {
      position: absolute;
      top: 16px;
      right: 16px;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      align-items: center;
      background: transparent;
      padding: 8px 16px;
      z-index: 999;
    }

    .toolbar-btn {
      width: 48px;
      height: 48px;
      display: grid;
      place-items: center;
      background: var(--bg-button-primary);
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 24px;
      font-weight: 900;
      transition: background 0.2s;
      white-space: nowrap;
      box-shadow: var(--shadow-button);
    }

    .toolbar-btn:hover {
      background: var(--bg-button-primary-hover);
    }

    .toolbar-btn:active {
      background: var(--accent-primary);
    }

    .toolbar-btn.info-btn {
      width: 48px;
      height: 48px;
      font-weight: bold;
      font-style: italic;
    }

    .session-reset-btn {
      position: absolute;
      bottom: 16px;
      left: 16px;
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      background: transparent;
      opacity: 0.5;
      border: none;
      border-radius: 4px;
      color: white;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.2s;
      z-index: 998;
    }

    .session-reset-btn:hover {
      background: transparent;
      opacity: 0.7;
    }

    .session-reset-btn:active {
      background: transparent;
      opacity: 1;
    }

    .toolbar-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .window-count {
      font-size: 12px;
      color: var(--text-window-title);
    }

    .taskbar {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 48px;
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      padding: 0 12px;
      gap: 8px;
      overflow-x: auto;
      z-index: 998;
    }

    .taskbar-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: var(--bg-tertiary);
      border: none;
      border-radius: 4px;
      color: var(--text-window-title);
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
      max-width: 200px;
      white-space: nowrap;
    }

    .taskbar-item:hover {
      background: var(--border-color);
    }

    .taskbar-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .taskbar-title {
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `]
})
export class FloatingWindowManagerComponent implements OnInit, AfterViewInit, OnDestroy {
  private windowManager = inject(FloatingWindowManagerService);
  private css2DService = inject(FloatingWindowCSS2DService);
  private appRef = inject(ApplicationRef);
  private injector = inject(EnvironmentInjector);
  private electronService = inject(ElectronService);
  private notebookService = inject(NotebookService);
  private executionService = inject(ExecutionService);
  private pythonRuntime = inject(PythonRuntimeService);
  private ipyflowComm = inject(IpyflowCommService);
  
  windows: FloatingWindow[] = [];
  minimizedWindows: FloatingWindow[] = [];
  isHomeVisible = false;
  
  // 動的に作成されたコンポーネントの参照を保持
  private windowComponents = new Map<string, ComponentRef<FloatingEditorWindowComponent | FloatingInfoWindowComponent>>();
  // コンソール用コンポーネントの参照を保持
  private consoleComponents = new Map<string, ComponentRef<FloatingConsoleWindowComponent>>();

  private hasInitialized = false;

  ngOnInit(): void {
    this.windowManager.windows.subscribe(windows => {
      this.windows = windows;
      this.minimizedWindows = windows.filter(w => w.isMinimized);
      
      // ウィンドウが変更されたら、動的コンポーネントを更新
      this.updateWindowComponents();
      // コンソールコンポーネントも更新
      this.updateConsoleComponents();
    });

  }

  ngAfterViewInit(): void {
    // サービスが作成したコンテナに初期ウィンドウコンポーネントを追加
    this.updateWindowComponents();

    // Electron メニューコマンドのリスナーを設定
    if (this.electronService.isElectron) {
      this.electronService.onMenuCommand(async (command: string) => {
        if (command === 'save') {
          const windowsData = await this.prepareWindowsForSerialization();
          const result = await this.notebookService.saveToFile(windowsData);
          if (result.success && result.filePath) {
            alert(`${windowsData.length}個のウィンドウ情報を保存しました`);
          } else if (result.error) {
            alert(`保存に失敗しました: ${result.error}`);
          }
        } else if (command === 'open') {
          const result = await this.notebookService.loadFromFile();
          if (result.success && result.windows) {
            const restoredCount = await this.applyRestoredWindows(result.windows, {
              showEmptyConfirm: true,
              showSuccessAlert: true,
            });
          } else if (result.error) {
            alert(`ファイルの読み込みに失敗しました: ${result.error}`);
          }
        }
      });
    }

    void this.initializeWindows();
    void this.initializeIpyflowComm();
  }

  /**
   * IPyflow Comm接続を初期化
   */
  private async initializeIpyflowComm(): Promise<void> {
    try {
      // Pythonランタイムが初期化されるまで待つ
      await this.pythonRuntime.initialize();

      // カーネルが準備完了してからIPyflow Commを初期化
      if (this.pythonRuntime.isReady()) {
        await this.ipyflowComm.initialize();
      } else {
        // カーネルが準備できていない場合、準備完了を待つ
        const maxWaitTime = 15000;
        const startTime = Date.now();
        while (!this.pythonRuntime.isReady()) {
          const elapsed = Date.now() - startTime;
          if (elapsed > maxWaitTime) {
            console.warn('[FloatingWindowManager] IPyflow Comm initialization timeout');
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        await this.ipyflowComm.initialize();
      }
    } catch (error) {
      console.error('[FloatingWindowManager] IPyflow Comm initialization failed:', error);
    }
  }

  private async initializeWindows(): Promise<void> {
    try {
      const restoredWindows = await this.notebookService.loadFromLocalStorage();
      if (restoredWindows && restoredWindows.length > 0) {
        await this.applyRestoredWindows(restoredWindows, {
          showEmptyConfirm: false,
          showSuccessAlert: false,
        });
      } else if (!this.hasInitialized && this.windows.length === 0) {
        this.hasInitialized = true;
        this.createInitialInfoWindows();
      }
    } catch (error) {
      console.error('初期化処理中にエラーが発生しました:', error);
      if (!this.hasInitialized && this.windows.length === 0) {
        this.hasInitialized = true;
        this.createInitialInfoWindows();
      }
    }
  }

  private async prepareWindowsForSerialization(): Promise<FloatingWindow[]> {
    for (const [windowId, componentRef] of this.windowComponents.entries()) {
      try {
        const windowComponent = componentRef.instance;
        if (windowComponent instanceof FloatingEditorWindowComponent) {
          windowComponent.syncEditorContent();
        }
        // FloatingInfoWindowComponentは自動的にコンテンツを管理するため、同期は不要
      } catch (error) {
        console.error(`ウィンドウ情報の同期に失敗しました (ID: ${windowId}):`, error);
      }
    }

    return this.windowManager.getAllWindows().map(window => ({ ...window }));
  }


  private async applyRestoredWindows(restoredWindows: FloatingWindow[], options: RestoreWindowsOptions = {}): Promise<number> {
    const {
      showEmptyConfirm = false,
      emptyConfirmMessage = 'Notebook内にウィンドウがありません。全てのウィンドウを閉じますか？',
      showSuccessAlert = false,
      successMessage,
    } = options;

    if (restoredWindows.length === 0) {
      if (showEmptyConfirm) {
        const shouldContinue = confirm(emptyConfirmMessage);
        if (!shouldContinue) {
          return 0;
        }
      }
    }

    const container = await this.waitForFloatingContainer();

    // 既存のウィンドウを全て削除
    this.windowManager.clearAllWindows();
    for (const componentRef of this.windowComponents.values()) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }
    this.windowComponents.clear();

    // 既存のコンソールコンポーネントも全て削除
    for (const componentRef of this.consoleComponents.values()) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }
    this.consoleComponents.clear();

    this.hasInitialized = true;

    if (restoredWindows.length === 0) {
      return 0;
    }

    const windowDataMap = new Map(restoredWindows.map(window => [window.id, window]));

    // Zインデックス順に並べて復元
    const sortedWindows = [...restoredWindows].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    // 各ウィンドウを復元
    const restoredWindowIds: string[] = [];
    for (const windowData of sortedWindows) {
      try {
        const { id, needsSpawnAdjustment: _unused, ...rest } = windowData;
        const windowId = this.windowManager.restoreWindow({
          ...rest,
          title: windowData.title || 'Untitled',
          x: typeof windowData.x === 'number' ? windowData.x : 0,
          y: typeof windowData.y === 'number' ? windowData.y : 0,
          width: typeof windowData.width === 'number' ? windowData.width : 300,
          height: typeof windowData.height === 'number' ? windowData.height : 200,
          zIndex: typeof windowData.zIndex === 'number' ? windowData.zIndex : 1000,
          isMinimized: Boolean(windowData.isMinimized),
          content: windowData.content || '',
          filePath: windowData.filePath,
          autoRun: Boolean(windowData.autoRun),
          type: windowData.type ?? 'editor',
          id
        });

        // ウィンドウコンポーネントを作成
        this.createWindowComponent(windowId, container);
        restoredWindowIds.push(windowId);
      } catch (error: any) {
        console.error(`ウィンドウの復元に失敗しました (ID: ${windowData.id}):`, error);
      }
    }

    // エディタの内容を設定（非同期で並列処理）
    const setContentPromises = restoredWindowIds.map(async (windowId) => {
      try {
        const componentRef = this.windowComponents.get(windowId);
        if (componentRef) {
          const windowComponent = componentRef.instance;
          const windowData = windowDataMap.get(windowId);
          if (windowData && windowComponent instanceof FloatingEditorWindowComponent) {
            await windowComponent.setEditorContent(windowData.content || '');
          }
        }
      } catch (error: any) {
        console.error(`エディタコンテンツの設定に失敗しました (ID: ${windowId}):`, error);
      }
    });

    await Promise.all(setContentPromises);

    // 古い形式のファイルに対応: エディタウィンドウに対応するコンソールがない場合は作成
    this.ensureConsolePairsForEditors();

    const restoredCount = restoredWindowIds.length;

    if (showSuccessAlert && restoredCount > 0) {
      alert(successMessage ?? `${restoredCount}個のウィンドウを復元しました`);
    }

    return restoredCount;
  }

  /**
   * 各エディタウィンドウに対応するコンソールウィンドウが存在することを確認し、
   * 存在しない場合は自動生成します（古い形式のファイルからの復元に対応）
   */
  private ensureConsolePairsForEditors(): void {
    const allWindows = this.windowManager.getAllWindows();
    const editorWindows = allWindows.filter(w => w.type === 'editor');
    const consoleWindowIds = new Set(allWindows.filter(w => w.type === 'console').map(w => w.id));

    for (const editor of editorWindows) {
      const expectedConsoleId = `${editor.id}-console`;
      if (!consoleWindowIds.has(expectedConsoleId)) {
        // 対応するコンソールが存在しないので作成
        this.windowManager.restoreWindow({
          id: expectedConsoleId,
          title: editor.title,
          x: editor.x + 30,
          y: editor.y + 30,
          width: 700,
          height: 400,
          zIndex: editor.zIndex + 1,
          isMinimized: false,
          content: '',
          type: 'console',
          needsSpawnAdjustment: true,
          editorId: editor.id
        });
      }
    }
  }

  private async waitForFloatingContainer(timeoutMs = 5000): Promise<HTMLDivElement> {
    const start = Date.now();
    while (true) {
      const container = this.css2DService.getFloatingContainer();
      if (container) {
        return container;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('フローティングコンテナが初期化されませんでした');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }


  /**
   * ウィンドウコンポーネントを動的に更新します
   */
  private updateWindowComponents(): void {
    const floatingContainer = this.css2DService.getFloatingContainer();
    
    if (!floatingContainer) {
      return;
    }

    // 現在のウィンドウIDのセット
    // const currentWindowIds = new Set(this.windows.map(w => w.id));
    // コンソールウィンドウは、エディタウィンドウとペアなので除外する
    const nonConsoleWindows = this.windows.filter(w => w.type !== 'console');
    const currentWindowIds = new Set(nonConsoleWindows.map(w => w.id));
    
    // 削除されたウィンドウのコンポーネントを破棄
    for (const [windowId, componentRef] of this.windowComponents.entries()) {
      if (!currentWindowIds.has(windowId)) {
        componentRef.destroy();
        this.windowComponents.delete(windowId);
      }
    }
    
    // 新しいウィンドウのコンポーネントを作成
    for (const window of nonConsoleWindows) {
      if (!this.windowComponents.has(window.id)) {
        this.createWindowComponent(window.id, floatingContainer);
      }
    }
  }

  /**
   * コンソールコンポーネントを動的に更新します
   */
  private updateConsoleComponents(): void {
    const consoleContainer = this.css2DService.getConsoleContainer();
    
    if (!consoleContainer) {
      return;
    }

    // コンソールウィンドウ（type === 'console'）のIDを収集
    const consoleWindowIds = new Set(
      this.windows.filter(w => w.type === 'console').map(w => w.id)
    );
    
    // 削除されたコンソールウィンドウのコンポーネントを破棄
    for (const [consoleId, componentRef] of this.consoleComponents.entries()) {
      if (!consoleWindowIds.has(consoleId)) {
        this.appRef.detachView(componentRef.hostView);
        componentRef.destroy();
        this.consoleComponents.delete(consoleId);
      }
    }
    
    // 新しいコンソールコンポーネントを作成
    for (const consoleId of consoleWindowIds) {
      if (!this.consoleComponents.has(consoleId)) {
        this.createConsoleComponent(consoleId, consoleContainer);
      }
    }
  }

  /**
   * ウィンドウコンポーネントを動的に作成してコンテナに追加します
   */
  private createWindowComponent(windowId: string, container: HTMLElement): void {
    // ウィンドウ情報を取得してタイプを判定
    const window = this.windowManager.getWindow(windowId);
    if (!window) {
      console.error(`ウィンドウが見つかりません: ${windowId}`);
      return;
    }

    // タイプに応じたコンポーネントを作成
    let componentRef: ComponentRef<FloatingEditorWindowComponent | FloatingInfoWindowComponent>;
    
    if (window.type === 'info') {
      // フォールバック: 既存のコンポーネントを使用
      componentRef = createComponent(FloatingInfoWindowComponent, {
        environmentInjector: this.injector
      });
    } else {
      componentRef = createComponent(FloatingEditorWindowComponent, {
        environmentInjector: this.injector
      });
    }
    
    // windowIdを設定
    componentRef.setInput('windowId', windowId);
    
    // 変更検知を実行
    componentRef.changeDetectorRef.detectChanges();
    
    // コンテナにDOM要素を追加
    container.appendChild(componentRef.location.nativeElement);
    
    // ApplicationRefにアタッチして変更検知の対象にする
    this.appRef.attachView(componentRef.hostView);
    
    // 参照を保存
    this.windowComponents.set(windowId, componentRef);
  }

  /**
   * コンソールコンポーネントを動的に作成してコンテナに追加します
   * @param consoleId コンソールウィンドウの固有ID（{editorId}-console形式）
   */
  private createConsoleComponent(consoleId: string, container: HTMLElement): void {
    // コンソールコンポーネントを作成
    const componentRef = createComponent(FloatingConsoleWindowComponent, {
      environmentInjector: this.injector
    });
    
    // コンソール固有のwindowIdを設定
    componentRef.setInput('windowId', consoleId);
    
    // 変更検知を実行
    componentRef.changeDetectorRef.detectChanges();
    
    // コンテナにDOM要素を追加
    container.appendChild(componentRef.location.nativeElement);
    
    // ApplicationRefにアタッチして変更検知の対象にする
    this.appRef.attachView(componentRef.hostView);
    
    // 参照を保存
    this.consoleComponents.set(consoleId, componentRef);
  }

  /**
   * コンポーネント破棄時のクリーンアップ
   */
  ngOnDestroy(): void {
    // すべての動的コンポーネントを破棄
    for (const componentRef of this.windowComponents.values()) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }
    this.windowComponents.clear();

    // すべてのコンソールコンポーネントを破棄
    for (const componentRef of this.consoleComponents.values()) {
      this.appRef.detachView(componentRef.hostView);
      componentRef.destroy();
    }
    this.consoleComponents.clear();

  }

  /**
   * 新しいエディタウィンドウを作成します
   * 
   * 役割：
   * - ウィンドウのタイトルを生成
   * - 初期コンテンツを空に設定
   * - WindowManagerServiceを通じてウィンドウを作成
   */
  createNewWindow(): void {
    const windowCount = this.windows.length;
    const windowTitle = windowCount === 0 ? 'Python Editor' : `Python Editor ${windowCount + 1}`;
    
    // 初期コンテンツは空文字を設定
    this.windowManager.createWindow(windowTitle, '');
  }

  /**
   * 起動時の情報ウィンドウを作成します
   */
  private createInitialInfoWindows(): void {
    const editorWindowId = this.windowManager.createWindow('main', '', false, undefined, 'editor');
    const informationWindowId = this.windowManager.createWindow('', 'introduction.html', false, undefined, 'info');
  }

  /**
   * 情報ウィンドウを作成します
   * 
   * 役割：
   * - 情報ウィンドウのタイトルを生成
   * - デフォルトのHTMLコンテンツを設定（ホームページ）
   * - WindowManagerServiceを通じてウィンドウを作成
   */
  createInfoWindow(): void {
    const infoWindowCount = this.windows.filter(w => w.type === 'info').length;
    const windowTitle = infoWindowCount === 0 ? 'Information' : `Information ${infoWindowCount + 1}`;
    
    // デフォルトのコンテンツを空文字列に設定（ヒントを表示するため）
    const initialContent = '';
    
    // 情報ウィンドウを作成
    this.windowManager.createWindow(windowTitle, initialContent, false, undefined, 'info');
  }

  restoreWindow(id: string): void {
    this.windowManager.minimizeWindow(id);
  }

  /**
   * セッションをリセット
   */
  async onResetSession(): Promise<void> {
    // 確認ダイアログを表示
    const confirmed = confirm('セッションをリセットしますか？\nすべての変数と実行状態がクリアされます。');
    if (!confirmed) {
      return;
    }

    try {
      await this.executionService.resetSession();
      // 成功メッセージを表示（オプション）
      // 必要に応じて、ユーザーに通知するUIを追加
    } catch (error) {
      console.error('[FloatingWindowManager] セッションリセット失敗:', error);
      alert('セッションリセットに失敗しました。詳細はコンソールを確認してください。');
    }
  }

}

