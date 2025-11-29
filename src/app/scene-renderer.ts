import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { FloatingWindowCSS2DService } from './services/floating-window-css2d.service';

export interface SceneRenderParams {
  series: any[];
  availableDates: string[];
  fromDate: string;
  toDate: string;
  currentDate: string;
}

/**
 * SceneRenderer
 * 
 * 【役割】
 * - Three.jsシーンの初期化と管理
 * - WebGLRendererとOrbitControlsの設定
 * - 3D空間のカメラ制御（XZ平面を俯瞰する設定）
 * - アニメーションループとレンダリング最適化
 * 
 * 【責務の境界】
 * - Three.jsシーンの管理のみを担当
 * - CSS2DレンダリングはFloatingWindowCSS2DServiceが担当
 * - データの取得や管理はサービス層に委譲
 */
export class SceneRenderer {

  private renderer?: THREE.WebGLRenderer;
  private scene?: THREE.Scene;
  private camera?: THREE.PerspectiveCamera;
  private controls?: OrbitControls;
  private animationId?: number;
  private resizeHandler?: () => void;
  private hostElement?: HTMLDivElement;
  private lastRenderTime = 0;
  private needsRender = true;
  private isAnimating = false;
  private readonly MIN_FRAME_INTERVAL = 16; // 約60FPS
  private css2DService?: FloatingWindowCSS2DService;
  
  initialize(hostElement: HTMLDivElement, css2DService?: FloatingWindowCSS2DService): void {
    this.css2DService = css2DService;
    this.dispose();

    this.hostElement = hostElement;
    const width = hostElement.clientWidth;
    const height = hostElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
    this.camera.position.set(0, 1200, 0); // XZ平面を俯瞰するため上空に配置
    this.camera.lookAt(0, 0, 0); // カメラを原点（XZ平面）に向ける
    this.camera.up.set(0, 0, -1); // Z軸負方向を上として設定

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '0'; // WebGLRendererを最下層に配置（OrbitControlsが動作するため）
    hostElement.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.enableRotate = false;
    // 左クリックにも pan を割り当て
    this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    
    // OrbitControlsのイベント監視はstartAnimationLoop()で行う

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    this.resizeHandler = () => {
      if (!this.camera || !this.renderer || !this.hostElement) {
        return;
      }
      const { clientWidth, clientHeight } = this.hostElement;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      this.camera.aspect = clientWidth / clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(clientWidth, clientHeight);
    };

    window.addEventListener('resize', this.resizeHandler);
    
    this.startAnimationLoop();
  }

  /**
   * Three.jsのシーンを取得します
   */
  getScene(): THREE.Scene | undefined {
    return this.scene;
  }

  /**
   * Three.jsのカメラを取得します
   */
  getCamera(): THREE.PerspectiveCamera | undefined {
    return this.camera;
  }

  /**
   * OrbitControlsを取得します
   */
  getControls(): OrbitControls | undefined {
    return this.controls;
  }

  /**
   * ホストエレメントを取得します
   */
  getHostElement(): HTMLDivElement | undefined {
    return this.hostElement;
  }

  render(params: SceneRenderParams): void {
    if (!this.isReady() || !this.scene) {
      return;
    }

    // チャート更新時にレンダリングをトリガー
    this.needsRender = true;
  }

  dispose(): void {
    const canvas = this.renderer?.domElement;
    if (canvas && canvas.parentElement) {
      canvas.parentElement.removeChild(canvas);
    }

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = undefined;
    }

    if (this.scene) {
      // シーン内のすべてのオブジェクトを適切に破棄
      this.disposeScene(this.scene);
    }

    if (this.controls) {
      this.controls.dispose();
      this.controls = undefined;
    }

    if (this.renderer) {
      // レンダラーのコンテキストをクリーンアップ
      this.renderer.forceContextLoss();
      this.renderer.dispose();
      this.renderer = undefined;
    }

    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = undefined;
    }

    this.scene = undefined;
    this.camera = undefined;
    this.hostElement = undefined;
  }

  /**
   * シーン内のすべてのオブジェクトを適切に破棄します
   */
  private disposeScene(scene: THREE.Scene): void {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        // ジオメトリを破棄
        if (object.geometry) {
          object.geometry.dispose();
        }
        
        // マテリアルを破棄
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach(material => this.disposeMaterial(material));
          } else {
            this.disposeMaterial(object.material);
          }
        }
      }
    });
    
    // シーンをクリア
    while (scene.children.length > 0) {
      scene.remove(scene.children[0]);
    }
  }

  /**
   * マテリアルとそのテクスチャを破棄します
   */
  private disposeMaterial(material: THREE.Material): void {
    material.dispose();
    
    // テクスチャを破棄
    Object.values(material).forEach(value => {
      if (value instanceof THREE.Texture) {
        value.dispose();
      }
    });
  }

  isReady(): boolean {
    return !!(this.renderer && this.scene && this.camera);
  }

  startAnimationLoop(): void {
    const animate = (currentTime: number) => {
      this.animationId = requestAnimationFrame(animate);
      
      if (this.controls) {
        this.controls.update();
      }
      
      // レンダリングの最適化：変更がある場合またはアニメーション中のみレンダリング
      const shouldRender = this.needsRender || this.isAnimating;
      
      if (shouldRender && this.renderer && this.scene && this.camera) {
        const elapsed = currentTime - this.lastRenderTime;
        
        // 最小フレーム間隔のチェック（約60FPS）
        if (elapsed > this.MIN_FRAME_INTERVAL) {
          this.renderer.render(this.scene, this.camera);
          this.lastRenderTime = currentTime;
          this.needsRender = false;
        }
      }
    };

    // OrbitControlsのイベント監視
    if (this.controls) {
      // startイベント: CSS2DServiceに通知 + レンダリングフラグを設定
      this.controls.addEventListener('start', () => {
        if (this.css2DService) {
          this.css2DService.setInteracting(true);
          this.css2DService.markNeedsRender();
        }
        this.needsRender = true;
        this.isAnimating = true;
      });
      
      // changeイベント: CSS2DServiceに通知 + レンダリングフラグを設定
      this.controls.addEventListener('change', () => {
        if (this.css2DService) {
          this.css2DService.markNeedsRender();
        }
        this.needsRender = true;
        this.isAnimating = true;
      });
      
      // endイベント: CSS2DServiceに通知（500ms後）+ アニメーションフラグをリセット（1000ms後）
      this.controls.addEventListener('end', () => {
        if (this.css2DService) {
          // 慣性が収まるまで少し待つ（500ms）
          setTimeout(() => {
            this.css2DService!.setInteracting(false);
          }, 500);
        }
        // 慣性が収まるまで待つ（1000ms）
        setTimeout(() => {
          this.isAnimating = false;
        }, 1000);
      });
    }

    animate(0);
  }

}
