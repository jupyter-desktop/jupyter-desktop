import { Injectable, ElementRef } from '@angular/core';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import * as THREE from 'three';

/**
 * FloatingWindowCSS2DService
 * 
 * 【役割】
 * - フローティングウィンドウとThree.jsのCSS2Dレンダリングの統合を担当
 * - DOM要素をCSS2DObjectとして3D空間に配置
 * - CSS2DRendererのライフサイクル管理
 * - カメラ距離に基づくウィンドウのスケール調整
 * - エディタ用とコンソール用の2つのコンテナ管理
 * - レンダリング最適化（操作中のみレンダリング）
 * 
 * 【責務の境界】
 * - CSS2Dレンダリングの初期化とレンダリング
 * - フローティングウィンドウコンテナとコンソールコンテナの3D空間への配置
 * - レンダラーのリサイズとクリーンアップ
 * - ウィンドウコンポーネントの作成はFloatingWindowManagerComponentが担当
 */
@Injectable({
  providedIn: 'root'
})
export class FloatingWindowCSS2DService {
  private css2DRenderer?: CSS2DRenderer;
  private css2DObject?: CSS2DObject;
  private hostElement?: HTMLElement;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private floatingContainer?: HTMLDivElement;
  private consoleContainer?: HTMLDivElement;
  private consoleContainerObject?: CSS2DObject;
  private isContainerVisible = true;
  private isConsoleContainerVisible = true;
  
  // コンソール用CSS2Dオブジェクトを管理
  private consoleCSS2DObjects = new Map<string, CSS2DObject>();
  
  // スケール計算用の設定
  private baseDistance: number | null = null; // 基準距離（起動時の距離で初期化）
  private readonly MIN_SCALE = 0.1; // 最小スケール
  private readonly MAX_SCALE = 5.0; // 最大スケール
  
  // レンダリング最適化用
  private needsRender = false;
  private isInteracting = false;
  private lastCameraPosition = new THREE.Vector3();
  private readonly CAMERA_MOVE_THRESHOLD = 0.1; // 最小移動量

  /**
   * CSS2DRendererとフローティングウィンドウコンテナを初期化します
   * 
   * @param hostElement レンダラーを配置する親要素
   * @param width レンダラーの幅
   * @param height レンダラーの高さ
   */
  initializeRenderer(hostElement: HTMLElement, width: number, height: number): CSS2DRenderer {
    this.dispose();

    this.hostElement = hostElement;
    this.css2DRenderer = new CSS2DRenderer();
    this.css2DRenderer.setSize(width, height);
    
    // CSS2DRendererのスタイル設定
    const rendererElement = this.css2DRenderer.domElement;
    rendererElement.style.position = 'absolute';
    rendererElement.style.top = '0';
    rendererElement.style.left = '0';
    rendererElement.style.pointerEvents = 'none';
    rendererElement.style.zIndex = '10';
    
    hostElement.appendChild(rendererElement);

    // フローティングウィンドウコンテナを作成
    this.createFloatingContainer();
    // コンソール用フローティングウィンドウコンテナを作成
    this.createConsoleContainer();
    this.applyContainerVisibility();

    return this.css2DRenderer;
  }

  /**
   * フローティングウィンドウコンテナDOM要素を作成します
   * 
   * このメソッドは内部的に呼ばれ、
   * .floating-windows-container要素を動的に生成します。
   */
  private createFloatingContainer(): HTMLDivElement {
    if (this.floatingContainer) {
      this.applyContainerVisibility();
      return this.floatingContainer;
    }

    const container = document.createElement('div');
    container.className = 'floating-windows-container';
    
    // CSSスタイルをインラインで設定
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
    container.style.height = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '100';

    // 子要素のpointer-eventsを有効化するためのスタイルを追加
    const style = document.createElement('style');
    style.textContent = `
      .floating-windows-container > * {
        pointer-events: all;
      }
    `;
    document.head.appendChild(style);

    this.floatingContainer = container;
    this.applyContainerVisibility();
    
    return container;
  }

  /**
   * フローティングウィンドウコンテナを取得します
   * 
   * FloatingWindowManagerComponentがウィンドウコンポーネントを
   * このコンテナに追加できるようにします。
   */
  getFloatingContainer(): HTMLDivElement | undefined {
    return this.floatingContainer;
  }

  /**
   * コンソール用フローティングウィンドウコンテナDOM要素を作成します
   * 
   * チャート用コンテナと同様に、ConsoleウィンドウをCSS2D空間へ配置する
   * ベースDOMを提供します。
   */
  private createConsoleContainer(): HTMLDivElement {
    if (this.consoleContainer) {
      this.applyContainerVisibility();
      return this.consoleContainer;
    }

    const container = document.createElement('div');
    container.className = 'floating-console-container';

    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
    container.style.height = '0';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '100';

    const style = document.createElement('style');
    style.textContent = `
      .floating-console-container > * {
        pointer-events: all;
      }
    `;
    document.head.appendChild(style);

    this.consoleContainer = container;
    this.applyContainerVisibility();

    return container;
  }

  /**
   * コンソール用フローティングウィンドウコンテナを取得します
   */
  getConsoleContainer(): HTMLDivElement | undefined {
    return this.consoleContainer;
  }

  /**
   * フローティングウィンドウコンテナを3D空間に配置します
   * 
   * @param scene Three.jsのシーン
   * @param position 3D空間での配置位置（デフォルト: (0, 20, -100)）
   */
  attachToScene(
    scene: THREE.Scene,
    position: THREE.Vector3 = new THREE.Vector3(0, 20, -100)
  ): CSS2DObject | null {
    if (!this.floatingContainer) {
      console.warn('Floating container is not created. Call initializeRenderer() first.');
      return null;
    }

    return this.attachFloatingWindowContainer(this.floatingContainer, scene, position);
  }

  /**
   * フローティングウィンドウコンテナをCSS2DObjectとして3D空間に配置します
   * 
   * @param containerElement フローティングウィンドウコンテナのDOM要素
   * @param scene Three.jsのシーン
   * @param position 3D空間での配置位置（デフォルト: (0, 20, -100)）
   */
  private attachFloatingWindowContainer(
    containerElement: HTMLElement,
    scene: THREE.Scene,
    position: THREE.Vector3 = new THREE.Vector3(0, 20, -100)
  ): CSS2DObject {
    // 既存のオブジェクトを削除
    if (this.css2DObject && this.css2DObject.parent) {
      this.css2DObject.parent.remove(this.css2DObject);
    }

    this.scene = scene;

    // DOM要素のpointer-eventsを有効化
    containerElement.style.pointerEvents = 'auto';

    // CSS2DObjectを作成
    this.css2DObject = new CSS2DObject(containerElement);
    this.css2DObject.position.copy(position);
    this.css2DObject.scale.set(1, 1, 1);

    // シーンに追加
    scene.add(this.css2DObject);

    return this.css2DObject;
  }

  /**
   * コンソール用フローティングウィンドウコンテナを3D空間に配置します
   * 
   * @param scene Three.jsのシーン
   * @param position 3D空間での配置位置（デフォルト: (0, 0, -100)）
   */
  attachConsoleContainerToScene(
    scene: THREE.Scene,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, -100)
  ): CSS2DObject | null {
    if (!this.consoleContainer) {
      console.warn('Console container is not created. Call initializeRenderer() first.');
      return null;
    }

    return this.attachConsoleContainer(this.consoleContainer, scene, position);
  }

  /**
   * コンソール用フローティングウィンドウコンテナをCSS2DObjectとして3D空間に配置します
   * 
   * @param containerElement コンソール用フローティングウィンドウコンテナのDOM要素
   * @param scene Three.jsのシーン
   * @param position 3D空間での配置位置
   */
  private attachConsoleContainer(
    containerElement: HTMLElement,
    scene: THREE.Scene,
    position: THREE.Vector3 = new THREE.Vector3(0, 0, -100)
  ): CSS2DObject {
    if (this.consoleContainerObject && this.consoleContainerObject.parent) {
      this.consoleContainerObject.parent.remove(this.consoleContainerObject);
    }

    this.scene = scene;

    containerElement.style.pointerEvents = 'auto';

    this.consoleContainerObject = new CSS2DObject(containerElement);
    this.consoleContainerObject.position.copy(position);
    this.consoleContainerObject.scale.set(1, 1, 1);

    scene.add(this.consoleContainerObject);

    return this.consoleContainerObject;
  }

  /**
   * カメラからの距離に基づいてスケール値を計算します
   * 
   * @param distance カメラからCSS2Dオブジェクトまでの距離
   * @returns クランプされたスケール値（MIN_SCALE～MAX_SCALE）
   */
  private calculateScale(distance: number): number {
    if (distance <= 0) {
      return this.MAX_SCALE;
    }
    
    // 基準距離が設定されていない場合は、現在の距離を基準距離として使用
    if (this.baseDistance === null) {
      this.baseDistance = 1000;//distance;
    }
    
    // スケール = 基準距離 / 現在の距離
    // 起動時（基準距離 = 現在の距離）の場合はスケール1になる
    const scale = this.baseDistance / distance;
    
    // スケールを MIN_SCALE ~ MAX_SCALE の範囲にクランプ
    return Math.max(this.MIN_SCALE, Math.min(this.MAX_SCALE, scale));
  }

  /**
   * フローティングコンテナのスケールを更新します
   * 
   * @param camera Three.jsのカメラ
   */
  private updateContainerScale(camera: THREE.PerspectiveCamera): void {
    if (!this.floatingContainer || !this.css2DObject) {
      return;
    }

    // カメラとCSS2Dオブジェクトの3D空間での位置を取得
    const cameraPosition = camera.position;
    const objectPosition = new THREE.Vector3();
    this.css2DObject.getWorldPosition(objectPosition);

    // 距離を計算（y方向のみ）
    const distance = Math.abs(cameraPosition.y - objectPosition.y);

    // スケールを計算
    const scale = this.calculateScale(distance);

    // CSS2DRendererが設定した既存のtransformを取得
    const existingTransform = this.floatingContainer.style.transform || '';
    
    // 既存のtransformからscale()を削除（既に存在する場合）
    // scale()が既にある場合は、それを新しい値で置き換える
    let cleanedTransform = existingTransform.replace(/\s*scale\([^)]*\)/gi, '');
    
    // 既存のtransformにscale()を追加
    // transformの順序: 既存のtransform（translateなど）の後にscale()を適用
    const newTransform = cleanedTransform.trim() 
      ? `${cleanedTransform.trim()} scale(${scale})`
      : `scale(${scale})`;
    
    // DOM要素のtransformスタイルを更新
    this.floatingContainer.style.transform = newTransform;
    this.floatingContainer.style.transformOrigin = 'top left';
  }

  /**
   * コンソール用フローティングコンテナのスケールを更新します
   * 
   * @param camera Three.jsのカメラ
   */
  private updateConsoleContainerScale(camera: THREE.PerspectiveCamera): void {
    if (!this.consoleContainer || !this.consoleContainerObject) {
      return;
    }

    const cameraPosition = camera.position;
    const objectPosition = new THREE.Vector3();
    this.consoleContainerObject.getWorldPosition(objectPosition);

    const distance = Math.abs(cameraPosition.y - objectPosition.y - 400);
    const scale = this.calculateScale(distance);

    const existingTransform = this.consoleContainer.style.transform || '';
    let cleanedTransform = existingTransform.replace(/\s*scale\([^)]*\)/gi, '');

    const newTransform = cleanedTransform.trim()
      ? `${cleanedTransform.trim()} scale(${scale})`
      : `scale(${scale})`;

    this.consoleContainer.style.transform = newTransform;
    this.consoleContainer.style.transformOrigin = 'top left';
  }


  /**
   * CSS2Dシーンをレンダリングします
   * 
   * @param scene Three.jsのシーン
   * @param camera Three.jsのカメラ
   */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    if (!this.css2DRenderer) {
      return;
    }

    this.scene = scene;
    this.camera = camera;
    
    // カメラが移動した場合も再レンダリング
    const cameraMoved = camera.position.distanceTo(this.lastCameraPosition) > this.CAMERA_MOVE_THRESHOLD;
    
    // レンダリング条件：変更がある、操作中、またはカメラが移動した場合のみ
    if (!this.needsRender && !this.isInteracting && !cameraMoved) {
      return; // スキップ
    }
    
    // CSS2DRendererのrender()を先に実行（これがtransformを設定する）
    this.css2DRenderer.render(scene, camera);
    
    // CSS2DRendererのrender()の後にscaleを適用
    // これにより、CSS2DRendererが設定したtransformに対してscaleを追加できる
    this.updateContainerScale(camera);
    this.updateConsoleContainerScale(camera);
    
    this.lastCameraPosition.copy(camera.position);
    this.needsRender = false;
  }
  
  /**
   * レンダリングが必要であることをマークします
   * OrbitControlsの操作開始時に呼び出されます
   */
  markNeedsRender(): void {
    this.needsRender = true;
  }
  
  /**
   * インタラクション状態を設定します
   * @param isInteracting 操作中かどうか
   */
  setInteracting(isInteracting: boolean): void {
    this.isInteracting = isInteracting;
    if (isInteracting) {
      this.needsRender = true;
    }
  }

  /**
   * レンダラーのサイズを変更します
   * 
   * @param width 新しい幅
   * @param height 新しい高さ
   */
  setSize(width: number, height: number): void {
    if (this.css2DRenderer) {
      this.css2DRenderer.setSize(width, height);
    }
  }

  /**
   * CSS2DObjectを取得します
   */
  getCSS2DObject(): CSS2DObject | undefined {
    return this.css2DObject;
  }

  /**
   * CSS2DRendererを取得します
   */
  getRenderer(): CSS2DRenderer | undefined {
    return this.css2DRenderer;
  }

  /**
   * リソースをクリーンアップします
   */
  dispose(): void {
    // CSS2DObjectをシーンから削除
    if (this.css2DObject && this.css2DObject.parent) {
      this.css2DObject.parent.remove(this.css2DObject);
    }
    this.css2DObject = undefined;
    // コンソール用CSS2Dコンテナをシーンから削除
    if (this.consoleContainerObject && this.consoleContainerObject.parent) {
      this.consoleContainerObject.parent.remove(this.consoleContainerObject);
    }
    this.consoleContainerObject = undefined;

    // すべてのコンソールCSS2Dオブジェクトを削除
    for (const [windowId, consoleObject] of this.consoleCSS2DObjects.entries()) {
      if (consoleObject && consoleObject.parent) {
        consoleObject.parent.remove(consoleObject);
      }
    }
    this.consoleCSS2DObjects.clear();

    // フローティングコンテナを削除
    if (this.floatingContainer) {
      // コンテナ内の子要素をすべて削除
      while (this.floatingContainer.firstChild) {
        this.floatingContainer.removeChild(this.floatingContainer.firstChild);
      }
      // コンテナ自体を削除
      if (this.floatingContainer.parentElement) {
        this.floatingContainer.parentElement.removeChild(this.floatingContainer);
      }
      this.floatingContainer = undefined;
    }
    // コンソール用コンテナを削除
    if (this.consoleContainer) {
      while (this.consoleContainer.firstChild) {
        this.consoleContainer.removeChild(this.consoleContainer.firstChild);
      }
      if (this.consoleContainer.parentElement) {
        this.consoleContainer.parentElement.removeChild(this.consoleContainer);
      }
      this.consoleContainer = undefined;
    }

    // CSS2DRendererのDOMを削除
    if (this.css2DRenderer) {
      const element = this.css2DRenderer.domElement;
      if (element && element.parentElement) {
        element.parentElement.removeChild(element);
      }
      this.css2DRenderer = undefined;
    }

    this.hostElement = undefined;
    this.scene = undefined;
    this.camera = undefined;
    
    // 基準距離をリセット
    this.baseDistance = null;
    
    // レンダリング状態をリセット
    this.needsRender = false;
    this.isInteracting = false;
    this.lastCameraPosition = new THREE.Vector3();
  }

  /**
   * CSS2Dレンダリングが初期化されているかチェックします
   */
  isInitialized(): boolean {
    return !!this.css2DRenderer;
  }

  /**
   * 現在のスケール値を取得します
   * 
   * @returns 現在のスケール値（取得できない場合は1.0）
   */
  getCurrentScale(): number {
    if (!this.floatingContainer) {
      return 1.0;
    }

    // transformスタイルからscale値を抽出
    const transform = this.floatingContainer.style.transform || '';
    const scaleMatch = transform.match(/scale\(([^)]+)\)/);
    
    if (scaleMatch && scaleMatch[1]) {
      const scaleValue = parseFloat(scaleMatch[1].trim());
      return isNaN(scaleValue) ? 1.0 : scaleValue;
    }

    // scaleが見つからない場合は1.0を返す
    return 1.0;
  }

  /**
   * フローティングウィンドウコンテナを非表示にします
   */
  hideFloatingContainer(): void {
    this.isContainerVisible = false;
    this.applyContainerVisibility();
  }

  /**
   * フローティングウィンドウコンテナを表示します
   */
  showFloatingContainer(): void {
    this.isContainerVisible = true;
    this.applyContainerVisibility();
  }

  /**
   * コンソール用フローティングウィンドウコンテナを非表示にします
   */
  hideConsoleContainer(): void {
    this.isConsoleContainerVisible = false;
    this.applyContainerVisibility();
  }

  /**
   * コンソール用フローティングウィンドウコンテナを表示します
   */
  showConsoleContainer(): void {
    this.isConsoleContainerVisible = true;
    this.applyContainerVisibility();
  }

  /**
   * フローティングウィンドウコンテナの表示状態を反映します
   */
  private applyContainerVisibility(): void {
    const displayValue = this.isContainerVisible ? '' : 'none';

    if (this.floatingContainer) {
      this.floatingContainer.style.display = displayValue;
    }

    // const consoleDisplayValue = this.isConsoleContainerVisible ? '' : 'none';
    // コンソールコンテナは非表示にしない
    // if (this.consoleContainer) {
    //   this.consoleContainer.style.display = consoleDisplayValue;
    // }
  }

  /**
   * コンソールDOM要素を3D空間に配置します
   * 
   * 【非推奨】このメソッドは旧方式です。
   * 新しい実装では、FloatingConsoleWindowComponentを使用し、
   * コンソールコンテナ（floating-console-container）に自動配置されます。
   * 
   * @param windowId ウィンドウID
   * @param consoleElement コンソールDOM要素
   * @param position 3D空間での配置位置
   * @returns 作成されたCSS2DObject
   * @deprecated コンテナベースの管理方式に移行してください
   */
  attachConsoleToScene(windowId: string, consoleElement: HTMLElement, position: THREE.Vector3): CSS2DObject | null {
    if (!this.scene) {
      console.warn('Scene is not set. Call attachToScene() first.');
      return null;
    }

    // 既存のコンソールオブジェクトを削除
    this.removeConsoleFromScene(windowId);

    // CSS2DObjectを作成
    const consoleObject = new CSS2DObject(consoleElement);
    consoleObject.position.copy(position);
    consoleObject.scale.set(1, 1, 1);

    // シーンに追加
    this.scene.add(consoleObject);
    this.consoleCSS2DObjects.set(windowId, consoleObject);

    return consoleObject;
  }

  /**
   * コンソールDOM要素を3D空間から削除します
   * 
   * @param windowId ウィンドウID
   */
  removeConsoleFromScene(windowId: string): void {
    const consoleObject = this.consoleCSS2DObjects.get(windowId);
    if (consoleObject && consoleObject.parent) {
      consoleObject.parent.remove(consoleObject);
    }
    this.consoleCSS2DObjects.delete(windowId);
  }

  /**
   * コンソールオブジェクトの位置を更新します
   * 
   * @param windowId ウィンドウID
   * @param position 新しい位置
   */
  updateConsolePosition(windowId: string, position: THREE.Vector3): void {
    const consoleObject = this.consoleCSS2DObjects.get(windowId);
    if (consoleObject) {
      consoleObject.position.copy(position);
    }
  }
}

