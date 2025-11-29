/**
 * plugin-loader.service.ts
 * 
 * 【役割】
 * - プラグインをロード、初期化、有効化する
 * - プラグインのルート、プロバイダー、オーバーレイコンポーネント、グローバルイベントハンドラーを登録する
 * - プラグインのバージョン互換性チェックを行う
 * - プラグインの依存関係チェックを行う
 * - プラグインのサービスを取得する
 */
import { Injectable, inject, Type, Injector, InjectionToken } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { Provider } from '@angular/core';
import { Observable } from 'rxjs';

// 自動生成された静的インポーターをインポート
import { staticPluginImporters } from './plugin-config.generated';

// プラグインインターフェース（src/app外に定義）
export interface FloatingWindowConfig {
  id: string;
  title: string;
  component: Type<any>;
  icon?: string;
}

export interface OverlayComponentConfig {
  id: string;
  component: Type<any>;
  condition?: () => boolean | Observable<boolean> | (() => Observable<boolean>);
  zIndex?: number;
}

export interface GlobalEventHandler {
  event: string;
  key?: string;
  handler: (event: Event) => void | Promise<void>;
  priority?: number;
  preventDefault?: boolean;
}

export interface PluginHooks {
  onWindowCreate?: (windowId: string) => void | Promise<void>;
  onWindowDestroy?: (windowId: string) => void | Promise<void>;
  onSessionStart?: (sessionId: string) => void | Promise<void>;
  onSessionEnd?: (sessionId: string) => void | Promise<void>;
  onCodeExecute?: (code: string) => void | Promise<void>;
  onCodeExecuted?: (result: any) => void | Promise<void>;
}

export interface WindowTypeReplacementConfig {
  type: string;
  component: Type<any>;
}

export interface Plugin {
  config: {
    id: string;
    name: string;
    version: string;
    apiVersion: string;
    minAppVersion?: string;
    maxAppVersion?: string;
    dependencies?: string[];
  };
  initialize?: () => void | Promise<void>;
  activate?: () => void | Promise<void>;
  deactivate?: () => void | Promise<void>;
  registerRoutes?: () => Routes;
  registerProviders?: () => Provider[];
  registerFloatingWindows?: () => FloatingWindowConfig[];
  registerOverlayComponents?: () => OverlayComponentConfig[];
  registerGlobalEventHandlers?: () => GlobalEventHandler[];
  registerHooks?: () => PluginHooks;
  registerWindowTypeReplacements?: () => WindowTypeReplacementConfig[];
}

interface PluginLifecycle {
  state: 'unloaded' | 'loaded' | 'initialized' | 'activated' | 'deactivated' | 'error';
  error?: string;
}

interface PluginLoadResult {
  success: boolean;
  plugin?: Plugin;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PluginLoaderService {
  private router = inject(Router);
  private injector = inject(Injector);
  private plugins: Map<string, Plugin> = new Map();
  private pluginHooks: Map<string, PluginHooks> = new Map();
  private pluginProviders: Provider[] = [];
  private pluginStates = new Map<string, PluginLifecycle>();
  private overlayComponents: OverlayComponentConfig[] = [];
  private globalEventHandlers: GlobalEventHandler[] = [];
  private windowTypeReplacements: Map<string, Type<any>> = new Map();

  /**
   * プラグインシステムを初期化
   * @param pluginPaths ビルド時に生成されたプラグインパスの配列（空配列でも正常に動作）
   */
  async initialize(pluginPaths: readonly string[]): Promise<void> {
    const routes: Routes = [];
    
    // プラグインが0個の場合でも正常に動作（ループが実行されないだけ）
    // プラグインを順次ロード
    for (const pluginPath of pluginPaths) {
      try {
        const result = await this.loadPlugin(pluginPath);
        
        if (!result.success || !result.plugin) {
          console.error(`Failed to load plugin ${pluginPath}:`, result.error);
          continue;
        }
        
        const plugin = result.plugin;
        
        // プラグインの初期化
        if (plugin.initialize) {
          await plugin.initialize();
        }
        
        // ルートを収集
        if (plugin.registerRoutes) {
          const pluginRoutes = plugin.registerRoutes();
          routes.push(...pluginRoutes);
        }
        
        // フックを登録
        if (plugin.registerHooks) {
          const hooks = plugin.registerHooks();
          this.pluginHooks.set(plugin.config.id, hooks);
        }
        
        // プロバイダーを収集
        if (plugin.registerProviders) {
          this.pluginProviders.push(...plugin.registerProviders());
        }
        
        // オーバーレイコンポーネントを収集
        if (plugin.registerOverlayComponents) {
          const overlays = plugin.registerOverlayComponents();
          this.overlayComponents.push(...overlays);
        }
        
        // グローバルイベントハンドラーを収集
        if (plugin.registerGlobalEventHandlers) {
          const handlers = plugin.registerGlobalEventHandlers();
          this.globalEventHandlers.push(...handlers);
        }
        
        // ウィンドウタイプ置き換えを登録
        if (plugin.registerWindowTypeReplacements) {
          const replacements = plugin.registerWindowTypeReplacements();
          for (const replacement of replacements) {
            this.windowTypeReplacements.set(replacement.type, replacement.component);
          }
        }
        
        // プラグインを有効化
        if (plugin.activate) {
          await plugin.activate();
        }
        
        // プラグインの状態を更新
        this.pluginStates.set(plugin.config.id, {
          state: 'activated'
        });
      } catch (error) {
        console.error(`Failed to load plugin ${pluginPath}:`, error);
        this.pluginStates.set(pluginPath, {
          state: 'error',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // ルーター設定を更新（既存のルートは保持）
    const currentRoutes = this.router.config;
    this.router.resetConfig([...currentRoutes, ...routes]);
    
    // グローバルイベントハンドラーを登録（優先度順にソート）
    // 注意: この時点でプラグインのプロバイダーがDIコンテナに登録されている必要がある
    this.registerGlobalEventHandlers();
    
    // プラグインローダーへの参照をグローバルに公開（ハンドラー内でサービスを取得するため）
    // 注意: これは暫定的な実装。より良い方法については「実装上の注意点」を参照
    if (typeof window !== 'undefined') {
      (window as any).__pluginLoader = this;
    }
  }

  getPluginProviders(): Provider[] {
    return this.pluginProviders;
  }

  getOverlayComponents(): OverlayComponentConfig[] {
    return this.overlayComponents;
  }

  private registerGlobalEventHandlers(): void {
    // 優先度順にソート
    const sortedHandlers = [...this.globalEventHandlers].sort((a, b) => (a.priority || 100) - (b.priority || 100));
    
    // イベントタイプごとにグループ化
    const handlersByEvent = new Map<string, GlobalEventHandler[]>();
    for (const handler of sortedHandlers) {
      const eventKey = handler.key ? `${handler.event}:${handler.key}` : handler.event;
      if (!handlersByEvent.has(eventKey)) {
        handlersByEvent.set(eventKey, []);
      }
      handlersByEvent.get(eventKey)!.push(handler);
    }
    
    // 各イベントタイプに対してリスナーを登録
    for (const [eventKey, handlers] of handlersByEvent.entries()) {
      const [eventType, key] = eventKey.includes(':') ? eventKey.split(':') : [eventKey, undefined];
      
      document.addEventListener(eventType, (event: Event) => {
        // キーボードイベントの場合、キーが一致するかチェック
        if (key && event instanceof KeyboardEvent && event.key !== key) {
          return;
        }
        
        // ハンドラーを順次実行
        // 注意: ハンドラー内でサービスにアクセスする場合は、getService()を使用する
        for (const handler of handlers) {
          try {
            // ハンドラー関数にPluginLoaderServiceの参照を渡すためのラッパー
            // これにより、ハンドラー内でgetService()を使用できる
            const handlerWithContext = this.wrapHandlerWithContext(handler);
            const result = handlerWithContext(event);
            if (result instanceof Promise) {
              void result.catch(error => {
                console.error(`Global event handler error:`, error);
              });
            }
            
            // preventDefaultが指定されている場合はデフォルト動作を防止
            if (handler.preventDefault) {
              event.preventDefault();
            }
          } catch (error) {
            console.error(`Global event handler error:`, error);
          }
        }
      });
    }
  }

  /**
   * ハンドラー関数にPluginLoaderServiceのコンテキストを提供するラッパー
   * これにより、ハンドラー内でgetService()を使用できる
   */
  private wrapHandlerWithContext(handler: GlobalEventHandler): (event: Event) => void | Promise<void> {
    return (event: Event) => {
      // ハンドラー関数内でthisがPluginLoaderServiceを指すようにする
      // ただし、アロー関数の場合はthisが変更されないため、
      // ハンドラー側で明示的にgetService()を使用する必要がある
      return handler.handler(event);
    };
  }

  async executeHook(hookName: keyof PluginHooks, ...args: unknown[]): Promise<void> {
    for (const [pluginId, hooks] of this.pluginHooks.entries()) {
      const hook = hooks[hookName];
      if (hook && typeof hook === 'function') {
        try {
          // プラグインフックの型に応じて引数を渡す
          const hookFunc = hook as (...args: unknown[]) => void | Promise<void>;
          const result = hookFunc(...args);
          if (result instanceof Promise) {
            await result;
          }
        } catch (error) {
          console.error(`Plugin ${pluginId} hook ${hookName} failed:`, error);
        }
      }
    }
  }

  /**
   * ビルドツール（Angular/Esbuild+Vite）が事前に解析できる、
   * 「静的に解決可能な」プラグインのインポートテーブル。
   *
   * - ここに登録したプラグインは、通常の `import()` でバンドルに含まれる
   * - 動的インポートの問題を回避するため、すべてのプラグインを静的インポートとして扱う
   *
   * このオブジェクトは scripts/generate-plugin-config.ts によって自動生成されます。
   */
  private staticPluginImporters: Record<string, () => Promise<Plugin>> = staticPluginImporters;

  private async loadPlugin(pluginPath: string): Promise<PluginLoadResult> {
    try {
      // まず、静的に解決可能なプラグインかどうかを確認
      const staticImporter = this.staticPluginImporters[pluginPath];
      if (staticImporter) {
        const plugin = await staticImporter();

        // バージョン互換性チェック
        const compatibilityCheck = this.checkCompatibility(plugin);
        if (!compatibilityCheck.compatible) {
          return {
            success: false,
            error: `Plugin ${plugin.config.id} is not compatible: ${compatibilityCheck.reason}`
          };
        }

        // 依存関係チェック
        const dependencyCheck = await this.checkDependencies(plugin);
        if (!dependencyCheck.satisfied) {
          return {
            success: false,
            error: `Plugin ${plugin.config.id} dependencies not satisfied: ${dependencyCheck.missing.join(', ')}`
          };
        }

        this.plugins.set(plugin.config.id, plugin);
        return { success: true, plugin };
      }

      // Viteの開発サーバーで正しく解決されるように、プラグインのパスを解決
      // src/plugin-system/plugin-loader.service.ts から見て、プロジェクトルートに2階層上がる必要がある
      // theme.service.tsと同じアプローチを使用: ../../../plugin/...
      let resolvedPath: string;
      if (pluginPath.startsWith('./plugin/')) {
        // ./plugin/... -> ../../../plugin/...
        resolvedPath = `../../../${pluginPath.substring(2)}`;
      } else if (pluginPath.startsWith('plugin/')) {
        // plugin/... -> ../../../plugin/...
        resolvedPath = `../../../${pluginPath}`;
      } else if (pluginPath.startsWith('/plugin/')) {
        // /plugin/... -> ../../../plugin/...
        resolvedPath = `../../../${pluginPath.substring(1)}`;
      } else {
        // その他の場合はそのまま使用
        resolvedPath = pluginPath;
      }
      
      // デバッグ: 解決されたパスをログ出力
      console.log(`[PluginLoader] Loading plugin: ${pluginPath} -> ${resolvedPath}`);
      
      // @vite-ignore - 動的インポートのパス解決を無視（Viteの警告を抑制）
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const module = await import(/* @vite-ignore */ resolvedPath);
      const plugin = module.default as Plugin;
      
      // バージョン互換性チェック
      const compatibilityCheck = this.checkCompatibility(plugin);
      if (!compatibilityCheck.compatible) {
        return {
          success: false,
          error: `Plugin ${plugin.config.id} is not compatible: ${compatibilityCheck.reason}`
        };
      }
      
      // 依存関係チェック
      const dependencyCheck = await this.checkDependencies(plugin);
      if (!dependencyCheck.satisfied) {
        return {
          success: false,
          error: `Plugin ${plugin.config.id} dependencies not satisfied: ${dependencyCheck.missing.join(', ')}`
        };
      }
      
      this.plugins.set(plugin.config.id, plugin);
      return { success: true, plugin };
    } catch (error) {
      return {
        success: false,
        error: `Failed to load plugin: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private checkCompatibility(plugin: Plugin): { compatible: boolean; reason?: string } {
    // アプリバージョンとの互換性チェック
    const appVersion = '1.0.0'; // 実際のアプリバージョンを取得
    
    if (plugin.config.minAppVersion) {
      if (this.compareVersions(appVersion, plugin.config.minAppVersion) < 0) {
        return {
          compatible: false,
          reason: `App version ${appVersion} is less than required ${plugin.config.minAppVersion}`
        };
      }
    }
    
    if (plugin.config.maxAppVersion) {
      if (this.compareVersions(appVersion, plugin.config.maxAppVersion) > 0) {
        return {
          compatible: false,
          reason: `App version ${appVersion} is greater than maximum ${plugin.config.maxAppVersion}`
        };
      }
    }
    
    // プラグインAPIバージョンのチェック
    const requiredApiVersion = '1.0.0'; // 実際のAPIバージョンを取得
    if (this.compareVersions(plugin.config.apiVersion, requiredApiVersion) < 0) {
      return {
        compatible: false,
        reason: `Plugin API version ${plugin.config.apiVersion} is incompatible with required ${requiredApiVersion}`
      };
    }
    
    return { compatible: true };
  }

  private async checkDependencies(plugin: Plugin): Promise<{ satisfied: boolean; missing: string[] }> {
    if (!plugin.config.dependencies || plugin.config.dependencies.length === 0) {
      return { satisfied: true, missing: [] };
    }
    
    const missing: string[] = [];
    for (const depId of plugin.config.dependencies) {
      if (!this.plugins.has(depId)) {
        missing.push(depId);
      }
    }
    
    return {
      satisfied: missing.length === 0,
      missing
    };
  }

  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 < part2) return -1;
      if (part1 > part2) return 1;
    }
    
    return 0;
  }

  getPlugin(id: string): Plugin | undefined {
    return this.plugins.get(id);
  }

  /**
   * DIコンテナからサービスを取得します
   * プラグインが提供したサービスや、アプリケーションの既存サービスを取得できます
   * @param token サービスの型またはInjectionToken
   * @returns サービスインスタンス、存在しない場合はnull
   */
  getService<T>(token: Type<T> | InjectionToken<T>): T | null {
    try {
      return this.injector.get(token, null, { optional: true });
    } catch (error) {
      console.warn(`Failed to get service:`, error);
      return null;
    }
  }

  /**
   * ウィンドウタイプの置き換えコンポーネントを取得します
   * @param type ウィンドウタイプ（例: 'info'）
   * @returns 置き換えコンポーネント、存在しない場合はundefined
   */
  getWindowTypeReplacement(type: string): Type<any> | undefined {
    return this.windowTypeReplacements.get(type);
  }
}

