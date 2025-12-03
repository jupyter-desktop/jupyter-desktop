// Zone.jsを最初にインポート（必須）
import 'zone.js';

import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

(async () => {
  try {
    console.log('[Angular] Starting Angular application initialization...');
    
    const app = await createApplication({
      providers: appConfig.providers
    });
    
    console.log('[Angular] Application created, creating custom element...');
    
    const el = createCustomElement(AppComponent, {
      injector: app.injector
    });
    
    // 既に定義されている場合は再定義しない
    if (!customElements.get('ng-jl-demo')) {
      customElements.define("ng-jl-demo", el);
      console.log('[Angular] ng-jl-demo custom element defined successfully');
    } else {
      console.log('[Angular] ng-jl-demo custom element already defined');
    }
  } catch (error) {
    console.error('[Angular] Failed to initialize Angular application:', error);
    console.error('[Angular] Error details:', {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // エラーを再スローして、上位で処理できるようにする
    throw error;
  }
})();
