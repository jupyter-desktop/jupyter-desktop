import { Component, OnInit, OnDestroy, inject, AfterViewInit, ElementRef, ViewChild, ViewContainerRef, ComponentRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatingWindowManagerComponent } from './components/floating-window-manager.component';
import { FloatingWindowCSS2DService } from './services/floating-window-css2d.service';
import { ThemeService } from './services/theme.service';
import { SceneRenderer } from './scene-renderer';
import { Subscription } from 'rxjs';
import { Observable } from 'rxjs';
import * as THREE from 'three';
import { PluginLoaderService } from './plugin/plugin-loader.service';

/**
 * AppComponent
 * 
 * 【役割】
 * - アプリケーションのルートコンポーネント
 * - Three.jsシーンとCSS2Dレンダラーの初期化と統合
 * - フローティングウィンドウの表示制御
 * - OrbitControlsとCSS2Dサービスの連携
 * - プラグインが提供するオーバーレイコンポーネントの動的ロード
 * 
 * 【責務の境界】
 * - アプリケーション全体の初期化とライフサイクル管理
 * - 各サービスの統合と連携（SceneRenderer、CSS2DService）
 * - レンダリングループの統一管理
 * - ウィンドウリサイズ時のCSS2Dレンダラーサイズ更新
 * - プラグインが提供するオーバーレイコンポーネントの管理
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FloatingWindowManagerComponent],
  template: `
    <app-floating-window-manager>
      <div #host class="three-host"></div>
    </app-floating-window-manager>
    <!-- プラグインが登録したオーバーレイコンポーネント用のコンテナ -->
    <div #overlayContainer></div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .three-host {
      width: 100%;
      height: 100%;
      display: block;
      position: relative;
      background: linear-gradient(135deg, var(--bg-canvas-gradient-start) 0%, var(--bg-canvas-gradient-end) 100%);
    }
  `
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('host', { static: true }) hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('overlayContainer', { read: ViewContainerRef }) overlayContainer!: ViewContainerRef;

  private pluginLoader = inject(PluginLoaderService, { optional: true });
  private css2DService = inject(FloatingWindowCSS2DService);
  private themeService = inject(ThemeService);

  private renderer = new SceneRenderer();
  private subscriptions = new Subscription();
  private unifiedAnimationId?: number;
  private resizeObserver?: ResizeObserver;
  private overlayComponentRefs: Map<string, ComponentRef<any>> = new Map();

  ngOnInit(): void {
    // テーマを読み込む
    void this.themeService.loadSavedTheme();

    // プラグインがロードされている場合、オーバーレイコンポーネントを動的にロード
    if (this.pluginLoader) {
      // プラグインの初期化が完了するまで少し待つ
      setTimeout(() => {
        this.loadOverlayComponents();
      }, 0);
    }
  }

  ngAfterViewInit(): void {
    const hostElement = this.hostRef.nativeElement;
    this.renderer.initialize(hostElement, this.css2DService);
    this.initializeCSS2DRenderer(hostElement);
    this.startUnifiedAnimationLoop();

    // 初期状態ではCSS2Dコンテナを表示（プラグインが制御する場合は上書きされる）
    this.css2DService.showFloatingContainer();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();

    if (this.unifiedAnimationId) {
      cancelAnimationFrame(this.unifiedAnimationId);
      this.unifiedAnimationId = undefined;
    }

    this.resizeObserver?.disconnect();
    this.css2DService.dispose();
    this.renderer.dispose();

    // オーバーレイコンポーネントを破棄
    // ViewContainerRef.createComponent() で作成されたコンポーネントは
    // destroy() を呼び出すだけで、ViewContainerから自動的にデタッチされる
    for (const [id, ref] of this.overlayComponentRefs.entries()) {
      ref.destroy();
    }
    this.overlayComponentRefs.clear();
  }

  private initializeCSS2DRenderer(hostElement: HTMLElement): void {
    const width = hostElement.clientWidth;
    const height = hostElement.clientHeight;

    this.css2DService.initializeRenderer(hostElement, width, height);

    const scene = this.renderer.getScene();
    if (scene) {
      const floatingPosition = new THREE.Vector3(0, 200, 200);
      this.css2DService.attachToScene(scene, floatingPosition);
      // コンソール用フローティングウィンドウコンテナもCSS2D空間に登録
      const consolePosition = new THREE.Vector3(0, -200, -100);
      this.css2DService.attachConsoleContainerToScene(scene, consolePosition);
    }

    this.setupCSS2DResizeHandler(hostElement);
  }

  private setupCSS2DResizeHandler(hostElement: HTMLElement): void {
    this.resizeObserver?.disconnect();

    this.resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          this.css2DService.setSize(width, height);
        }
      }
    });

    this.resizeObserver.observe(hostElement);
  }

  private startUnifiedAnimationLoop(): void {
    const animate = (currentTime: number) => {
      this.unifiedAnimationId = requestAnimationFrame(animate);

      const scene = this.renderer.getScene();
      const camera = this.renderer.getCamera();
      
      if (scene && camera) {
        this.css2DService.render(scene, camera);
      }
    };

    animate(0);
  }

  /**
   * プラグインが登録したオーバーレイコンポーネントを動的にロード
   */
  private loadOverlayComponents(): void {
    if (!this.pluginLoader || !this.overlayContainer) {
      return;
    }

    const overlayConfigs = this.pluginLoader.getOverlayComponents();
    
    for (const config of overlayConfigs) {
      const componentRef = this.overlayContainer.createComponent(config.component, {
        injector: this.overlayContainer.injector
      });
      
      // z-indexを設定
      if (config.zIndex) {
        (componentRef.location.nativeElement as HTMLElement).style.zIndex = String(config.zIndex);
      }
      
      // 表示条件がある場合は監視
      if (config.condition) {
        const conditionResult = config.condition();
        
        if (conditionResult instanceof Observable) {
          // Observableの場合は、状態変化を監視
          this.subscriptions.add(
            conditionResult.subscribe(visible => {
              componentRef.location.nativeElement.style.display = visible ? 'block' : 'none';
            })
          );
        } else if (typeof conditionResult === 'function') {
          // 関数の場合は、プラグインローダー経由でサービスを取得してObservableを取得
          const getObservable = conditionResult;
          const observable = getObservable();
          
          if (observable instanceof Observable) {
            this.subscriptions.add(
              observable.subscribe(visible => {
                componentRef.location.nativeElement.style.display = visible ? 'block' : 'none';
              })
            );
          } else {
            componentRef.location.nativeElement.style.display = observable ? 'block' : 'none';
          }
        } else {
          // boolean値の場合は、そのまま使用
          componentRef.location.nativeElement.style.display = conditionResult ? 'block' : 'none';
        }
      } else {
        // 条件がない場合は常に表示
        componentRef.location.nativeElement.style.display = 'block';
      }
      
      // ViewContainerRef.createComponent() で作成されたコンポーネントは
      // 既にViewContainerに自動的にアタッチされているため、
      // appRef.attachView() を呼び出す必要はない
      
      this.overlayComponentRefs.set(config.id, componentRef);
    }
  }
}
