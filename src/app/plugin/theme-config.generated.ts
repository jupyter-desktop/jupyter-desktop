// このファイルは自動生成されます。手動で編集しないでください。
// 生成元: scripts/generate-plugin-config.ts

import type { ThemeConfig } from '../services/theme.service';

export const THEME_IDS = [
] as const;

/**
 * ビルドツール（Angular/Esbuild+Vite）が事前に解析できる、
 * 「静的に解決可能な」カスタムテーマのインポートテーブル。
 * 
 * - ここに登録したテーマは、通常の `import()` でバンドルに含まれる
 * - 動的インポートの問題を回避するため、すべてのテーマを静的インポートとして扱う
 */
export const staticThemeImporters: Record<string, () => Promise<ThemeConfig>> = {
};
