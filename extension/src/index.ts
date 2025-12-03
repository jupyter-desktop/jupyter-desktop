import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { DocumentRegistry, DocumentWidget, IDocumentWidget, ABCWidgetFactory } from '@jupyterlab/docregistry';
import { ILauncher } from '@jupyterlab/launcher';
import { INotebookModel, INotebookTracker } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';
import { circleIcon } from '@jupyterlab/ui-components';
import { AngularWidget } from './angular-widget';
import '../style/base.css';

// Angularアプリを動的に読み込む関数
// 新しいAngularビルドでは、ファイル名にハッシュが付くため、index.htmlから取得する必要がある
async function loadAngularApp(): Promise<void> {
  return new Promise((resolve, reject) => {
    // 既に読み込まれているかチェック
    if ((window as any).__angular_app_loaded__) {
      console.log('jupyterlab-angular-demo: Angular app already loaded');
      resolve();
      return;
    }

    // スクリプトを読み込むヘルパー関数
    const loadScript = (src: string, basePath: string = '/lab/extensions/jupyterlab-angular-demo/static/browser/'): Promise<void> => {
      return new Promise((scriptResolve, scriptReject) => {
        // 既に読み込まれているかチェック
        const existingScript = Array.from(document.querySelectorAll('script[type="module"]')).find(
          (s: any) => s.src && s.src.includes(src.split('/').pop() || '')
        );
        if (existingScript) {
          console.log(`jupyterlab-angular-demo: Script already loaded: ${src}`);
          scriptResolve();
          return;
        }

        const script = document.createElement('script');
        script.type = 'module';
        // スクリプトのパスが既に絶対パスの場合はそのまま使用、相対パスの場合はbasePathを追加
        const scriptSrc = src.startsWith('/') ? src : `${basePath}${src}`;
        script.src = scriptSrc;
        script.onload = () => {
          console.log(`jupyterlab-angular-demo: Script loaded successfully: ${scriptSrc}`);
          scriptResolve();
        };
        script.onerror = (error) => {
          console.error(`jupyterlab-angular-demo: Failed to load script: ${scriptSrc}`, error);
          scriptReject(new Error(`Failed to load script: ${scriptSrc}`));
        };
        document.head.appendChild(script);
      });
    };

    // まずindex.htmlを取得してスクリプトタグを抽出を試みる
    console.log('jupyterlab-angular-demo: Fetching index.html from /lab/extensions/jupyterlab-angular-demo/static/browser/index.html');
    fetch('/lab/extensions/jupyterlab-angular-demo/static/browser/index.html')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(html => {
        console.log('jupyterlab-angular-demo: index.html fetched successfully');
        // HTMLからスクリプトタグを抽出
        const scriptRegex = /<script\s+src="([^"]+)"\s+type="module"><\/script>/g;
        const scripts: string[] = [];
        let match;
        while ((match = scriptRegex.exec(html)) !== null) {
          scripts.push(match[1]);
        }

        console.log('jupyterlab-angular-demo: Found scripts in index.html:', scripts);

        // polyfillsとmainの順序を保持
        const polyfillsScript = scripts.find(s => s.includes('polyfills'));
        const mainScript = scripts.find(s => s.includes('main') && !s.includes('polyfills'));

        if (!polyfillsScript || !mainScript) {
          throw new Error(`Angular scripts not found in index.html. Found scripts: ${scripts.join(', ')}`);
        }

        console.log('jupyterlab-angular-demo: Loading Angular scripts:', polyfillsScript, mainScript);

        // polyfills → main の順で読み込む
        loadScript(polyfillsScript)
          .then(() => {
            console.log('jupyterlab-angular-demo: Polyfills loaded, loading main script...');
            return loadScript(mainScript);
          })
          .then(() => {
            console.log('jupyterlab-angular-demo: All scripts loaded, waiting for Angular initialization...');
            // Angularアプリが初期化されるまで少し待つ
            return new Promise<void>((waitResolve) => {
              let attempts = 0;
              const maxAttempts = 100; // 5秒間待機
              const checkInterval = setInterval(() => {
                attempts++;
                if (customElements.get('ng-jl-demo')) {
                  clearInterval(checkInterval);
                  console.log('jupyterlab-angular-demo: ng-jl-demo custom element defined!');
                  (window as any).__angular_app_loaded__ = true;
                  resolve();
                } else if (attempts >= maxAttempts) {
                  clearInterval(checkInterval);
                  console.warn('jupyterlab-angular-demo: ng-jl-demo custom element not defined after 5 seconds, but scripts are loaded');
                  // スクリプトは読み込まれたので、カスタム要素の定義は後で行われる可能性がある
                  (window as any).__angular_app_loaded__ = true;
                  resolve();
                }
              }, 50);
            });
          })
          .catch(reject);
      })
      .catch((error) => {
        console.error('jupyterlab-angular-demo: Failed to fetch index.html:', error);
        reject(error);
      });
  });
}

/**
 * メインプラグイン
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-angular-demo',
  autoStart: true,
  requires: [INotebookTracker],
  optional: [ILauncher, IDocumentManager],
  activate: async (
    app: JupyterFrontEnd,
    _notebookTracker: INotebookTracker,
    launcher: ILauncher | null,
    docManager: IDocumentManager | null
  ) => {
    console.log('jupyterlab-angular-demo: Plugin activating...');
    console.log('jupyterlab-angular-demo: ILauncher available?', launcher !== null);
    console.log('jupyterlab-angular-demo: IDocumentManager available?', docManager !== null);
    
    // Angularアプリを読み込む
    try {
      await loadAngularApp();
      console.log('jupyterlab-angular-demo: Angular app loaded successfully');
    } catch (error) {
      console.error('jupyterlab-angular-demo: Failed to load Angular app:', error);
      // エラーが発生しても続行（既に読み込まれている可能性がある）
    }
    
    // JupyterLabアプリケーションインスタンスをグローバルに公開
    (window as any).jupyterapp = app;
    if (docManager) {
      (window as any).jupyterDocManager = docManager;
    }

    // 新しいnotebookファイルを作成して開く関数
    const createNewNotebook = async () => {
      try {
        // 新しいnotebookファイルを作成
        const model = await app.serviceManager.contents.newUntitled({
          type: 'notebook'
        });

        if (!model || !model.path) {
          throw new Error('Failed to create notebook file: model or path is missing');
        }

        // 作成されたファイルを開く
        await app.commands.execute('docmanager:open', {
          path: model.path
        });
      } catch (error) {
        console.error('Error creating new notebook:', error);
        if (error instanceof Error) {
          console.error('Error message:', error.message);
          console.error('Error stack:', error.stack);
        }
      }
    };

    // コマンドを登録（ランチャーから呼び出せるように）
    app.commands.addCommand('jupyterlab-angular-demo:open', {
      label: 'Angular Panel',
      iconClass: 'jp-AngularIcon',
      execute: () => {
        createNewNotebook();
      }
    });
    console.log('jupyterlab-angular-demo: Command registered');

    // 保存コマンドを登録
    const saveCommand = 'jupyterlab-angular-demo:save';
    app.commands.addCommand(saveCommand, {
      label: '保存',
      caption: 'Notebookファイルを上書き保存',
      execute: async () => {
        try {
          // 現在アクティブなウィジェットを取得
          const currentWidget = app.shell.currentWidget;
          if (currentWidget && currentWidget.id && currentWidget.id.startsWith('angular-widget-')) {
            // AngularWidgetのsaveメソッドを呼び出す
            const angularWidget = currentWidget as any;
            if (angularWidget.content && typeof angularWidget.content.save === 'function') {
              await angularWidget.content.save();
            } else if (angularWidget.save && typeof angularWidget.save === 'function') {
              await angularWidget.save();
            } else {
              // フォールバック: docmanager:saveコマンドを使用
              await app.commands.execute('docmanager:save');
            }
          } else {
            // フォールバック: docmanager:saveコマンドを使用
            await app.commands.execute('docmanager:save');
          }
        } catch (error) {
          console.error('Error saving notebook:', error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
          }
        }
      }
    });

    // Ctrl+Sキーバインドを追加
    app.commands.addKeyBinding({
      command: saveCommand,
      keys: ['Accel S'],
      selector: '.jp-AngularWidget'
    });

    // ランチャーにアイテムを追加（nullチェックを追加）
    if (launcher) {
      try {
        launcher.add({
          command: 'jupyterlab-angular-demo:open',
          category: 'Notebook',
          rank: 1
        });
        console.log('jupyterlab-angular-demo: Added to launcher successfully');
      } catch (error) {
        console.error('jupyterlab-angular-demo: Error adding to launcher:', error);
      }
    } else {
      console.warn('jupyterlab-angular-demo: ILauncher is not available, skipping launcher registration');
    }

    // ipynbファイルタイプのハンドラーを登録
    // AngularWidgetをデフォルトのNotebookビューアーとして設定
    class AngularWidgetFactory extends ABCWidgetFactory<IDocumentWidget<Widget, INotebookModel>> {
      constructor(options: DocumentRegistry.IWidgetFactoryOptions<IDocumentWidget<Widget, INotebookModel>>) {
        super(options);
      }

      protected createNewWidget(context: DocumentRegistry.IContext<INotebookModel>): IDocumentWidget<Widget, INotebookModel> {
        const content = new AngularWidget(app, docManager, context);
        const widget = new DocumentWidget({ content, context });
        widget.id = `angular-widget-${context.path}`;
        widget.title.label = context.path.split('/').pop() || 'Angular Panel';
        widget.title.closable = true;
        
        // 未保存状態の時に×ボタンを●に変更
        const updateDirtyState = () => {
          if (context.model.dirty) {
            // 未保存状態の時は●アイコンを表示
            widget.title.icon = circleIcon;
            widget.title.iconClass = 'jp-mod-dirty';
          } else {
            // 保存済みの時はアイコンをクリア
            widget.title.icon = undefined;
            widget.title.iconClass = '';
          }
        };
        
        // 初期状態を設定
        updateDirtyState();
        
        // dirty状態の変更を監視（context.modelのdirtyプロパティの変更を監視）
        context.model.stateChanged.connect((model, change) => {
          if (change.name === 'dirty') {
            updateDirtyState();
          }
        });
        
        return widget;
      }
    }

    const factory = new AngularWidgetFactory({
      name: 'Angular Panel',
      modelName: 'notebook',
      fileTypes: ['notebook'],
      defaultFor: ['notebook']
    });

    // ファクトリを登録
    app.docRegistry.addWidgetFactory(factory);
    console.log('AngularWidgetFactory added to docRegistry');

    // defaultWidgetFactory メソッドを上書き
    const originalDefaultWidgetFactory = app.docRegistry.defaultWidgetFactory.bind(app.docRegistry);
    app.docRegistry.defaultWidgetFactory = (fileType: string) => {
      if (fileType === 'notebook') {
        // AngularWidget ファクトリを取得
        const angularFactory = app.docRegistry.getWidgetFactory('Angular Panel');
        if (angularFactory) {
          console.log('defaultWidgetFactory: Returning Angular Panel for notebook');
          return angularFactory;
        }
      }
      return originalDefaultWidgetFactory(fileType);
    };
    console.log('Overrode defaultWidgetFactory method');

    // docmanager:open コマンドをインターセプト
    const originalOpenCommand = app.commands.execute.bind(app.commands);
    app.commands.execute = async (command: string, args?: any) => {
      // docmanager:openコマンドの場合
      if (command === 'docmanager:open') {
        console.log('Command executed: docmanager:open, args:', JSON.stringify(args));
        if (args) {
          const path = args.path as string;
          console.log('docmanager:open path:', path);
          if (path && (path.endsWith('.ipynb') || path.endsWith('.ipynb/'))) {
            console.log('docmanager:open intercepted for notebook:', path);
            // widgetNameを'Angular Panel'に指定して開く
            const newArgs = { ...args, widgetName: 'Angular Panel' };
            console.log('docmanager:open calling with widgetName: Angular Panel');
            return originalOpenCommand('docmanager:open', newArgs);
          }
        }
      }
      return originalOpenCommand(command, args);
    };
    console.log('Intercepted docmanager:open command');

    // DocumentManager の open メソッドもインターセプト
    if (docManager) {
      const docManagerAny = docManager as any;
      
      // open メソッドをインターセプト
      if (docManagerAny.open) {
        const originalOpen = docManagerAny.open.bind(docManagerAny);
        docManagerAny.open = async (path: string, widgetName?: string, kernel?: any, options?: any) => {
          // notebookファイルの場合
          if (path && (path.endsWith('.ipynb') || path.endsWith('.ipynb/'))) {
            // widgetNameが指定されていない、またはEditor/Notebookの場合、Angular Panelを使用
            if (!widgetName || widgetName === 'Editor' || widgetName === 'Notebook') {
              console.log('DocumentManager.open intercepted for notebook:', path, ', widgetName:', widgetName, ', forcing Angular Panel');
              // widgetNameを'Angular Panel'に指定して開く
              const result = await originalOpen(path, 'Angular Panel', kernel, options);
              console.log('DocumentManager.open: Result after forcing Angular Panel:', result);
              return result;
            }
          }
          // それ以外は通常通り開く
          return originalOpen(path, widgetName, kernel, options);
        };
        console.log('Intercepted DocumentManager.open method');
      }
      
      // openOrReveal メソッドをインターセプト
      if (docManagerAny.openOrReveal) {
        const originalOpenOrReveal = docManagerAny.openOrReveal.bind(docManagerAny);
        docManagerAny.openOrReveal = async (path: string, widgetName?: string, kernel?: any, options?: any) => {
          console.log('DocumentManager.openOrReveal called with path:', path, ', widgetName:', widgetName);
          // notebookファイルの場合
          if (path && (path.endsWith('.ipynb') || path.endsWith('.ipynb/'))) {
            // widgetNameが指定されていない、またはEditor/Notebookの場合、Angular Panelを使用
            if (!widgetName || widgetName === 'Editor' || widgetName === 'Notebook') {
              console.log('DocumentManager.openOrReveal intercepted for notebook:', path, ', widgetName:', widgetName, ', forcing Angular Panel');
              // widgetNameを'Angular Panel'に指定して開く
              const result = await originalOpenOrReveal(path, 'Angular Panel', kernel, options);
              console.log('DocumentManager.openOrReveal: Result after forcing Angular Panel:', result);
              return result;
            }
          }
          // それ以外は通常通り開く
          return originalOpenOrReveal(path, widgetName, kernel, options);
        };
        console.log('Intercepted DocumentManager.openOrReveal method');
      }
    } else {
      console.warn('IDocumentManager is not available, cannot intercept file opening');
    }

    // setDefaultWidgetFactory APIを適切なタイミングで呼び出す
    setTimeout(() => {
      try {
        app.docRegistry.setDefaultWidgetFactory('notebook', 'Angular Panel');
        console.log('Called setDefaultWidgetFactory for notebook -> Angular Panel');
        
        // 確認
        const defaultFactory = app.docRegistry.defaultWidgetFactory('notebook');
        console.log('Default widget factory for notebook (after setDefaultWidgetFactory):', defaultFactory ? defaultFactory.name : 'null');
      } catch (error) {
        console.warn('Error calling setDefaultWidgetFactory:', error);
      }
    }, 100);

    console.log('jupyterlab-angular-demo: Angular Panel拡張機能が有効になりました');
  }
};

export default plugin;
