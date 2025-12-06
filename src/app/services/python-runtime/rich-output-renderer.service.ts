import { Injectable } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RuntimeOutput } from './output.service';

/**
 * MIMEタイプごとのレンダラー関数の型定義
 * JupyterLabのレンダラーパターンに準拠
 */
type RendererFunction = (data: any, metadata?: Record<string, any>) => SafeHtml;

@Injectable({
  providedIn: 'root'
})
export class RichOutputRendererService {
  /**
   * MIMEタイプごとのレンダラーレジストリ（JupyterLabパターン）
   * 将来的にカスタムレンダラーを追加可能
   */
  private readonly rendererRegistry = new Map<string, RendererFunction>();

  constructor(private sanitizer: DomSanitizer) {
    // デフォルトレンダラーを登録
    this.registerDefaultRenderers();
  }

  /**
   * デフォルトレンダラーを登録（JupyterLabの標準レンダラーに相当）
   */
  private registerDefaultRenderers(): void {
    this.rendererRegistry.set('text/html', (data) => this.renderHtml(data));
    this.rendererRegistry.set('image/svg+xml', (data) => this.renderSvg(data));
    this.rendererRegistry.set('image/png', (data, metadata) => this.renderImage('image/png', data, metadata));
    this.rendererRegistry.set('image/jpeg', (data, metadata) => this.renderImage('image/jpeg', data, metadata));
    this.rendererRegistry.set('image/gif', (data, metadata) => this.renderImage('image/gif', data, metadata));
    this.rendererRegistry.set('application/json', (data) => this.renderJson(data));
    this.rendererRegistry.set('text/markdown', (data) => this.renderMarkdown(data));
    this.rendererRegistry.set('text/latex', (data) => this.renderLatex(data));
    this.rendererRegistry.set('text/plain', (data) => this.renderPlainText(data));
  }

  /**
   * カスタムレンダラーを登録（将来的な拡張用）
   * JupyterLabのレンダラー拡張パターンに準拠
   */
  registerRenderer(mimeType: string, renderer: RendererFunction): void {
    this.rendererRegistry.set(mimeType, renderer);
  }

  /**
   * MIMEタイプに応じたリッチ出力をレンダリング（JupyterLabパターン）
   * 
   * JupyterLabのrenderMimeModelに相当する機能
   * 
   * 注意: このメソッドは信頼できるソース（Pythonカーネル）からのデータのみを処理します。
   * XSS対策のため、bypassSecurityTrustHtmlを使用しますが、信頼できるソースからのデータのみに使用してください。
   */
  render(output: RuntimeOutput): SafeHtml {
    if (!output.mimeType || !output.data) {
      // リッチ出力データがない場合は、通常のテキストとして表示
      // ANSIエスケープシーケンスを処理
      if (output.content) {
        const html = this.convertAnsiToHtml(output.content);
        return this.sanitizer.bypassSecurityTrustHtml(html);
      }
      return this.sanitizer.bypassSecurityTrustHtml('');
    }

    const mimeType = output.mimeType;
    const data = output.data[mimeType];
    const metadata = output.metadata?.[mimeType] || {};

    // レンダラーレジストリからレンダラーを取得
    const renderer = this.rendererRegistry.get(mimeType);
    
    if (renderer) {
      // 登録されたレンダラーを使用
      return renderer(data, metadata);
    }

    // レンダラーが登録されていない場合は、text/plainがあればそれを使用
    // JupyterLabの実装では、未知のMIMEタイプはtext/plainにフォールバック
    if (output.data['text/plain']) {
      return this.renderPlainText(output.data['text/plain']);
    }

    // それもなければ、contentをANSI処理して表示
    if (output.content) {
      const html = this.convertAnsiToHtml(output.content);
      return this.sanitizer.bypassSecurityTrustHtml(html);
    }
    return this.sanitizer.bypassSecurityTrustHtml('');
  }

  /**
   * HTMLをレンダリング
   * 
   * 注意: 信頼できるソース（Pythonカーネル）からのHTMLのみを処理します。
   */
  private renderHtml(html: string): SafeHtml {
    // 信頼できるソースからのHTMLなので、bypassSecurityTrustHtmlを使用
    // 既存のfloating-info-window.component.tsでも同様の方法を使用
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * 画像をレンダリング（JupyterLabの画像レンダラーに相当）
   * 
   * JupyterLabでは、画像のメタデータ（width, height）を活用して
   * 適切なサイズで表示します。
   * 
   * @param mimeType - 画像のMIMEタイプ（例: 'image/png'）
   * @param data - base64エンコードされた画像データ
   * @param metadata - メタデータ（画像のサイズなど）
   */
  private renderImage(mimeType: string, data: string, metadata?: Record<string, any>): SafeHtml {
    // base64エンコードされた画像データをdata URIとして表示
    // JSPメッセージでは、画像データはbase64エンコードされた文字列として送信される
    // JupyterLabの実装では、画像データはdata URIとして表示される
    const dataUri = `data:${mimeType};base64,${data}`;
    
    // メタデータから画像のサイズを取得（JupyterLabの実装パターン）
    // JupyterLabでは、metadata[mimeType]に画像のメタデータが格納される
    const imageMetadata = metadata || {};
    const width = imageMetadata['width'];
    const height = imageMetadata['height'];
    
    // スタイル属性を構築（JupyterLabの実装パターン）
    // JupyterLabでは、max-width: 100%でレスポンシブに表示
    let style = 'max-width: 100%; height: auto;';
    if (width && height) {
      // メタデータにサイズ情報がある場合は、アスペクト比を保持
      // JupyterLabでは、画像のアスペクト比を保持して表示
      style = `max-width: 100%; height: auto; aspect-ratio: ${width}/${height};`;
    }
    
    const imgHtml = `<img src="${dataUri}" style="${style}" />`;
    // 信頼できるソースからの画像データなので、bypassSecurityTrustHtmlを使用
    return this.sanitizer.bypassSecurityTrustHtml(imgHtml);
  }

  /**
   * SVGをレンダリング
   * 
   * 注意: 信頼できるソース（Pythonカーネル）からのSVGのみを処理します。
   */
  private renderSvg(svg: string): SafeHtml {
    // SVGはそのまま表示（XSS対策はDomSanitizerに委譲）
    // 信頼できるソースからのSVGなので、bypassSecurityTrustHtmlを使用
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /**
   * JSONをレンダリング（JupyterLabのJSONレンダラーに相当）
   * 
   * JupyterLabでは、JSONデータを整形して表示します。
   * 将来的には、JupyterLabのようにインタラクティブなJSONビューアーを実装可能。
   */
  private renderJson(json: any): SafeHtml {
    // JSONオブジェクトを整形して表示（JupyterLabの実装パターン）
    // JupyterLabでは、JSON.stringify(json, null, 2)で整形
    const jsonStr = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
    const escapedJson = this.escapeHtml(jsonStr);
    const preHtml = `<pre class="json-output"><code>${escapedJson}</code></pre>`;
    // HTMLエスケープ済みなので、bypassSecurityTrustHtmlを使用
    return this.sanitizer.bypassSecurityTrustHtml(preHtml);
  }

  /**
   * Markdownをレンダリング（JupyterLabのMarkdownレンダラーに相当）
   * 
   * JupyterLabでは、MarkdownをHTMLに変換して表示します。
   * 将来的には、JupyterLabのように完全なMarkdownレンダリングを実装可能。
   */
  private renderMarkdown(markdown: string): SafeHtml {
    // 簡易的なMarkdownレンダリング（将来的にはライブラリを使用）
    // JupyterLabでは、markedやmarkdown-itなどのライブラリを使用
    // 現時点では、改行を<br>に変換する程度
    const html = this.escapeHtml(markdown).replace(/\n/g, '<br>');
    // HTMLエスケープ済みなので、bypassSecurityTrustHtmlを使用
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * LaTeXをレンダリング（JupyterLabのLaTeXレンダラーに相当）
   * 
   * JupyterLabでは、LaTeXをMathJaxやKaTeXでレンダリングします。
   * 将来的には、JupyterLabのように数式レンダリングを実装可能。
   */
  private renderLatex(latex: string): SafeHtml {
    // LaTeXレンダリングは将来的に実装（MathJaxやKaTeXを使用）
    // JupyterLabでは、MathJaxを使用してLaTeXをレンダリング
    // 現時点では、そのまま表示
    const escapedLatex = this.escapeHtml(latex);
    const preHtml = `<pre class="latex-output"><code>${escapedLatex}</code></pre>`;
    // HTMLエスケープ済みなので、bypassSecurityTrustHtmlを使用
    return this.sanitizer.bypassSecurityTrustHtml(preHtml);
  }

  /**
   * プレーンテキストをレンダリング（JupyterLabのtext/plainレンダラーに相当）
   */
  private renderPlainText(text: string): SafeHtml {
    // ANSIエスケープシーケンスを処理してHTMLに変換
    const html = this.convertAnsiToHtml(text);
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * HTMLエスケープ（JupyterLabの実装パターンに準拠）
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * ANSIエスケープシーケンスをHTMLに変換
   * 
   * 主要なANSIカラーコードをサポート:
   * - 30-37: 前景色（黒、赤、緑、黄、青、マゼンタ、シアン、白）
   * - 40-47: 背景色
   * - 0: リセット
   * - 1: 太字
   * - 39: デフォルト前景色
   * - 49: デフォルト背景色
   */
  private convertAnsiToHtml(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    // ANSIエスケープシーケンスの正規表現パターン
    // \x1b[ または \u001b[ で始まり、m で終わる
    const ansiPattern = /\u001b\[([0-9;]*?)m/g;

    // ANSIカラーコードのマッピング（前景色）
    const foregroundColors: Record<number, string> = {
      30: '#000000', // 黒
      31: '#ff4444', // 赤
      32: '#44ff44', // 緑
      33: '#ffaa00', // 黄
      34: '#4444ff', // 青
      35: '#ff44ff', // マゼンタ
      36: '#44ffff', // シアン
      37: '#ffffff', // 白
    };

    // ANSIカラーコードのマッピング（背景色）
    const backgroundColors: Record<number, string> = {
      40: '#000000', // 黒
      41: '#ff4444', // 赤
      42: '#44ff44', // 緑
      43: '#ffaa00', // 黄
      44: '#4444ff', // 青
      45: '#ff44ff', // マゼンタ
      46: '#44ffff', // シアン
      47: '#ffffff', // 白
    };

    let html = '';
    let lastIndex = 0;
    let currentColor: string | null = null;
    let currentBackground: string | null = null;
    let isBold = false;
    let match: RegExpExecArray | null;

    // テキストをHTMLエスケープ
    const escapedText = this.escapeHtml(text);

    // ANSIエスケープシーケンスを検出して処理
    while ((match = ansiPattern.exec(escapedText)) !== null) {
      // エスケープシーケンスの前のテキストを追加
      if (match.index > lastIndex) {
        const textBefore = escapedText.substring(lastIndex, match.index);
        if (textBefore) {
          const styles: string[] = [];
          if (currentColor) {
            styles.push(`color: ${currentColor}`);
          }
          if (currentBackground) {
            styles.push(`background-color: ${currentBackground}`);
          }
          if (isBold) {
            styles.push('font-weight: bold');
          }
          if (styles.length > 0) {
            html += `<span style="${styles.join('; ')}">${textBefore}</span>`;
          } else {
            html += textBefore;
          }
        }
      }

      // ANSIコードを解析
      const codes = match[1] ? match[1].split(';').map(Number) : [0];

      // 各コードを処理
      for (const code of codes) {
        if (code === 0) {
          // リセット
          currentColor = null;
          currentBackground = null;
          isBold = false;
        } else if (code === 1) {
          // 太字
          isBold = true;
        } else if (code >= 30 && code <= 37) {
          // 前景色
          currentColor = foregroundColors[code];
        } else if (code === 39) {
          // デフォルト前景色
          currentColor = null;
        } else if (code >= 40 && code <= 47) {
          // 背景色
          currentBackground = backgroundColors[code];
        } else if (code === 49) {
          // デフォルト背景色
          currentBackground = null;
        }
      }

      lastIndex = match.index + match[0].length;
    }

    // 残りのテキストを追加
    if (lastIndex < escapedText.length) {
      const textAfter = escapedText.substring(lastIndex);
      if (textAfter) {
        const styles: string[] = [];
        if (currentColor) {
          styles.push(`color: ${currentColor}`);
        }
        if (currentBackground) {
          styles.push(`background-color: ${currentBackground}`);
        }
        if (isBold) {
          styles.push('font-weight: bold');
        }
        if (styles.length > 0) {
          html += `<span style="${styles.join('; ')}">${textAfter}</span>`;
        } else {
          html += textAfter;
        }
      }
    }

    // ANSIエスケープシーケンスがなかった場合は、そのまま返す
    if (html === '') {
      return escapedText;
    }

    return html;
  }
}

