import { Widget } from '@lumino/widgets';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import { INotebookModel } from '@jupyterlab/notebook';

export class AngularWidget extends Widget {
  private _context?: DocumentRegistry.IContext<INotebookModel>;
  private _saveNotebookRef?: () => Promise<void>;

  constructor(
    private app: JupyterFrontEnd,
    private docManager: IDocumentManager | null,
    context?: DocumentRegistry.IContext<INotebookModel>
  ) {
    super();
    this.addClass("jp-AngularWidget");
    this._context = context;
    
    // コンテキストがある場合は、パスベースのIDを設定
    if (context) {
      this.id = `angular-widget-${context.path}`;
    } else {
      this.id = 'angular-widget';
    }
  }

  /**
   * 保存関数の参照を設定
   */
  public setSaveNotebookRef(ref: () => Promise<void>): void {
    this._saveNotebookRef = ref;
  }

  /**
   * 手動で保存を実行（Ctrl+Sなどから呼び出される）
   */
  public async save(): Promise<void> {
    if (this._saveNotebookRef) {
      try {
        await this._saveNotebookRef();
      } catch (error) {
        console.error('Error saving notebook:', error);
        throw error;
      }
    }
  }

  /**
   * ウィジェットが破棄される時に保存を実行
   */
  async dispose(): Promise<void> {
    // contextがまだ有効な場合のみ保存を試みる
    if (this._saveNotebookRef && this._context && !this._context.isDisposed) {
      try {
        await this._saveNotebookRef();
      } catch (error) {
        // エラーが発生してもログに記録するだけで、disposeは続行
        console.error('Error saving notebook on dispose:', error);
      }
    }
    super.dispose();
  }

  async onAfterAttach() {
    // JupyterLabアプリケーションとDocumentManagerをグローバルに公開
    (window as any).jupyterapp = this.app;
    (window as any).jupyterDocManager = this.docManager;
    
    // notebookコンテキストもグローバルに公開
    if (this._context) {
      (window as any).jupyterNotebookContext = this._context;
    }
    
    try {
      // カスタム要素が定義されるまで待つ
      const isDefined = await this.waitForCustomElement();
      
      if (isDefined) {
        console.log('ng-jl-demo is defined, creating element');
        this.node.innerHTML = `<ng-jl-demo></ng-jl-demo>`;
        
        // Angularアプリが初期化された後に保存機能の参照を設定
        setTimeout(() => {
          const saveFunction = (window as any).angularSaveNotebook;
          if (saveFunction && typeof saveFunction === 'function') {
            this.setSaveNotebookRef(saveFunction);
          }
        }, 1500);
      } else {
        // カスタム要素が定義されなかった場合のフォールバック
        this.showErrorMessage('Angularアプリの読み込みに失敗しました。');
      }
    } catch (error) {
      console.error('Error in onAfterAttach:', error);
      this.showErrorMessage('Angularアプリの初期化中にエラーが発生しました。');
    }
  }

  /**
   * エラーメッセージを表示
   */
  private showErrorMessage(message: string) {
    this.node.innerHTML = `
      <div style="padding: 20px; color: #d32f2f; background: #ffebee; border: 1px solid #ef5350; border-radius: 4px; margin: 10px;">
        <h3 style="margin-top: 0;">エラー</h3>
        <p>${message}</p>
        <p style="font-size: 0.9em; color: #666;">ブラウザのコンソールで詳細を確認してください。</p>
      </div>
    `;
  }

  /**
   * カスタム要素が定義されるまで待つ
   * @returns カスタム要素が定義されたかどうか
   */
  private waitForCustomElement(): Promise<boolean> {
    return new Promise((resolve) => {
      // 既に定義されている場合は即座に解決
      if (customElements.get('ng-jl-demo')) {
        console.log('ng-jl-demo custom element already defined');
        resolve(true);
        return;
      }

      console.log('[AngularWidget] Waiting for ng-jl-demo custom element to be defined...');
      console.log('[AngularWidget] Checking if Angular scripts are loaded...');
      
      let attempts = 0;
      const maxAttempts = 300; // 15秒間 (50ms * 300) - Angular初期化には時間がかかる場合があるため延長
      
      // カスタム要素が定義されるまでポーリング
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (customElements.get('ng-jl-demo')) {
          clearInterval(checkInterval);
          console.log(`[AngularWidget] ✅ ng-jl-demo custom element defined after ${attempts * 50}ms`);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.error('[AngularWidget] ❌ ng-jl-demo custom element not defined after 15 seconds');
          console.error('[AngularWidget] Available custom elements:', Array.from(document.querySelectorAll('*'))
            .map(el => el.tagName.toLowerCase())
            .filter(tag => tag.includes('-'))
            .filter((v, i, a) => a.indexOf(v) === i)
          );
          
          // Angularのエラーログを確認
          const angularErrors = (window as any).__angular_errors__ || [];
          if (angularErrors.length > 0) {
            console.error('[AngularWidget] Angular initialization errors:', angularErrors);
          }
          
          resolve(false);
        } else if (attempts % 20 === 0) {
          // 4秒ごとに進捗をログ出力
          console.log(`[AngularWidget] Still waiting... (${attempts * 50}ms elapsed)`);
        }
      }, 50);
    });
  }

  onBeforeDetach() {
    this.node.innerHTML = "";
  }
}
