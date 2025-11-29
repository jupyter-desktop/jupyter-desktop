// このファイルは自動生成されます。手動で編集しないでください。
// 生成元: scripts/generate-plugin-config.ts

import type { Plugin } from './plugin-loader.service';

export const PLUGIN_CONFIGS = [
] as const;

export const PLUGIN_PATHS = [
] as const;

/**
 * ビルドツール（Angular/Esbuild+Vite）が事前に解析できる、
 * 「静的に解決可能な」プラグインのインポートテーブル。
 * 
 * - ここに登録したプラグインは、通常の `import()` でバンドルに含まれる
 * - 動的インポートの問題を回避するため、すべてのプラグインを静的インポートとして扱う
 */
export const staticPluginImporters: Record<string, () => Promise<Plugin>> = {
};
