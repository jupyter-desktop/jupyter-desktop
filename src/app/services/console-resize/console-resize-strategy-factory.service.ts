import { Injectable, inject } from '@angular/core';
import { ConsoleResizeStrategy } from './console-resize-strategy.interface';
import { ImageResizeStrategy } from './image-resize-strategy.service';
import { TextResizeStrategy } from './text-resize-strategy.service';

/**
 * リサイズ戦略ファクトリー
 * 
 * 【役割】
 * - コンテナの内容を分析して適切な戦略を選択
 * - 複数の戦略を順次試行して適用可能なものを返す
 * 
 * 【戦略選択順序】
 * 1. 画像戦略（優先度高）
 * 2. テキスト戦略（フォールバック）
 */
@Injectable({
  providedIn: 'root'
})
export class ConsoleResizeStrategyFactory {
  private imageStrategy = inject(ImageResizeStrategy);
  private textStrategy = inject(TextResizeStrategy);

  // 戦略の優先順位リスト（画像が優先）
  private strategies: ConsoleResizeStrategy[] = [];

  constructor() {
    this.strategies = [
      this.imageStrategy,
      this.textStrategy
    ];
  }

  /**
   * コンテナに適した戦略を取得
   * @param container - コンソール出力のコンテナ要素
   * @returns 適切な戦略、または見つからない場合はnull
   */
  getStrategy(container: HTMLElement): ConsoleResizeStrategy | null {
    for (const strategy of this.strategies) {
      if (strategy.canHandle(container)) {
        return strategy;
      }
    }
    return null;
  }
}

