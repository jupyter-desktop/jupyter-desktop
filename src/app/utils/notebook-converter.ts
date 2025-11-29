import { FloatingWindow } from '../services/floating-window-manager.service';
import {
  NotebookCell,
  NotebookFile,
  NotebookWindowMetadata,
  NotebookOutput,
  NotebookStreamOutput,
  NotebookExecuteResultOutput,
  NotebookDisplayDataOutput,
  NotebookErrorOutput,
} from '../models/notebook';
import { RuntimeOutput } from '../services/python-runtime/output.service';

/**
 * notebook-converter
 * 
 * 【役割】
 * - フローティングウィンドウ情報とJupyter Notebook形式（.ipynb）の相互変換
 * - ウィンドウの状態（位置、サイズ、コンテンツ）をNotebook形式で保存
 * - Notebookファイルからウィンドウ情報を復元
 * 
 * 【責務の境界】
 * - データ形式の変換のみを担当
 * - ファイルの読み書きはElectronServiceが担当
 * - ウィンドウの実際の作成・復元はFloatingWindowManagerComponentが担当
 */

export interface BuildNotebookOptions {
  savedAt?: string;
  version?: string;
  outputsByEditorId?: Map<string, RuntimeOutput[]>;  // エディタIDから出力へのマップ
}

export function windowsToNotebook(
  windows: FloatingWindow[],
  options: BuildNotebookOptions = {},
): NotebookFile {
  const savedAt = options.savedAt ?? new Date().toISOString();
  const version = options.version ?? '1.0';
  const outputsByEditorId = options.outputsByEditorId ?? new Map<string, RuntimeOutput[]>();

  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: 'python3',
        display_name: 'Python 3',
        language: 'python',
      },
      language_info: {
        name: 'python',
        mimetype: 'text/x-python',
        file_extension: '.py',
        pygments_lexer: 'ipython3',
        codemirror_mode: 'python',
      },
      desktop: {
        version,
        savedAt,
        windowCount: windows.length,
      },
    },
    cells: windows.map((window) => buildCellFromWindow(window, outputsByEditorId)),
  };
}

export function notebookToWindows(notebook: NotebookFile): FloatingWindow[] {
  if (!notebook.cells || !Array.isArray(notebook.cells)) {
    return [];
  }

  return notebook.cells
    .map((cell) => buildWindowFromCell(cell))
    .filter((window): window is FloatingWindow => window !== null);
}

function buildCellFromWindow(
  window: FloatingWindow,
  outputsByEditorId: Map<string, RuntimeOutput[]> = new Map()
): NotebookCell {
  const baseMetadata: NotebookWindowMetadata = {
    id: window.id,
    title: window.title,
    x: window.x,
    y: window.y,
    width: window.width,
    height: window.height,
    zIndex: window.zIndex,
    isMinimized: window.isMinimized,
    type: window.type ?? 'editor',
    filePath: window.filePath,
    autoRun: window.autoRun,
    infoPageId: window.type === 'info' ? window.content ?? null : null,
    editorId: window.editorId,
  };

  if ((window.type ?? 'editor') === 'editor') {
    // エディタウィンドウの場合、対応する出力を取得
    const editorId = window.id;
    const outputs = outputsByEditorId.get(editorId) ?? [];
    const notebookOutputs = convertRuntimeOutputsToNotebookOutputs(outputs);
    
    // 最後のexecute_resultからexecution_countを取得（簡易的な実装）
    let executionCount: number | null = null;
    for (let i = notebookOutputs.length - 1; i >= 0; i--) {
      const output = notebookOutputs[i];
      if (output.output_type === 'execute_result' && output.execution_count !== null) {
        executionCount = output.execution_count;
        break;
      }
    }

    return {
      cell_type: 'code',
      source: splitSource(window.content ?? ''),
      metadata: { window: baseMetadata },
      execution_count: executionCount,
      outputs: notebookOutputs.length > 0 ? notebookOutputs : undefined,
    };
  }

  if (window.type === 'info') {
    // 情報ウィンドウの場合、マークダウンコンテンツを保存
    // window.contentにマークダウンが保存されている場合はそれを使用
    // そうでない場合はinfoPageIdを保持（後方互換性のため）
    const markdownContent = window.content || '';
    return {
      cell_type: 'markdown',
      source: markdownContent ? splitSource(markdownContent) : [],
      metadata: { window: baseMetadata },
    };
  }

  // コンソールウィンドウの場合もmarkdownとして保存（内容は空）
  return {
    cell_type: 'markdown',
    source: [],
    metadata: { window: baseMetadata },
  };
}

function buildWindowFromCell(cell: NotebookCell): FloatingWindow | null {
  if (!cell.metadata || !cell.metadata.window) {
    return null;
  }

  const metadata = cell.metadata.window;
  const type = metadata.type ?? 'editor';

  const baseWindow: FloatingWindow = {
    id: metadata.id,
    title: metadata.title,
    x: metadata.x,
    y: metadata.y,
    width: metadata.width,
    height: metadata.height,
    zIndex: metadata.zIndex,
    isMinimized: metadata.isMinimized,
    content: '',
    filePath: metadata.filePath,
    autoRun: metadata.autoRun,
    type,
    needsSpawnAdjustment: false,
    editorId: metadata.editorId,
  };

  if (type === 'editor') {
    baseWindow.content = joinSource(cell.source ?? []);
  } else if (type === 'info') {
    // 情報ウィンドウの場合、マークダウンコンテンツを復元
    // cell.sourceにマークダウンが保存されている場合はそれを使用
    // そうでない場合はinfoPageIdを保持（後方互換性のため）
    const markdownContent = Array.isArray(cell.source) && cell.source.length > 0
      ? joinSource(cell.source)
      : null;
    baseWindow.content = markdownContent ?? metadata.infoPageId ?? '';
  } else if (type === 'console') {
    // コンソールウィンドウは内容を空のままにする
    baseWindow.content = '';
  }

  return baseWindow;
}

function splitSource(source: string): string[] {
  if (!source) {
    return [];
  }

  const lines = source.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line, index) =>
    index < lines.length - 1 ? `${line}\n` : line,
  );
}

function joinSource(source: string[]): string {
  if (!Array.isArray(source) || source.length === 0) {
    return '';
  }
  return source.join('');
}

/**
 * RuntimeOutputからNotebook出力への変換関数
 * 
 * RuntimeOutput[]をJupyter Notebook形式のoutputs配列に変換します。
 * 出力タイプ（stdout, stderr, result, error）をJupyter形式（stream, execute_result, display_data, error）にマッピングします。
 */
export function convertRuntimeOutputsToNotebookOutputs(
  outputs: RuntimeOutput[]
): NotebookOutput[] {
  const notebookOutputs: NotebookOutput[] = [];
  let executionCount: number | null = null;

  for (const output of outputs) {
    switch (output.type) {
      case 'stdout':
      case 'stderr': {
        const streamOutput: NotebookStreamOutput = {
          output_type: 'stream',
          name: output.type,
          text: splitSource(output.content),
        };
        notebookOutputs.push(streamOutput);
        break;
      }

      case 'result': {
        // リッチ出力（MIMEタイプとデータがある場合）
        if (output.mimeType && output.data && output.data[output.mimeType] !== undefined) {
          // execute_resultとして保存（実行結果）
          const executeResult: NotebookExecuteResultOutput = {
            output_type: 'execute_result',
            execution_count: executionCount,
            data: output.data,
            metadata: output.metadata,
          };
          notebookOutputs.push(executeResult);
          
          // 次の実行回数をインクリメント（簡易的な実装）
          if (executionCount === null) {
            executionCount = 1;
          } else {
            executionCount++;
          }
        } else {
          // プレーンテキストの場合はdisplay_dataとして保存
          const displayData: NotebookDisplayDataOutput = {
            output_type: 'display_data',
            data: {
              'text/plain': output.content,
            },
            metadata: output.metadata,
          };
          notebookOutputs.push(displayData);
        }
        break;
      }

      case 'error': {
        // エラー出力をパース（簡易的な実装）
        // エラー形式: "ErrorName: Error message\nTraceback..." または単純な文字列
        const errorText = output.content || '';
        const errorMatch = errorText.match(/^([^:]+):\s*(.+)$/);
        
        let ename = 'Error';
        let evalue = errorText;
        let traceback: string[] = [];

        if (errorMatch) {
          ename = errorMatch[1].trim();
          const rest = errorMatch[2].trim();
          
          // Tracebackがあるかチェック
          const tracebackMatch = rest.match(/Traceback[^]*$/);
          if (tracebackMatch) {
            evalue = rest.substring(0, tracebackMatch.index || rest.length).trim();
            traceback = tracebackMatch[0].split('\n').filter(line => line.trim().length > 0);
          } else {
            evalue = rest;
          }
        }

        const errorOutput: NotebookErrorOutput = {
          output_type: 'error',
          ename,
          evalue,
          traceback: traceback.length > 0 ? traceback : undefined,
        };
        notebookOutputs.push(errorOutput);
        break;
      }
    }
  }

  return notebookOutputs;
}


