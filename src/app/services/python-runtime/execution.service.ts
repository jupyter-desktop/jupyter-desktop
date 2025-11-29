import { Injectable, inject, Injector } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { PythonRuntimeService } from './python-runtime.service';
import { OutputService } from './output.service';
import { IpyflowApiService } from './ipyflow-api.service';
import { IpyflowCommService } from './ipyflow-comm.service';
import { KernelMessage } from '@jupyterlab/services';

/**
 * ExecutionService
 * 
 * 【役割】
 * - Pythonコードの実行リクエスト送信（JSP execute_request）
 * - 実行ID（executionId）の生成と管理
 * - editorIdとexecutionIdのマッピング（executionBindings）
 * - 実行状態（idle/running/error）の管理（JSP statusメッセージ）
 * - 実行完了のPromise解決（JSP execute_reply）
 * - 実行の中断（interrupt_request）とセッションリセット
 * - next()コールバック管理（registerNextFunction、unregisterNextFunction）
 */

export type ExecutionState = 'idle' | 'running' | 'error';

export interface ExecutionResult {
  status: 'completed' | 'cancelled' | 'error';
}

interface PendingExecution {
  resolve: (value: ExecutionResult) => void;
  reject: (reason?: unknown) => void;
}

@Injectable({
  providedIn: 'root'
})
export class ExecutionService {
  private readonly pythonRuntime = inject(PythonRuntimeService);
  private readonly outputService = inject(OutputService);
  private readonly injector = inject(Injector);
  
  // 循環依存を回避するため、遅延注入を使用
  private get ipyflowApiService(): IpyflowApiService {
    return this.injector.get(IpyflowApiService);
  }

  private get ipyflowComm(): IpyflowCommService {
    return this.injector.get(IpyflowCommService);
  }

  private readonly executionStateSubject = new BehaviorSubject<ExecutionState>('idle');
  public readonly executionState$: Observable<ExecutionState> = this.executionStateSubject.asObservable();

  // IPyflow統合用: ウィンドウ単位の実行状態管理
  private readonly windowExecutionStates = new Map<string, BehaviorSubject<ExecutionState>>();
  // IPyflow統合用: 再実行が必要なウィンドウのマーク
  private readonly windowsNeedingReexecution = new Set<string>();

  private readonly pendingExecutions = new Map<string, PendingExecution>();
  private readonly executionBindings = new Map<string, string>();
  private nextCallback: (() => Promise<string | null>) | null = null;

  private messageSubscription = this.pythonRuntime.message$.subscribe(({ event, message }) => {
    this.handleServerMessage(event, message);
  });

  /**
   * Pythonコードを実行
   */
  async runPython(code: string, editorId?: string, currentDate?: string): Promise<ExecutionResult> {
    // 全体で1つのセッションを使用（editorIdは記録のみ）
    if (editorId) {
      await this.pythonRuntime.initializeForEditor(editorId);
    } else {
      await this.pythonRuntime.initialize();
    }

    // カーネルが準備されるまで待機（最大15秒）
    const maxWaitTime = 15000;
    const startTime = Date.now();
    while (!this.pythonRuntime.isReady()) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitTime) {
        this.executionStateSubject.next('error');
        throw new Error(`Python ランタイムに接続できません（タイムアウト: ${elapsed}ms）`);
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const executionId = this.generateId();
    // editorIdは実行履歴や出力の紐付けに使用（セッションには影響しない）
    if (editorId) {
      this.executionBindings.set(executionId, editorId);
    }

    return new Promise<ExecutionResult>((resolve, reject) => {
      try {
        // currentDateを設定（必要に応じて）
        if (currentDate) {
          // currentDate変数を設定するコードを先に実行
          const setDateCode = `current_date = '${currentDate}'`;
          this.pythonRuntime.sendJSPMessage('execute_request', {
            code: setDateCode,
            silent: true,
            store_history: false,
            user_expressions: {},
            allow_stdin: false
          });
        }

        // execute_requestメッセージを送信
        // IPyflow統合用: cellIdをメタデータに追加（IPyflowが各実行を「セル」として認識するため）
        const cellId = editorId || this.generateCellId();
        const metadata = editorId 
          ? { editor_id: editorId, cellId: cellId } 
          : { cellId: cellId };
        
        const msgId = this.pythonRuntime.sendExecuteRequest(code, {
          silent: false,
          store_history: true,
          user_expressions: {},
          allow_stdin: false
        }, metadata);
        
        if (!msgId) {
          this.executionStateSubject.next('error');
          reject(new Error('実行リクエストの送信に失敗しました'));
          return;
        }
        
        // pendingExecutionsにはmsgId（requestId）をキーとして登録
        // execute_replyではrequestIdで検索するため
        this.pendingExecutions.set(msgId, { resolve, reject });
        
        if (editorId) {
          // requestId (msgId) から editorId を解決できるように登録
          this.executionBindings.set(msgId, editorId);
          // executionId からも editorId を解決できるように登録
          this.executionBindings.set(executionId, editorId);
        }
      } catch (error) {
        if (editorId) {
          this.executionBindings.delete(executionId);
        }
        this.executionStateSubject.next('error');
        reject(error);
      }
    }).then(async (result) => {
      // IPyflow統合用: コード実行後に、IPyflowに実行スケジュールを計算させる
      if (editorId && result.status === 'completed') {
        try {
          // IpyflowCommService.computeExecSchedule()を呼び出す
          // これにより、IPyflowが依存関係を計算し、ready_cellsを通知する
          await this.ipyflowComm.computeExecSchedule(editorId);
          console.log(`[ExecutionService] computeExecSchedule called for editor: ${editorId}`);
        } catch (error) {
          console.error('[ExecutionService] Error calling computeExecSchedule:', error);
          // エラーが発生しても実行は成功として扱う
        }
      }
      return result;
    });
  }

  /**
   * 実行を中断
   */
  async interruptExecution(): Promise<void> {
    if (!this.pythonRuntime.isReady()) {
      return;
    }
    this.pythonRuntime.sendJSPMessage('interrupt_request', {});
    this.executionStateSubject.next('idle');
  }

  /**
   * セッションをリセット
   * 
   * Pythonランタイムのセッションをリセットします。
   * カーネルが再起動され、すべての変数、インポート、実行状態がクリアされます。
   */
  async resetSession(): Promise<void> {
    try {
      // Pythonランタイムが初期化されていることを確認
      if (!this.pythonRuntime.isReady()) {
        await this.pythonRuntime.initialize();
        if (!this.pythonRuntime.isReady()) {
          throw new Error('Python ランタイムに接続できません');
        }
      }

      // 実行中のコードがあれば停止
      if (this.executionStateSubject.value === 'running') {
        await this.interruptExecution();
      }

      // セッションをリセット（カーネル再起動）
      await this.pythonRuntime.resetSession();

      // 実行状態をリセット
      this.executionStateSubject.next('idle');
      
      // 保留中の実行をクリア
      this.pendingExecutions.clear();
      this.executionBindings.clear();
      
      // IPyflow統合用: ウィンドウ単位の実行状態もリセット
      this.windowExecutionStates.forEach(state => state.next('idle'));

      console.log('[ExecutionService] セッションリセット完了');
    } catch (error) {
      console.error('[ExecutionService] セッションリセットエラー:', error);
      this.executionStateSubject.next('error');
      throw error;
    }
  }

  /**
   * next()コールバックを登録
   */
  registerNextFunction(callback: () => Promise<string | null>): void {
    this.nextCallback = callback;
  }

  /**
   * next()コールバックを解除
   */
  unregisterNextFunction(): void {
    this.nextCallback = null;
  }

  /**
   * executionIdからeditorIdを解決
   */
  resolveEditorId(executionId?: string, requestId?: string, payload?: any): string | undefined {
    const candidates = [executionId, requestId, payload?.requestId];
    for (const key of candidates) {
      if (!key) {
        continue;
      }
      const editorId = this.executionBindings.get(key);
      if (editorId) {
        return editorId;
      }
    }
    return undefined;
  }

  /**
   * executionBindingを解放
   */
  releaseExecutionBinding(executionKey?: string): void {
    if (!executionKey) {
      return;
    }
    this.executionBindings.delete(executionKey);
  }

  /**
   * 接続状態を確認
   */
  isReady(): boolean {
    return this.pythonRuntime.isReady();
  }

  /**
   * Pythonランタイムを初期化
   */
  async initialize(): Promise<void> {
    return this.pythonRuntime.initialize();
  }

  /**
   * エディタごとにPythonランタイムを初期化
   */
  async initializeForEditor(editorId: string): Promise<void> {
    return this.pythonRuntime.initializeForEditor(editorId);
  }

  /**
   * ウィンドウ単位の実行状態を取得
   * IPyflow統合用: 再実行通知に対応するウィンドウの状態を追跡
   */
  getWindowExecutionState$(editorId: string): Observable<ExecutionState> {
    if (!this.windowExecutionStates.has(editorId)) {
      this.windowExecutionStates.set(editorId, new BehaviorSubject<ExecutionState>('idle'));
    }
    return this.windowExecutionStates.get(editorId)!.asObservable();
  }

  /**
   * ウィンドウ単位の実行状態を更新
   * IPyflow統合用: 再実行通知時に呼び出す
   */
  private updateWindowExecutionState(editorId: string, state: ExecutionState): void {
    if (!this.windowExecutionStates.has(editorId)) {
      this.windowExecutionStates.set(editorId, new BehaviorSubject<ExecutionState>(state));
    } else {
      this.windowExecutionStates.get(editorId)!.next(state);
    }
  }

  /**
   * 互換性維持用: 旧Pyodide実装でAPI登録に使用していたメソッド
   * 新アーキテクチャではサーバー側に実装を移したため、ここでは no-op とする
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async registerAPIs(callbacks?: Record<string, unknown>): Promise<void> {
    return Promise.resolve();
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

    // メッセージタイプ別の処理
    switch (msgType) {
      case 'kernel_info_reply':
        // カーネル情報応答（初期化完了の確認）
        this.executionStateSubject.next('idle');
        break;

      case 'status':
        // 実行状態の更新（busy/idle）
        const statusMsg = message as KernelMessage.IStatusMsg;
        const executionState = statusMsg.content.execution_state; // 'busy' or 'idle'
        const state = executionState === 'busy' ? 'running' : 'idle';
        
        // IPyflow統合用: editor_idがある場合はウィンドウ単位の状態も更新
        const statusEditorId = metadata?.editor_id || this.resolveEditorId(executionId, requestId, content);
        if (statusEditorId) {
          this.updateWindowExecutionState(statusEditorId, state);
        }
        
        // グローバルな実行状態も更新
        this.executionStateSubject.next(state);
        break;

      case 'execute_input':
        // 実行開始
        // IPyflow統合用: 再実行通知の検出とウィンドウ単位の状態更新
        const isReexecution = metadata?.is_reexecution || false;
        const reexecutionEditorId = metadata?.editor_id;
        
        // editorIdを解決（再実行通知または通常の実行）
        const editorId = reexecutionEditorId || this.resolveEditorId(executionId, requestId, content);
        
        if (isReexecution && reexecutionEditorId) {
          console.log(`[ExecutionService] IPyflow re-execution detected for editor: ${reexecutionEditorId}`);
          // 再実行通知: 出力をクリアしてから実行状態を更新
          if (editorId) {
            // 再実行時は出力をクリア（新しい出力を表示するため）
            this.outputService.clearOutput(editorId);
            console.log(`[ExecutionService] [DEBUG] Cleared output for re-execution: editorId=${editorId}`);
            this.updateWindowExecutionState(editorId, 'running');
          }
        } else if (editorId) {
          // 通常の実行: ウィンドウ単位の実行状態を更新
          this.updateWindowExecutionState(editorId, 'running');
        }
        
        // グローバルな実行状態も更新
        this.executionStateSubject.next('running');
        break;

      case 'execute_reply':
        // 実行完了処理
        const executeReplyMsg = message as KernelMessage.IExecuteReplyMsg;
        // execute_replyでは、parent_header.msg_idが元のexecute_requestのID（requestId）
        // message.header.msg_idはexecute_reply自体のID
        const replyRequestId = parentHeader?.msg_id || requestId;
        this.handleExecuteReply(executeReplyMsg.content, executionId, replyRequestId, metadata);
        break;

      case 'error':
        // エラー処理
        const errorMsg = message as KernelMessage.IErrorMsg;
        // IPyflow統合用: エラータイプの検出と処理
        const errorType = content?.error_type;
        if (errorType === 'circular_dependency') {
          console.error(`[ExecutionService] Circular dependency error detected: ${errorMsg.content.evalue || errorMsg.content.ename}`);
          // 循環依存エラーの場合は、ウィンドウ単位のエラー状態を設定
          const errorEditorId = metadata?.editor_id || this.resolveEditorId(executionId, requestId, content);
          if (errorEditorId) {
            this.updateWindowExecutionState(errorEditorId, 'error');
          }
        } else if (errorType === 'connection_error') {
          console.error(`[ExecutionService] Connection error detected: ${errorMsg.content.evalue || errorMsg.content.ename}`);
          // 接続エラーの場合は、全体のエラー状態を設定
          const errorEditorId = metadata?.editor_id || this.resolveEditorId(executionId, requestId, content);
          if (errorEditorId) {
            this.updateWindowExecutionState(errorEditorId, 'error');
          }
        }
        this.handleError(errorMsg.content, executionId, requestId, metadata);
        break;
    }

    // イベント名での処理
    switch (event) {
      case 'iopub':
        // iopubチャンネルのメッセージは上記のtype別処理で処理される
        break;

      case 'shell':
        // shellチャンネルのメッセージは上記のtype別処理で処理される
        break;

      case 'disconnect':
        this.executionStateSubject.next('idle');
        // 保留中の Promise を reject
        this.rejectAllPendingExecutions(new Error('接続が切断されました'));
        break;
    }
  }

  /**
   * エラー処理
   */
  private handleError(errorContent: KernelMessage.IErrorMsg['content'], executionId?: string, requestId?: string, metadata?: any): void {
    // IPyflow統合用: editor_idがある場合はウィンドウ単位の状態も更新
    const errorEditorId = metadata?.editor_id || this.resolveEditorId(executionId, requestId, errorContent);
    if (errorEditorId) {
      this.updateWindowExecutionState(errorEditorId, 'error');
    }

    // グローバルな実行状態も更新
    this.executionStateSubject.next('error');

    // 保留中のPromiseをreject
    // requestId（msgId）を優先して検索（pendingExecutionsにはmsgIdで登録されている）
    const pendingKey = requestId || executionId;
    if (pendingKey && this.pendingExecutions.has(pendingKey)) {
      const pending = this.pendingExecutions.get(pendingKey);
      if (pending) {
        this.pendingExecutions.delete(pendingKey);
        pending.reject({ status: 'error' as const });
      }
    }

    this.releaseExecutionBinding(requestId || executionId);
  }

  /**
   * 実行完了処理
   */
  private handleExecuteReply(content: KernelMessage.IExecuteReplyMsg['content'], executionId?: string, requestId?: string, metadata?: any): void {
    const status = content.status; // 'ok' or 'error'
    const state = status === 'error' ? 'error' : 'idle';

    // IPyflow統合用: editor_idがある場合はウィンドウ単位の状態も更新
    const replyEditorId = metadata?.editor_id || this.resolveEditorId(executionId, requestId, content);
    if (replyEditorId) {
      this.updateWindowExecutionState(replyEditorId, state);
    }

    // requestId（msgId）を優先して検索（pendingExecutionsにはmsgIdで登録されている）
    const pendingKey = requestId || executionId;
    if (pendingKey && this.pendingExecutions.has(pendingKey)) {
      const pending = this.pendingExecutions.get(pendingKey);
      if (pending) {
        this.pendingExecutions.delete(pendingKey);
        
        if (status === 'ok') {
          pending.resolve({ status: 'completed' });
        } else {
          pending.reject({ status: 'error' });
        }
      }
    }

    // グローバルな実行状態も更新
    this.executionStateSubject.next(state);
    this.releaseExecutionBinding(requestId || executionId);
  }

  private rejectAllPendingExecutions(error: Error): void {
    const pending = Array.from(this.pendingExecutions.values());
    this.pendingExecutions.clear();
    pending.forEach(p => p.reject(error));
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * IPyflow統合用: セルIDを生成
   * editorIdがない場合に使用される
   */
  private generateCellId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `cell_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * IPyflow統合用: コードから定義された変数を抽出
   * 簡易版: 正規表現を使用（将来的にASTパーサーに置き換え可能）
   */
  private extractDefinedVariables(code: string): string[] {
    const variables: string[] = [];
    
    // 簡易版: 正規表現で変数定義を抽出
    // パターン: 変数名 = 値
    const assignmentPattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=/gm;
    const matches = code.matchAll(assignmentPattern);
    
    for (const match of matches) {
      const varName = match[1];
      // 予約語や組み込み関数を除外
      if (!this.isReservedWord(varName)) {
        variables.push(varName);
      }
    }
    
    // 重複を除去
    return Array.from(new Set(variables));
  }

  /**
   * 予約語かどうかを判定
   */
  private isReservedWord(word: string): boolean {
    const reservedWords = [
      'and', 'as', 'assert', 'break', 'class', 'continue', 'def', 'del',
      'elif', 'else', 'except', 'exec', 'finally', 'for', 'from', 'global',
      'if', 'import', 'in', 'is', 'lambda', 'not', 'or', 'pass', 'print',
      'raise', 'return', 'try', 'while', 'with', 'yield', 'True', 'False', 'None'
    ];
    return reservedWords.includes(word);
  }

  /**
   * IPyflow統合用: 再実行が必要なウィンドウをマーク
   */
  markWindowsForReexecution(windowIds: string[]): void {
    for (const windowId of windowIds) {
      this.windowsNeedingReexecution.add(windowId);
      console.log(`[ExecutionService] Marked window ${windowId} for re-execution`);
    }
  }

  /**
   * IPyflow統合用: ウィンドウが再実行が必要かどうかを確認
   */
  needsReexecution(windowId: string): boolean {
    return this.windowsNeedingReexecution.has(windowId);
  }

  /**
   * IPyflow統合用: ウィンドウの再実行マークをクリア
   */
  clearReexecutionMark(windowId: string): void {
    this.windowsNeedingReexecution.delete(windowId);
  }

  /**
   * サービスを破棄
   */
  dispose(): void {
    if (this.messageSubscription) {
      this.messageSubscription.unsubscribe();
    }
    // ウィンドウ単位の実行状態もクリーンアップ
    this.windowExecutionStates.forEach(state => state.complete());
    this.windowExecutionStates.clear();
  }
}
