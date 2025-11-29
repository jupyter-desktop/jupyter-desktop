/**
 * app.config
 * 
 * 【役割】
 * - Angularアプリケーションの設定（プロバイダー登録）
 * - ルーティング設定の提供
 * - HTTPクライアントの提供
 * - Zone.jsの変更検知設定
 * - プラグインローダーの初期化
 * 
 * 【責務の境界】
 * - Angularフレームワークの設定のみを担当
 * - 実際のルート定義はapp.routesが担当
 * - アプリケーションロジックは各コンポーネント・サービスが担当
 */

import { ApplicationConfig, provideZoneChangeDetection, APP_INITIALIZER } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';

// 自動生成されたプラグイン設定をインポート
import { PLUGIN_PATHS } from './plugin/plugin-config.generated';

// プラグインローダーサービス（src/app外に配置）
import { PluginLoaderService } from './plugin/plugin-loader.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(),
    PluginLoaderService,
    {
      provide: APP_INITIALIZER,
      useFactory: (pluginLoader: PluginLoaderService) => {
        return () => pluginLoader.initialize(PLUGIN_PATHS);
      },
      deps: [PluginLoaderService],
      multi: true
    }
  ]
};
