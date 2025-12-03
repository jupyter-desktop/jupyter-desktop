import { ElementRef, Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { FloatingWindowCSS2DService } from './floating-window-css2d.service';

/**
 * FloatingWindowManagerService
 * 
 * 【役割】
 * - フローティングウィンドウの状態管理（作成、削除、更新）
 * - ウィンドウの位置・サイズ・Zインデックスの管理
 * - ドラッグ・リサイズ操作の処理
 * - ウィンドウの初期配置アルゴリズム（螺旋配置）
 * - エディタウィンドウとコンソールウィンドウのペア管理
 * 
 * 【責務の境界】
 * - ウィンドウの状態管理のみを担当（表示はコンポーネント側）
 * - ドラッグ・リサイズのイベント処理と座標計算
 * - CSS2D空間での座標変換はCSS2DServiceに委譲
 * - ウィンドウコンポーネントの作成はFloatingWindowManagerComponentが担当
 */

export interface FloatingWindow {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isMinimized: boolean;
  content: string;
  filePath?: string;
  autoRun?: boolean;  // 起動時に自動実行するかどうか
  type?: 'editor' | 'info' | 'console';  // ウィンドウのタイプ (デフォルト: 'editor')
  needsSpawnAdjustment?: boolean; // 初期スポーン位置の自動調整が必要か
  editorId?: string;  // コンソールウィンドウの場合、関連付けられたエディタのID
}

interface ViewRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

@Injectable({
  providedIn: 'root'
})
export class FloatingWindowManagerService {
  private windows$ = new BehaviorSubject<FloatingWindow[]>([]);
  private nextId = 1;
  private maxZIndex = 1000;
  private windowElements = new Map<string, HTMLElement>();

  // ドラッグ・リサイズ状態
  private activeWindowId: string | null = null;
  private isDragging = false;
  private isResizing = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private windowStartX = 0;
  private windowStartY = 0;
  private resizeStartX = 0;
  private resizeStartY = 0;
  private resizeStartWidth = 0;
  private resizeStartHeight = 0;
  private dragStartWidth = 0;
  private dragStartHeight = 0;

  // パフォーマンス最適化用
  private rafId: number | null = null;
  private pendingX: number | null = null;
  private pendingY: number | null = null;
  private pendingWidth: number | null = null;
  private pendingHeight: number | null = null;
  private windowElement: HTMLElement | null = null;
  private spawnAdjustmentScheduled = new Set<string>();

  // 螺旋配置アルゴリズム用の定数
  private readonly INITIAL_RADIUS = 0; // 初期半径
  private readonly STEP_DISTANCE = 225; // ステップ距離（デフォルト225px）
  private readonly ANGLE_STEP = 25; // 角度ステップ（デフォルト25度）
  private readonly MAX_RADIUS = 2000; // 最大探索半径
  private readonly SAFE_MARGIN = 12; // 衝突判定の安全マージン

  readonly windows = this.windows$.asObservable();

  constructor(
    private readonly css2DService: FloatingWindowCSS2DService,
    private readonly ngZone: NgZone
  ) {}

  createWindow(title: string = 'Untitled', content: string = '', autoRun: boolean = false, filePath?: string, type: 'editor' | 'info' | 'console' = 'editor'): string {
    const id = `window-${this.nextId++}`;
    
    // タイプに応じてデフォルトサイズを設定
    let defaultWidth = 300;
    let defaultHeight = 200;
    if (type === 'info') {
      defaultWidth = 500;
      defaultHeight = 400;
    }
    
    const newWindow: FloatingWindow = {
      id,
      title,
      x: 0,
      y: 0,
      width: defaultWidth,
      height: defaultHeight,
      zIndex: ++this.maxZIndex,
      isMinimized: false,
      content,
      filePath,
      autoRun,
      type,
      needsSpawnAdjustment: true
    };

    const windows = [...this.windows$.value, newWindow];

    this.windows$.next(windows);
    return id;
  }

  closeWindow(id: string): void {
    this.windowElements.delete(id);
    
    // エディタウィンドウの場合、対応するコンソールウィンドウも閉じる
    const window = this.getWindow(id);
    if (window?.type === 'editor') {
      const consoleId = `${id}-console`;
      this.windowElements.delete(consoleId);
      this.windows$.next(this.windows$.value.filter(w => w.id !== id && w.id !== consoleId));
    } else {
      this.windows$.next(this.windows$.value.filter(w => w.id !== id));
    }
  }

  minimizeWindow(id: string): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, isMinimized: !w.isMinimized } : w
    );
    this.windows$.next(windows);
  }

  bringToFront(id: string): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, zIndex: ++this.maxZIndex } : w
    );
    this.windows$.next(windows);
  }

  updatePosition(id: string, x: number, y: number): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, x, y } : w
    );
    this.windows$.next(windows);
  }

  updateSize(id: string, width: number, height: number): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, width, height } : w
    );
    this.windows$.next(windows);
  }

  updateContent(id: string, content: string): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, content } : w
    );
    this.windows$.next(windows);
  }

  updateTitle(id: string, title: string): void {
    const window = this.getWindow(id);
    const windows = this.windows$.value.map(w => {
      if (w.id === id) {
        return { ...w, title };
      }
      // エディタウィンドウのタイトルが変更された場合、コンソールのタイトルも更新
      if (window?.type === 'editor' && w.id === `${id}-console`) {
        return { ...w, title: `${title} - Console` };
      }
      return w;
    });
    this.windows$.next(windows);
  }

  getWindow(id: string): FloatingWindow | undefined {
    return this.windows$.value.find(w => w.id === id);
  }

  /**
   * 全てのウィンドウを削除します
   */
  clearAllWindows(): void {
    this.windowElements.clear();
    this.windows$.next([]);
  }

  /**
   * 既存のウィンドウ情報から直接ウィンドウを作成します
   * ファイルから読み込んだウィンドウ情報を復元する際に使用
   */
  restoreWindow(windowData: Omit<FloatingWindow, 'id'> & { id?: string }): string {
    const id = windowData.id || `window-${this.nextId++}`;
    
    // IDから番号を抽出してnextIdを更新（エラー処理を追加）
    if (windowData.id) {
      try {
        const idParts = windowData.id.split('-');
        if (idParts.length === 2) {
          const idNumber = parseInt(idParts[1], 10);
          if (!isNaN(idNumber) && idNumber >= this.nextId) {
            this.nextId = idNumber + 1;
          }
        }
      } catch (error) {
        console.warn(`ウィンドウID "${windowData.id}" の解析に失敗しました`);
      }
    }
    
    // zIndexの処理を統一（重複を解消）
    const zIndex = windowData.zIndex || ++this.maxZIndex;
    if (zIndex > this.maxZIndex) {
      this.maxZIndex = zIndex;
    }
    
    const restoredWindow: FloatingWindow = {
      id,
      title: windowData.title,
      x: windowData.x,
      y: windowData.y,
      width: windowData.width,
      height: windowData.height,
      zIndex,
      isMinimized: windowData.isMinimized,
      content: windowData.content,
      filePath: windowData.filePath,
      autoRun: windowData.autoRun,
      type: windowData.type,
      needsSpawnAdjustment: false,
      editorId: windowData.editorId
    };

    this.windows$.next([...this.windows$.value, restoredWindow]);
    return id;
  }
  
  /**
   * 全てのウィンドウを取得します
   */
  getAllWindows(): FloatingWindow[] {
    return this.windows$.value;
  }

  registerWindowElement(id: string, element: HTMLElement): void {
    this.windowElements.set(id, element);
  }

  unregisterWindowElement(id: string): void {
    this.windowElements.delete(id);
  }

  getWindowElement(id: string): HTMLElement | undefined {
    const element = this.windowElements.get(id);
    if (element && !element.isConnected) {
      this.windowElements.delete(id);
      return undefined;
    }
    return element;
  }

  /**
   * 初期スポーン位置の自動調整を完了したウィンドウをマークします
   */
  markSpawnAdjustmentComplete(id: string): void {
    const windows = this.windows$.value.map(w => 
      w.id === id ? { ...w, needsSpawnAdjustment: false } : w
    );
    this.windows$.next(windows);
  }

  /**
   * ウィンドウのマウスダウンイベントを処理します（最前面に移動）
   */
  handleWindowMouseDown(windowId: string): void {
    this.bringToFront(windowId);
  }

  ensureConsoleWindow(editorId: string): void {
    const editorWindow = this.getWindow(editorId);
    if (!editorWindow || editorWindow.type !== 'editor') {
      return;
    }

    const existingConsole = this.windows$.value.find(
      w => w.type === 'console' && w.editorId === editorId
    );
    if (existingConsole) {
      return;
    }

    const consoleWindow: FloatingWindow = {
      id: `${editorId}-console`,
      title: editorWindow.title,
      x: editorWindow.x + editorWindow.width + 30,
      y: editorWindow.y,
      width: 300,
      height: 200,
      zIndex: ++this.maxZIndex,
      isMinimized: false,
      content: '',
      type: 'console',
      needsSpawnAdjustment: true,
      editorId
    };

    this.windows$.next([...this.windows$.value, consoleWindow]);
  }

  /**
   * ビューポートの中心座標を取得します
   */
  private getViewportCenter(): { x: number; y: number } {
    if (typeof window !== 'undefined') {
      return {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      };
    }
    return { x: 0, y: 0 };
  }

  /**
   * フローティングウィンドウの初期配置を調整
   */
  ensureInitialPlacement(windowId: string, windowElement?: ElementRef<HTMLElement>): void {
    const element = windowElement?.nativeElement;
    const windowData = this.getWindow(windowId);

    if (!element || !windowData || !windowData.needsSpawnAdjustment) {
      return;
    }

    if (this.spawnAdjustmentScheduled.has(windowId)) {
      return;
    }

    this.spawnAdjustmentScheduled.add(windowId);

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.ngZone.run(() => {
          this.adjustInitialPlacement(windowId, element);
        });
      });
    });
  }

  /**
   * ドラッグ開始
   */
  startDrag(
    event: MouseEvent,
    windowId: string,
    windowElement?: ElementRef<HTMLElement>
  ): void {
    const target = event.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('.titlebar-btn')) {
      return;
    }

    event.preventDefault();

    const window = this.getWindow(windowId);
    if (!window) return;

    this.activeWindowId = windowId;
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.windowStartX = window.x;
    this.windowStartY = window.y;
    this.windowElement = windowElement?.nativeElement || null;

    this.dragStartWidth = window.width;
    this.dragStartHeight = window.height;

    this.pendingX = this.windowStartX;
    this.pendingY = this.windowStartY;
    this.applyPendingState();

    this.pendingWidth = null;
    this.pendingHeight = null;

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    });
  }

  /**
   * リサイズ開始
   */
  startResize(
    event: MouseEvent,
    windowId: string,
    windowElement?: ElementRef<HTMLElement>
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const window = this.getWindow(windowId);
    if (!window) return;

    this.activeWindowId = windowId;
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartY = event.clientY;
    this.resizeStartWidth = window.width;
    this.resizeStartHeight = window.height;
    this.windowElement = windowElement?.nativeElement || null;

    this.pendingX = null;
    this.pendingY = null;

    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    });
  }

  isDraggingWindow(windowId: string): boolean {
    return this.isDragging && this.activeWindowId === windowId;
  }

  isResizingWindow(windowId: string): boolean {
    return this.isResizing && this.activeWindowId === windowId;
  }

  isDraggingOrResizingWindow(windowId: string): boolean {
    return (this.isDragging || this.isResizing) && this.activeWindowId === windowId;
  }

  cleanupInteractions(): void {
    this.cleanupEventListeners();
    this.activeWindowId = null;
    this.windowElement = null;
    this.spawnAdjustmentScheduled.clear();
  }

  getActiveWindowPosition(windowId: string): { x: number; y: number } | null {
    if (this.isDragging && this.activeWindowId === windowId) {
      const x = this.pendingX ?? this.windowStartX;
      const y = this.pendingY ?? this.windowStartY;
      return { x, y };
    }
    return null;
  }

  getActiveWindowSize(windowId: string): { width: number; height: number } | null {
    if (this.activeWindowId !== windowId) {
      return null;
    }

    if (this.isDragging) {
      return {
        width: this.dragStartWidth,
        height: this.dragStartHeight
      };
    }

    if (this.isResizing) {
      const width = this.pendingWidth ?? this.resizeStartWidth;
      const height = this.pendingHeight ?? this.resizeStartHeight;
      return { width, height };
    }

    return null;
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging && !this.isResizing) {
      return;
    }

    const clientX = event.clientX;
    const clientY = event.clientY;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.rafId = requestAnimationFrame(() => {
      if (this.isDragging) {
        const deltaX = clientX - this.dragStartX;
        const deltaY = clientY - this.dragStartY;
        const scale = this.css2DService.getCurrentScale();
        const adjustedDeltaX = scale > 0 ? deltaX / scale : deltaX;
        const adjustedDeltaY = scale > 0 ? deltaY / scale : deltaY;

        this.pendingX = Math.round(this.windowStartX + adjustedDeltaX);
        this.pendingY = Math.round(this.windowStartY + adjustedDeltaY);
      } else if (this.isResizing) {
        const deltaX = clientX - this.resizeStartX;
        const deltaY = clientY - this.resizeStartY;
        const scale = this.css2DService.getCurrentScale();
        const adjustedDeltaX = scale > 0 ? deltaX / scale : deltaX;
        const adjustedDeltaY = scale > 0 ? deltaY / scale : deltaY;

        this.pendingWidth = Math.max(300, Math.round(this.resizeStartWidth + adjustedDeltaX));
        this.pendingHeight = Math.max(200, Math.round(this.resizeStartHeight + adjustedDeltaY));
      }

      this.applyPendingState();
      this.rafId = null;
    });
  };

  private onMouseUp = (): void => {
    if (!this.activeWindowId) return;

    const wasDragging = this.isDragging;
    const wasResizing = this.isResizing;
    const finalX = this.pendingX;
    const finalY = this.pendingY;
    const finalWidth = this.pendingWidth;
    const finalHeight = this.pendingHeight;
    const windowId = this.activeWindowId;

    this.isDragging = false;
    this.isResizing = false;
    this.activeWindowId = null;
    this.windowElement = null;

    this.ngZone.run(() => {
      if (wasDragging && finalX !== null && finalY !== null) {
        this.updatePosition(windowId, finalX, finalY);
      }
      if (wasResizing && finalWidth !== null && finalHeight !== null) {
        this.updateSize(windowId, finalWidth, finalHeight);
      }
    });

    this.pendingX = null;
    this.pendingY = null;
    this.pendingWidth = null;
    this.pendingHeight = null;

    this.cleanupEventListeners();
  };

  private applyPendingState(): void {
    if (!this.windowElement) {
      return;
    }

    if (this.pendingX !== null) {
      this.windowElement.style.left = `${this.pendingX}px`;
    }
    if (this.pendingY !== null) {
      this.windowElement.style.top = `${this.pendingY}px`;
    }

    if (this.isDragging) {
      this.windowElement.style.width = `${this.dragStartWidth}px`;
      this.windowElement.style.height = `${this.dragStartHeight}px`;
    }

    if (this.isResizing) {
      if (this.pendingWidth !== null) {
        this.windowElement.style.width = `${this.pendingWidth}px`;
      }
      if (this.pendingHeight !== null) {
        this.windowElement.style.height = `${this.pendingHeight}px`;
      }
    }
  }

  private cleanupEventListeners(): void {
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.onMouseUp);
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private adjustInitialPlacement(windowId: string, element: HTMLElement): void {
    try {
      const windowData = this.getWindow(windowId);

      if (!windowData || !windowData.needsSpawnAdjustment) {
        return;
      }

      // 現在のウィンドウ位置をビューポート座標で取得
      const baseRect = this.normalizeRect(element.getBoundingClientRect());
      if (!baseRect) {
        this.markSpawnAdjustmentComplete(windowId);
        return;
      }

      const avoidRects = this.collectAvoidRects(element);
      if (avoidRects.length === 0) {
        this.markSpawnAdjustmentComplete(windowId);
        return;
      }

      // ビューポート中心を取得
      const viewportCenter = this.getViewportCenter();
      
      // 螺旋位置を生成（ビューポート座標）
      const spiralPositions = this.generateSpiralPositions(viewportCenter.x, viewportCenter.y);
      
      // 現在のウィンドウ位置の中心（ビューポート座標）
      const currentCenterX = baseRect.left + baseRect.width / 2;
      const currentCenterY = baseRect.top + baseRect.height / 2;

      // 最初に衝突しない螺旋位置を見つける
      let selectedPosition: { x: number; y: number } | null = null;
      
      for (const spiralPos of spiralPositions) {
        // 螺旋位置からウィンドウの左上角へのオフセットを計算
        const offsetX = spiralPos.x - currentCenterX;
        const offsetY = spiralPos.y - currentCenterY;
        
        // ウィンドウ矩形を移動
        const shiftedRect = this.shiftRect(baseRect, offsetX, offsetY);
        
        // 衝突判定
        if (!this.intersectsAny(shiftedRect, avoidRects, this.SAFE_MARGIN)) {
          selectedPosition = spiralPos;
          break;
        }
      }

      // 見つかった位置にウィンドウを配置
      if (selectedPosition) {
        // ビューポート座標からCSS座標へのオフセットを計算
        const offsetX = selectedPosition.x - currentCenterX;
        const offsetY = selectedPosition.y - currentCenterY;
        
        // CSS座標（windowData.x, windowData.y）にオフセットを適用
        this.updatePosition(
          windowId,
          Math.round(windowData.x + offsetX),
          Math.round(windowData.y + offsetY)
        );
      }

      this.markSpawnAdjustmentComplete(windowId);
    } finally {
      this.spawnAdjustmentScheduled.delete(windowId);
    }
  }

  private collectAvoidRects(currentElement: HTMLElement): ViewRect[] {
    const rects: ViewRect[] = [];

    if (typeof document !== 'undefined') {
      const floatingWindows = document.querySelectorAll('.floating-window');
      floatingWindows.forEach(element => {
        if (element instanceof HTMLElement && element !== currentElement) {
          const normalized = this.normalizeRect(element.getBoundingClientRect());
          if (normalized) {
            rects.push(normalized);
          }
        }
      });

      const css2dObstacles = document.querySelectorAll('[data-css2d-obstacle="true"]');
      css2dObstacles.forEach(element => {
        if (element instanceof HTMLElement && element !== currentElement) {
          const normalized = this.normalizeRect(element.getBoundingClientRect());
          if (normalized) {
            rects.push(normalized);
          }
        }
      });
    }

    return rects;
  }

  private normalizeRect(rect?: DOMRect | null): ViewRect | null {
    if (!rect) {
      return null;
    }

    const width = typeof rect.width === 'number' ? rect.width : 0;
    const height = typeof rect.height === 'number' ? rect.height : 0;

    if (width <= 0 || height <= 0) {
      return null;
    }

    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width,
      height
    };
  }

  private shiftRect(rect: ViewRect, deltaX: number, deltaY: number): ViewRect {
    return {
      left: rect.left + deltaX,
      right: rect.right + deltaX,
      top: rect.top + deltaY,
      bottom: rect.bottom + deltaY,
      width: rect.width,
      height: rect.height
    };
  }

  private intersectsAny(target: ViewRect, rects: ViewRect[], margin: number): boolean {
    return rects.some(rect => this.rectsIntersect(target, rect, margin));
  }

  private rectsIntersect(a: ViewRect, b: ViewRect, margin: number): boolean {
    return !(
      a.right <= b.left - margin ||
      a.left >= b.right + margin ||
      a.bottom <= b.top - margin ||
      a.top >= b.bottom + margin
    );
  }

  /**
   * アーキメデスの螺旋アルゴリズムで候補位置を生成します
   * 
   * @param centerX 螺旋の中心X座標（ビューポート座標）
   * @param centerY 螺旋の中心Y座標（ビューポート座標）
   * @returns 候補位置の配列（ビューポート座標）
   */
  private generateSpiralPositions(centerX: number, centerY: number): { x: number; y: number }[] {
    const positions: { x: number; y: number }[] = [];
    
    let angle = 0; // 度数で開始
    let radius = this.INITIAL_RADIUS;
    
    // 角度をラジアンに変換するための係数
    const DEG_TO_RAD = Math.PI / 180;
    
    // 各ステップでの半径増加量を計算
    // 円周に沿った距離が STEP_DISTANCE になるようにする
    const radiusIncrementPerDegree = this.STEP_DISTANCE / (2 * Math.PI) * (this.ANGLE_STEP * DEG_TO_RAD);
    
    while (radius <= this.MAX_RADIUS) {
      const angleRad = angle * DEG_TO_RAD;
      const x = centerX + radius * Math.cos(angleRad);
      const y = centerY + radius * Math.sin(angleRad);
      
      positions.push({ x, y });
      
      // 次のステップへ
      angle += this.ANGLE_STEP;
      radius += radiusIncrementPerDegree;
    }
    
    return positions;
  }
}

