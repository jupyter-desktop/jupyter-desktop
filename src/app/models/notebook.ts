/**
 * notebook
 * 
 * 【役割】
 * - Jupyter Notebook形式（.ipynb）の型定義
 * - フローティングウィンドウ情報をNotebook形式で保存するための構造
 * - Notebookメタデータとセル情報の型定義
 * 
 * 【責務の境界】
 * - 型定義のみを提供（実装は含まない）
 * - Notebook形式への変換はnotebook-converterが担当
 * - Notebookファイルの読み書きはElectronServiceが担当
 */

export interface NotebookFile {
  nbformat: number;
  nbformat_minor: number;
  metadata: NotebookMetadata;
  cells: NotebookCell[];
}

export interface NotebookMetadata {
  kernelspec?: NotebookKernelSpec;
  language_info?: NotebookLanguageInfo;
  desktop?: JupyterDesktopMetadata;
}

export interface NotebookKernelSpec {
  name: string;
  display_name: string;
  language: string;
}

export interface NotebookLanguageInfo {
  name: string;
  version?: string;
  mimetype?: string;
  file_extension?: string;
  pygments_lexer?: string;
  codemirror_mode?: string | Record<string, unknown>;
}

export interface JupyterDesktopMetadata {
  version: string;
  savedAt: string;
  windowCount: number;
}

export interface NotebookCell {
  cell_type: 'code' | 'markdown';
  source: string[];
  metadata: NotebookCellMetadata;
  outputs?: NotebookOutput[];
  execution_count?: number | null;
}

export interface NotebookCellMetadata {
  window: NotebookWindowMetadata;
}

export interface NotebookWindowMetadata {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  isMinimized: boolean;
  type: 'editor' | 'info' | 'console';
  filePath?: string;
  autoRun?: boolean;
  infoPageId?: string | null;
  editorId?: string;  // コンソールウィンドウの場合、関連付けられたエディタのID
}

/**
 * Jupyter Notebook形式の出力型定義
 * Jupyter Notebook形式（nbformat 4.5）に準拠
 */
export type NotebookOutput = 
  | NotebookStreamOutput 
  | NotebookExecuteResultOutput 
  | NotebookDisplayDataOutput 
  | NotebookErrorOutput;

/**
 * Stream出力（stdout/stderr）
 */
export interface NotebookStreamOutput {
  output_type: 'stream';
  name: 'stdout' | 'stderr';
  text: string | string[];
}

/**
 * 実行結果出力
 */
export interface NotebookExecuteResultOutput {
  output_type: 'execute_result';
  execution_count: number | null;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * 表示データ出力
 */
export interface NotebookDisplayDataOutput {
  output_type: 'display_data';
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * エラー出力
 */
export interface NotebookErrorOutput {
  output_type: 'error';
  ename: string;
  evalue: string;
  traceback?: string[];
}


