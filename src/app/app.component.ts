import { Component, OnInit, OnDestroy, inject, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloatingWindowManagerComponent } from './components/floating-window-manager.component';
import { FloatingWindowCSS2DService } from './services/floating-window-css2d.service';
import { ThemeService } from './services/theme.service';
import { SceneRenderer } from './scene-renderer';
import { Subscription } from 'rxjs';
import * as THREE from 'three';

/**
 * AppComponent
 * 
 * 【役割】
 * - アプリケーションのルートコンポーネント
 * - Three.jsシーンとCSS2Dレンダラーの初期化と統合
 * - フローティングウィンドウの表示制御
 * - OrbitControlsとCSS2Dサービスの連携
 * 
 * 【責務の境界】
 * - アプリケーション全体の初期化とライフサイクル管理
 * - 各サービスの統合と連携（SceneRenderer、CSS2DService）
 * - レンダリングループの統一管理
 * - ウィンドウリサイズ時のCSS2Dレンダラーサイズ更新
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FloatingWindowManagerComponent],
  template: `
    <app-floating-window-manager>
      <div #host class="three-host"></div>
    </app-floating-window-manager>
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

  private css2DService = inject(FloatingWindowCSS2DService);
  private themeService = inject(ThemeService);

  private renderer = new SceneRenderer();
  private subscriptions = new Subscription();
  private unifiedAnimationId?: number;
  private resizeObserver?: ResizeObserver;

  ngOnInit(): void {
    // テーマを読み込む
    void this.themeService.loadSavedTheme();
  }

  ngAfterViewInit(): void {
    const hostElement = this.hostRef.nativeElement;
    this.renderer.initialize(hostElement, this.css2DService);
    this.initializeCSS2DRenderer(hostElement);
    this.startUnifiedAnimationLoop();

    // 初期状態ではCSS2Dコンテナを表示
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

}
