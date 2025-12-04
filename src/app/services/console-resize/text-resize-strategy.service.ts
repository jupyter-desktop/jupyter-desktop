import { Injectable } from '@angular/core';
import { ConsoleResizeStrategy, ContentSize } from './console-resize-strategy.interface';

/**
 * テキストコンテンツ用のリサイズ戦略
 * 
 * 【役割】
 * - テキストのみのコンソール出力のサイズを計算
 * - コンソールラインの高さを合計して最適な高さを決定
 * - テキスト表示に最適な幅を提供
 * 
 * 【戦略】
 * - `.console-line`要素の高さを合計
 * - テキスト表示に最適な固定幅を使用
 * - パディングを考慮したサイズ計算
 */
@Injectable({
  providedIn: 'root'
})
export class TextResizeStrategy implements ConsoleResizeStrategy {
  private readonly OPTIMAL_TEXT_WIDTH = 400;
  private readonly CONTENT_PADDING = 16;

  canHandle(container: HTMLElement): boolean {
    // 画像がない場合はテキスト戦略を適用
    const images = container.querySelectorAll('img');
    const consoleLines = container.querySelectorAll('.console-line');
    return images.length === 0 && consoleLines.length > 0;
  }

  async calculateSize(container: HTMLElement): Promise<ContentSize | null> {
    const consoleLines = container.querySelectorAll('.console-line');
    
    if (consoleLines.length === 0) {
      return null;
    }

    let contentHeight = 0;

    consoleLines.forEach((line: Element) => {
      const lineElement = line as HTMLElement;
      // 実際に表示されている高さを使用
      const lineHeight = lineElement.offsetHeight || lineElement.scrollHeight || 0;
      contentHeight += lineHeight;
    });

    // パディング分を追加
    contentHeight += this.CONTENT_PADDING;

    return {
      width: this.OPTIMAL_TEXT_WIDTH,
      height: contentHeight
    };
  }
}

