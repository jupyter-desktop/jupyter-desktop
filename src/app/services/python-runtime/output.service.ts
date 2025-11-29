import { Injectable, inject, Injector } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PythonRuntimeService } from './python-runtime.service';
import { ExecutionService } from './execution.service';
import { KernelMessage } from '@jupyterlab/services';

/**
 * OutputService
 * 
 * 【役割】
 * - windowId（editorId）単位での出力ストリーム管理
 * - JSPメッセージ形式（stream, execute_result, display_data, error）の処理
 * - グローバル出力ストリームの管理
 * - 出力のクリア（clearOutput）
 * - 特定メッセージのフィルタリング（'next expected'、'stopiteration'など）
 * - executionIdからeditorIdへの解決
 */

export type RuntimeOutputType = 'stdout' | 'stderr' | 'result' | 'error';

export interface RuntimeOutput {
  type: RuntimeOutputType;
  content: string;  // 後方互換性のため保持（JupyterLabのtext/plainに相当）
  timestamp: number;
  
  // 新規追加（JupyterLabのMimeModelパターンに準拠）
  mimeType?: string;  // 優先されるMIMEタイプ（JupyterLabのselectPreferredMimeTypeの結果）
  data?: Record<string, any>;  // MIMEタイプごとのデータ（JupyterLabのMimeModel.dataに相当）
  metadata?: Record<string, any>;  // メタデータ（JupyterLabのMimeModel.metadataに相当）
  // 例: {'image/png': {'width': 100, 'height': 100}}
}

/**
 * MIMEタイプの優先順位（JupyterLab準拠）
 * 
 * JupyterLabの実装に基づく優先順位：
 * 1. HTML（最もリッチな表現）
 * 2. SVG（ベクター画像、スケーラブル）
 * 3. ラスター画像（PNG, JPEG, GIF）
 * 4. JSON（構造化データ）
 * 5. Markdown（構造化テキスト）
 * 6. LaTeX（数式）
 * 7. プレーンテキスト（フォールバック）
 * 
 * 参考: JupyterLabのrenderMimeModel実装
 */
const MIME_TYPE_PRIORITY = [
  'text/html',           // HTML出力（最優先）
  'image/svg+xml',       // SVG画像
  'image/png',           // PNG画像
  'image/jpeg',          // JPEG画像
  'image/gif',           // GIF画像
  'application/json',    // JSONデータ
  'text/markdown',       // Markdown
  'text/latex',          // LaTeX
  'text/plain'           // プレーンテキスト（フォールバック）
];

/**
 * 優先されるMIMEタイプを選択（JupyterLabの実装パターンに準拠）
 * 
 * JupyterLabでは、複数のMIMEタイプが利用可能な場合、
 * 優先順位リストに従って最もリッチな表現を選択します。
 * 
 * @param data - MIMEタイプごとのデータオブジェクト
 * @returns 優先されるMIMEタイプ、またはnull
 */
function selectPreferredMimeType(data: Record<string, any>): string | null {
  // 優先順位リストに従って選択
  for (const mimeType of MIME_TYPE_PRIORITY) {
    if (data[mimeType] !== undefined && data[mimeType] !== null) {
      return mimeType;
    }
  }
  // 優先順位リストにないMIMEタイプがある場合は、最初に見つかったものを使用
  // （JupyterLabの実装では、未知のMIMEタイプも処理可能）
  const keys = Object.keys(data);
  return keys.length > 0 ? keys[0] : null;
}

/**
 * MultilineStringまたはPartialJSONObjectを文字列に変換
 * 
 * @param value - 文字列、文字列配列、またはJSONオブジェクト
 * @returns 文字列
 */
function multilineStringToString(value: string | string[] | Record<string, any> | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.join('\n');
  }
  if (typeof value === 'object') {
    // PartialJSONObjectの場合は、JSON.stringifyで文字列化
    return JSON.stringify(value);
  }
  return String(value);
}

@Injectable({
  providedIn: 'root'
})
export class OutputService {
  private readonly pythonRuntime = inject(PythonRuntimeService);
  private readonly injector = inject(Injector);
  
  // 循環依存を回避するため、遅延注入を使用
  private get executionService(): ExecutionService {
    return this.injector.get(ExecutionService);
  }

  private readonly globalOutputSubject = new BehaviorSubject<RuntimeOutput[]>([]);
  public readonly output$: Observable<RuntimeOutput[]> = this.globalOutputSubject.asObservable();
  private readonly outputSubjectMap = new Map<string, BehaviorSubject<RuntimeOutput[]>>();

  private messageSubscription = this.pythonRuntime.message$.subscribe(({ event, message }) => {
    this.handleServerMessage(event, message);
  });

  /**
   * 特定のeditorIdの出力ストリームを取得
   */
  getOutput$(editorId: string): Observable<RuntimeOutput[]> {
    return this.getOrCreateOutputSubject(editorId).asObservable();
  }

  /**
   * 特定のeditorIdの現在の出力値を取得
   */
  getCurrentOutput(editorId: string): RuntimeOutput[] {
    return this.getOrCreateOutputSubject(editorId).value;
  }

  /**
   * 出力をクリア
   */
  clearOutput(editorId?: string): void {
    if (!editorId) {
      this.globalOutputSubject.next([]);
      this.outputSubjectMap.forEach(subject => subject.next([]));
      return;
    }
    const subject = this.getOrCreateOutputSubject(editorId);
    subject.next([]);
  }

  /**
   * 出力Subjectを取得または作成
   */
  private getOrCreateOutputSubject(editorId: string): BehaviorSubject<RuntimeOutput[]> {
    if (!editorId) {
      return this.globalOutputSubject;
    }
    let subject = this.outputSubjectMap.get(editorId);
    if (!subject) {
      subject = new BehaviorSubject<RuntimeOutput[]>([]);
      this.outputSubjectMap.set(editorId, subject);
    }
    return subject;
  }

  /**
   * 出力を追加
   */
  private appendOutput(output: RuntimeOutput, editorId?: string): void {
    const filtered = this.filterStopMessages(output);
    if (!filtered) {
      return;
    }
    console.log(`[OutputService] [DEBUG] appendOutput: editorId=${editorId}, content=${output.content.substring(0, 50)}, type=${output.type}`);
    if (editorId) {
      const target = this.getOrCreateOutputSubject(editorId);
      target.next([...target.value, filtered]);
      console.log(`[OutputService] [DEBUG] Output appended to editorId=${editorId}, current output count=${target.value.length}`);
    }
    const current = this.globalOutputSubject.value;
    this.globalOutputSubject.next([...current, filtered]);
  }

  /**
   * 特定のメッセージをフィルタリング
   */
  private filterStopMessages(output: RuntimeOutput): RuntimeOutput | null {
    const patterns = [
      'next expected',
      'stopiteration',
      '実行が停止されました'
    ];
    const lower = output.content?.toLowerCase?.() ?? '';
    if (patterns.some(pattern => lower.includes(pattern))) {
      return null;
    }
    return output;
  }

  /**
   * サーバーメッセージを処理
   */
  private handleServerMessage(event: string, message: KernelMessage.IMessage): void {
    const msgType = message.header.msg_type;
    const content = message.content as any;
    const parentHeader = message.parent_header;
    const metadata = message.metadata as any;
    const requestId = message.header.msg_id;
    const executionId = parentHeader?.msg_id || requestId;

    // デバッグログ: すべてのメッセージをログに記録
    if (msgType === 'stream' || event === 'stream' || msgType === 'execute_result' || msgType === 'execute_input') {
      console.log(`[OutputService] [DEBUG] handleServerMessage: event=${event}, type=${msgType}`);
    }

    // iopubチャンネルのメッセージのみ処理（重複防止）
    if (event !== 'iopub' && event !== 'shell' && event !== 'control' && event !== 'stdin') {
      // 旧イベント名（stdout, stderr, result, error）の場合は後で処理
      // その他のイベントは無視
      if (!['stdout', 'stderr', 'result', 'error'].includes(event)) {
        if (msgType === 'stream' || msgType === 'execute_result') {
          console.log(`[OutputService] [DEBUG] handleServerMessage: Ignoring message with event=${event}, type=${msgType}`);
        }
        return;
      }
    }

    // メッセージタイプ別の処理
    switch (msgType) {
      case 'execute_input':
        // 実行開始
        {
          // IPyflow統合用: 再実行通知の検出
          const isReexecution = metadata?.is_reexecution || false;
          const metadataEditorId = metadata?.editor_id;
          const editorId = metadataEditorId || this.executionService.resolveEditorId(executionId, requestId, content);
          
          if (isReexecution && metadataEditorId) {
            console.log(`[OutputService] [DEBUG] Re-execution detected for editor: ${metadataEditorId}`);
          }
          
          this.appendOutput({
            type: 'stdout',
            content: '--- 実行開始 ---',
            timestamp: Date.now()
          }, editorId);
        }
        break;

      case 'stream':
        // stdout/stderr処理
        {
          const streamMsg = message as KernelMessage.IStreamMsg;
          const name = streamMsg.content.name || 'stdout'; // 'stdout' or 'stderr'
          const text = multilineStringToString(streamMsg.content.text);
          
          const metadataEditorId = metadata?.editor_id;
          const resolvedEditorId = this.executionService.resolveEditorId(executionId, requestId, content);
          const editorId = metadataEditorId || resolvedEditorId;
          
          console.log(`[OutputService] [DEBUG] stream message: name=${name}, text=${text.substring(0, 50)}, metadata.editor_id=${metadataEditorId}, resolvedEditorId=${resolvedEditorId}, finalEditorId=${editorId}, executionId=${executionId}, requestId=${requestId}`);
          
          this.appendOutput({
            type: name === 'stderr' ? 'stderr' : 'stdout',
            content: text,
            timestamp: Date.now()
          }, editorId);
        }
        break;

      case 'execute_result':
        // 実行結果処理（JupyterLabのexecute_result処理に相当）
        {
          const executeResultMsg = message as KernelMessage.IExecuteResultMsg;
          const data = executeResultMsg.content.data || {};
          const msgMetadata = executeResultMsg.content.metadata || {};
          
          // JupyterLabの実装パターン: 優先されるMIMEタイプを選択
          const mimeType = selectPreferredMimeType(data);
          
          // 後方互換性のため、text/plainまたはtext/htmlをcontentに保持
          const textValue = data['text/plain'] || data['text/html'] || JSON.stringify(data);
          const text = multilineStringToString(textValue);
          
          const metadataEditorId = metadata?.editor_id;
          const editorId = metadataEditorId || 
                          this.executionService.resolveEditorId(executionId, requestId, content);
          this.appendOutput({
            type: 'result',
            content: text,
            timestamp: Date.now(),
            mimeType: mimeType || undefined,
            data: Object.keys(data).length > 0 ? data : undefined,
            metadata: Object.keys(msgMetadata).length > 0 ? msgMetadata : undefined
          }, editorId);
        }
        break;

      case 'display_data':
        // リッチ出力処理（JupyterLabのdisplay_data処理に相当）
        {
          const displayDataMsg = message as KernelMessage.IDisplayDataMsg;
          const data = displayDataMsg.content.data || {};
          const msgMetadata = displayDataMsg.content.metadata || {};
          
          // JupyterLabの実装パターン: 優先されるMIMEタイプを選択
          const mimeType = selectPreferredMimeType(data);
          
          // 後方互換性のため、text/plainまたはtext/htmlをcontentに保持
          const textValue = data['text/plain'] || data['text/html'] || JSON.stringify(data);
          const text = multilineStringToString(textValue);
          
          const metadataEditorId = metadata?.editor_id;
          const editorId = metadataEditorId || 
                          this.executionService.resolveEditorId(executionId, requestId, content);
          this.appendOutput({
            type: 'result',
            content: text,
            timestamp: Date.now(),
            mimeType: mimeType || undefined,
            data: Object.keys(data).length > 0 ? data : undefined,
            metadata: Object.keys(msgMetadata).length > 0 ? msgMetadata : undefined
          }, editorId);
        }
        break;

      case 'error':
        // エラー処理
        {
          const errorMsg = message as KernelMessage.IErrorMsg;
          const ename = errorMsg.content.ename || 'Error';
          const evalue = errorMsg.content.evalue || 'Unknown error';
          const traceback = errorMsg.content.traceback || [];
          const errorText = traceback.length > 0 
            ? traceback.join('\n')
            : `${ename}: ${evalue}`;
          
          const metadataEditorId = metadata?.editor_id;
          const editorId = metadataEditorId || this.executionService.resolveEditorId(executionId, requestId, content);
          this.appendOutput({
            type: 'error',
            content: errorText,
            timestamp: Date.now()
          }, editorId);
        }
        break;
    }

    // イベント名での処理
    switch (event) {
      case 'iopub':
        // iopubチャンネルのメッセージは上記のtype別処理で処理される
        break;

      case 'stdout':
      case 'stderr':
      case 'result':
      case 'error':
        // 旧形式のメッセージ（互換性維持）
        {
          const timestamp = Date.now();
          const textContent = (content as any)?.text || (content as any)?.content || '';
          const editorId = this.executionService.resolveEditorId(executionId, requestId, content);
          this.appendOutput({
            type: event as RuntimeOutputType,
            content: textContent,
            timestamp
          }, editorId);
        }
        break;
    }
  }

  /**
   * サービスを破棄
   */
  dispose(): void {
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
  }
}
