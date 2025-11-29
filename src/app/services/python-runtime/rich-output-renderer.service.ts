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
  render(output: RuntimeOutput): SafeHtml | string {
    if (!output.mimeType || !output.data) {
      // リッチ出力データがない場合は、通常のテキストとして表示
      return output.content;
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

    // それもなければ、そのまま表示
    return output.content;
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
  private renderPlainText(text: string): string {
    // プレーンテキストはそのまま返す（HTMLエスケープはテンプレート側で処理）
    return text;
  }

  /**
   * HTMLエスケープ（JupyterLabの実装パターンに準拠）
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

