import { ThemeConfig } from '../../services/theme.service';

/**
 * JupyterLab風ライトテーマ
 * JupyterLabのデフォルトテーマに近いデザイン
 */
const theme: ThemeConfig = {
  id: 'jupyter-light-theme',
  name: 'Jupyter Light Theme',
  monacoTheme: {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editor.selectionBackground': '#add6ff',
      'editor.inactiveSelectionBackground': '#e5ebf1',
      'editorIndentGuide.background': '#d3d3d3',
      'editorIndentGuide.activeBackground': '#939393',
      'editorCursor.foreground': '#000000',
      'editorWhitespace.foreground': '#bfbfbf',
      'editorLineNumber.foreground': '#237893',
      'editorLineNumber.activeForeground': '#0b216f',
      'editorGutter.background': '#fafafa',
      'editorWidget.background': '#f3f3f3',
      'editorWidget.border': '#c8c8c8',
      'editorSuggestWidget.background': '#ffffff',
      'editorSuggestWidget.border': '#c8c8c8',
      'editorSuggestWidget.selectedBackground': '#add6ff',
      'editorHoverWidget.background': '#ffffff',
      'editorHoverWidget.border': '#c8c8c8',
    }
  },
  variables: {
    // 背景色
    '--bg-primary': '#ffffff',
    '--bg-secondary': '#fafafa',
    '--bg-tertiary': '#f5f5f5',
    '--bg-canvas': '#ffffff',
    '--bg-canvas-gradient-start': '#ffffff',
    '--bg-canvas-gradient-end': '#f5f5f5',
    '--bg-window': '#ffffff',
    '--bg-window-titlebar': '#f5f5f5',
    '--bg-window-titlebar-gradient-start': '#f5f5f5',
    '--bg-window-titlebar-gradient-end': '#e0e0e0',
    '--bg-button-primary': '#1976d2',
    '--bg-button-primary-hover': '#1565c0',
    '--bg-button-hover': 'rgba(0, 0, 0, 0.05)',
    '--bg-scrollbar-thumb': 'rgba(0, 0, 0, 0.2)',

    // テキスト色
    '--text-primary': '#000000',
    '--text-secondary': '#333333',
    '--text-muted': '#666666',
    '--text-window-title': '#333333',
    '--text-window-status': '#1976d2',

    // ボーダー色
    '--border-color': '#e0e0e0',
    '--border-color-light': 'rgba(0, 0, 0, 0.1)',
    '--border-color-dark': '#cccccc',

    // アクセント色
    '--accent-primary': '#1976d2',
    '--accent-secondary': '#42a5f5',
    '--accent-cyan': '#00acc1',
    '--accent-cyan-light': '#26c6da',

    // ステータス色
    '--status-running': '#1976d2',
    '--status-error': '#d32f2f',
    '--status-success': '#388e3c',
    '--status-close': '#d32f2f',

    // その他の色
    '--shadow-window': '0 2px 8px rgba(0, 0, 0, 0.15)',
    '--shadow-button': '0 2px 4px rgba(0, 0, 0, 0.2)',
  },
  styles: `
    /* JupyterLab風ライトテーマの追加スタイル */
    .console-window {
      border-color: var(--border-color);
    }
    
    .console-window:hover,
    .console-window.is-active {
      border-color: var(--accent-primary);
      box-shadow: 0 0 0 1px var(--accent-primary), var(--shadow-window);
    }
    
    .console-window .window-titlebar {
      background: linear-gradient(
        180deg,
        var(--bg-window-titlebar-gradient-start) 0%,
        var(--bg-window-titlebar-gradient-end) 100%
      );
      border-bottom: 1px solid var(--border-color);
    }
    
    .console-window .window-status {
      color: var(--accent-primary);
    }
    
    .console-window .resize-handle {
      background: linear-gradient(
        135deg,
        transparent 0%,
        transparent 40%,
        var(--border-color) 40%,
        var(--border-color) 60%,
        transparent 60%
      );
    }
    
    .console-window .resize-handle:hover {
      background: linear-gradient(
        135deg,
        transparent 0%,
        transparent 40%,
        var(--border-color-dark) 40%,
        var(--border-color-dark) 60%,
        transparent 60%
      );
    }
  `
};

export default theme;


