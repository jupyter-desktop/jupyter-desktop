import { Injectable } from '@angular/core';
import { ConsoleResizeStrategy, ContentSize } from './console-resize-strategy.interface';

/**
 * 画像コンテンツ用のリサイズ戦略
 * 
 * 【役割】
 * - 画像要素を含むコンソール出力のサイズを計算
 * - 画像の読み込み完了を待機
 * - 画像の自然サイズに基づいて最適なウィンドウサイズを提案
 * 
 * 【戦略】
 * - 画像の自然サイズを優先
 * - 複数の画像がある場合は最大のサイズを使用
 * - デフォルトサイズを上限として縮小
 */
@Injectable({
  providedIn: 'root'
})
export class ImageResizeStrategy implements ConsoleResizeStrategy {
  private readonly DEFAULT_IMAGE_WIDTH = 650;
  private readonly DEFAULT_IMAGE_HEIGHT = 500;
  private readonly IMAGE_LOAD_TIMEOUT_MS = 1500;

  canHandle(container: HTMLElement): boolean {
    const images = container.querySelectorAll('img');
    return images.length > 0;
  }

  async calculateSize(container: HTMLElement): Promise<ContentSize | null> {
    const images = container.querySelectorAll('img');
    if (images.length === 0) {
      return null;
    }

    // 画像の読み込みを待機
    await this.waitForImagesToLoad(container);

    let imageWidth = 0;
    let imageHeight = 0;

    images.forEach((img: HTMLImageElement) => {
      if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
        // 画像の自然サイズを使用
        imageWidth = Math.max(imageWidth, img.naturalWidth);
        imageHeight = Math.max(imageHeight, img.naturalHeight);
      } else if (img.offsetWidth > 0 || img.offsetHeight > 0) {
        // 画像がまだ読み込まれていない場合、表示サイズを使用
        imageWidth = Math.max(imageWidth, img.offsetWidth || 0);
        imageHeight = Math.max(imageHeight, img.offsetHeight || 0);
      }
    });

    if (imageWidth === 0 || imageHeight === 0) {
      return null;
    }

    // デフォルトサイズを上限として調整
    if (imageWidth > this.DEFAULT_IMAGE_WIDTH || imageHeight > this.DEFAULT_IMAGE_HEIGHT) {
      const aspectRatio = imageHeight / imageWidth;
      const defaultAspectRatio = this.DEFAULT_IMAGE_HEIGHT / this.DEFAULT_IMAGE_WIDTH;

      let targetWidth: number;
      let targetHeight: number;

      if (aspectRatio > defaultAspectRatio) {
        // 縦長の場合、高さを基準にする
        targetHeight = Math.min(imageHeight, this.DEFAULT_IMAGE_HEIGHT);
        targetWidth = targetHeight / aspectRatio;
      } else {
        // 横長の場合、幅を基準にする
        targetWidth = Math.min(imageWidth, this.DEFAULT_IMAGE_WIDTH);
        targetHeight = targetWidth * aspectRatio;
      }

      return {
        width: targetWidth,
        height: targetHeight
      };
    }

    return {
      width: imageWidth,
      height: imageHeight
    };
  }

  /**
   * コンテナ内の画像の読み込み完了を待機
   */
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
}

