/**
 * コンソールウィンドウの自動リサイズ戦略インターフェース
 * 
 * 【役割】
 * - コンテンツの種類（画像、テキストなど）に応じた最適なウィンドウサイズを計算
 * - 各戦略は特定のコンテンツタイプを処理できるかを判定
 * 
 * 【戦略パターン】
 * - canHandle(): 戦略が特定のコンテナを処理できるかを判定
 * - calculateSize(): コンテンツに基づいた最適なサイズを計算
 */

export interface ContentSize {
  width: number;
  height: number;
}

export interface ConsoleResizeStrategy {
  /**
   * この戦略が指定されたコンテナを処理できるかを判定
   * @param container - コンソール出力のコンテナ要素
   * @returns 処理可能な場合true
   */
  canHandle(container: HTMLElement): boolean;

  /**
   * コンテナの内容に基づいて最適なサイズを計算
   * @param container - コンソール出力のコンテナ要素
   * @returns 計算されたサイズ、または計算できない場合はnull
   */
  calculateSize(container: HTMLElement): Promise<ContentSize | null>;
}

