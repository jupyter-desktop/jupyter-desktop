import { Injectable, NgZone, inject } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  ServiceManager,
  SessionManager,
  Session,
  KernelConnection,
  ServerConnection,
  KernelMessage,
  Kernel,
} from '@jupyterlab/services';

/**
 * PythonRuntimeService
 * 
 * 【役割】
 * - @jupyterlab/services を使用した Jupyter サーバーとの通信
 * - カーネル/セッション管理
 * - メッセージの送受信
 * - 接続状態の管理
 * - 複数エディタ対応（1つのカーネルを共有、エディタごとにセッションを作成）
 * 
 * 【責務の境界】
 * - Jupyter サーバーとの通信のみを担当
 * - イベントハンドラーのビジネスロジックは、他のサービスに委譲
 * - 受信したメッセージは、購読している他のサービスに通知する仕組み
 */

// IMessage を拡張して、既存の ServerMessage 形式と互換性を保つ
export interface ServerMessage {
  type: string;
  payload?: any;
  requestId?: string;
  executionId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PythonRuntimeService {
  private readonly zone = inject(NgZone);

  private serviceManager: ServiceManager | null = null;
  private sessionManager: SessionManager | null = null;
  private session: Session.ISessionConnection | null = null;
  private kernel: Kernel.IKernelConnection | null = null;
  private initialized = false;
  private connectionPromise: Promise<void> | null = null;
  private instanceId: string;
  private reconnectTimer: any = null;
  private manualClose = false;

  // メッセージ購読用のSubject
  private readonly messageSubject = new Subject<{ event: string; message: KernelMessage.IMessage }>();
  public readonly message$: Observable<{ event: string; message: KernelMessage.IMessage }> = 
    this.messageSubject.asObservable();

  constructor() {
    // インスタンスごとに一意のIDを生成
    this.instanceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `instance_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    // ServiceManager を初期化
    this.initializeServiceManager();
  }

  /**
   * ServiceManager を初期化
   */
  private initializeServiceManager(): void {
    const { baseUrl, wsUrl } = this.resolveServerUrls();
    
    const settings = ServerConnection.makeSettings({
      baseUrl: baseUrl,
      wsUrl: wsUrl,
      token: '', // トークンが必要な場合は設定
      appendToken: true,
    });

    this.serviceManager = new ServiceManager({ serverSettings: settings });
    this.sessionManager = new SessionManager({ 
      serverSettings: settings,
      kernelManager: this.serviceManager.kernels
    });
  }

  /**
   * サーバーURLを解決する
   * 
   * 優先順位:
   * 1. environment.pythonBackendUrl が明示的に設定されている場合（localhost:8888 など）→ そのまま使用
   * 2. environment.pythonBackendUrl が空文字列の場合 → 現在のオリジンを自動検出（binder環境用）
   * 3. フォールバック → localhost:8888
   */
  private resolveServerUrls(): { baseUrl: string; wsUrl: string } {
    // 環境変数が明示的に設定されている場合（空文字列以外）
    if (environment.pythonBackendUrl && environment.pythonBackendUrl.length > 0) {
      const baseUrl = environment.pythonBackendUrl;
      const wsUrl = environment.pythonBackendWsUrl && environment.pythonBackendWsUrl.length > 0
        ? environment.pythonBackendWsUrl
        : baseUrl.replace(/^http/, 'ws');
      return { baseUrl, wsUrl };
    }

    // 空文字列の場合: binder/JupyterLab環境 → 現在のオリジンを使用
    // ブラウザ環境かどうかをチェック
    if (typeof window !== 'undefined' && window.location) {
      const origin = window.location.origin;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}`;
      
      console.log('[PythonRuntime] binder/JupyterLab環境を検出: オリジンを自動使用', { baseUrl: origin, wsUrl });
      return { baseUrl: origin, wsUrl };
    }

    // フォールバック: ローカル開発環境
    console.log('[PythonRuntime] フォールバック: localhost:8888 を使用');
    return {
      baseUrl: 'http://localhost:8888',
      wsUrl: 'ws://localhost:8888'
    };
  }

  /**
   * エディタごとの初期化
   * 初回呼び出し時はカーネルとセッションを作成し、以降は既存セッションを再利用
   */
  async initializeForEditor(editorId: string): Promise<void> {
    // 既に初期化中または初期化済みの場合は、既存のPromiseを返す
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    if (this.initialized && this.session) {
      return;
    }
    
    // 初期化をシリアライズ（競合状態を防ぐ）
    this.connectionPromise = this._doInitialize();
    return this.connectionPromise;
  }
  
  /**
   * 実際の初期化処理（内部メソッド）
   */
  private async _doInitialize(): Promise<void> {
    try {
      if (!this.serviceManager || !this.sessionManager) {
        throw new Error('ServiceManager が初期化されていません');
      }

      // セッションが存在しない場合は作成
      if (!this.session) {
        const uniquePath = `jupyter-desktop-${this.instanceId}`;
        
        // セッションを作成（カーネルも自動的に作成される）
        this.session = await this.sessionManager.startNew({
          path: uniquePath,
          type: 'notebook',
          name: `jupyter-desktop-${this.instanceId}`,
          kernel: {
            name: 'python3'
          }
        });

        this.kernel = this.session.kernel;

        // カーネルメッセージの購読を設定
        this.setupKernelMessageHandlers();

        // カーネルが完全に初期化されるまで待機
        // カーネル情報をリクエストして、応答が返ってくるまで待つ
        if (this.kernel) {
          try {
            await this.kernel.info;
          } catch (error) {
            console.warn('[PythonRuntime] カーネル情報取得エラー（続行）:', error);
          }
        }
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('[PythonRuntime] 初期化エラー:', error);
      throw error;
    } finally {
      // 初期化完了後（成功・失敗問わず）はnullにリセット
      this.connectionPromise = null;
    }
  }

  /**
   * カーネルメッセージのハンドラーを設定
   */
  private setupKernelMessageHandlers(): void {
    if (!this.kernel) {
      return;
    }

    // すべてのメッセージを購読（iopub、shell、stdin、controlを含む）
    // anyMessageはすべてのメッセージをキャッチするため、iopubMessage.connect()は不要
    this.kernel.anyMessage.connect((_sender: Kernel.IKernelConnection, args: Kernel.IAnyMessageArgs) => {
      const msg = args.msg;
      const channel = msg.channel;
      this.zone.run(() => {
        // 1つのメッセージに対して1回だけ通知（チャンネル名をeventとして送信）
        // ExecutionServiceはmsg.header.msg_typeでメッセージタイプを判定するため、
        // メッセージタイプ別のイベントは不要
        this.messageSubject.next({ event: channel, message: msg });
      });
    });

    // カーネル状態の変更を購読
    this.kernel.statusChanged.connect((_sender: Kernel.IKernelConnection, status: KernelMessage.Status) => {
      this.zone.run(() => {
        if (status === 'dead' || status === 'unknown') {
          this.initialized = false;
          // disconnect イベントを通知（カスタムメッセージとして）
          this.messageSubject.next({
            event: 'disconnect',
            message: {
              header: {
                msg_id: '',
                msg_type: 'status' as KernelMessage.MessageType,
                username: '',
                session: this.session?.id || '',
                date: new Date().toISOString(),
                version: '5.3'
              },
              parent_header: {},
              metadata: {},
              content: { reason: 'kernel_died' },
              buffers: [],
              channel: 'iopub' as KernelMessage.Channel
            } as KernelMessage.IMessage
          });
        }
      });
    });
  }

  /**
   * 互換性維持用: 旧API（editorIdなし）
   */
  async initialize(): Promise<void> {
    return this.initializeForEditor('default');
  }

  /**
   * コード実行リクエストを送信
   */
  sendExecuteRequest(code: string, options?: Partial<KernelMessage.IExecuteRequestMsg['content']>, metadata?: any): KernelMessage.IShellMessage['header']['msg_id'] | null {
    if (!this.kernel || this.kernel.status === 'dead' || this.kernel.status === 'unknown') {
      console.warn('[PythonRuntime] カーネルが準備できていません');
      return null;
    }

    const content: KernelMessage.IExecuteRequestMsg['content'] = {
      code: code,
      silent: false,
      store_history: true,
      user_expressions: {},
      allow_stdin: false,
      stop_on_error: false,
      ...options
    };

    // メタデータを追加（IPyflow統合用）
    const msgMetadata = metadata || {};

    try {
      const future = this.kernel.requestExecute(content, false, msgMetadata);
      return future.msg.header.msg_id;
    } catch (error) {
      console.error('[PythonRuntime] 実行リクエスト送信エラー:', error);
      return null;
    }
  }

  /**
   * 中断リクエストを送信
   */
  sendInterruptRequest(): void {
    if (!this.kernel || this.kernel.status === 'dead' || this.kernel.status === 'unknown') {
      console.warn('[PythonRuntime] カーネルが準備できていません');
      return;
    }

    this.kernel.interrupt().catch((error: unknown) => {
      console.error('[PythonRuntime] 中断リクエストエラー:', error);
    });
  }

  /**
   * 接続状態を確認
   */
  isReady(): boolean {
    if (!this.initialized || !this.kernel) {
      return false;
    }
    const status = this.kernel.status;
    // 'idle'または'busy'状態の場合のみ準備完了とみなす
    return status === 'idle' || status === 'busy';
  }

  /**
   * カーネルインスタンスを取得（IPyflow Comm用）
   */
  getKernel(): Kernel.IKernelConnection | null {
    return this.kernel;
  }

  /**
   * カーネルを再起動
   */
  async restartKernel(): Promise<void> {
    if (!this.kernel) {
      throw new Error('カーネルが作成されていません');
    }

    if (this.kernel.status === 'dead' || this.kernel.status === 'unknown') {
      throw new Error('カーネルが準備できていません');
    }

    try {
      await this.kernel.restart();
      
      // 再起動後、カーネル情報を取得して初期化を完了
      try {
        await this.kernel.info;
      } catch (error) {
        console.warn('[PythonRuntime] カーネル情報取得エラー（続行）:', error);
      }
      
      // 再起動後もinitializedをtrueに保つ
      this.initialized = true;
    } catch (error) {
      console.error('[PythonRuntime] カーネル再起動エラー:', error);
      throw error;
    }
  }

  /**
   * セッションをリセット（カーネル再起動方式）
   */
  async resetSession(): Promise<void> {
    if (!this.kernel) {
      throw new Error('カーネルが作成されていません');
    }

    if (!this.isReady()) {
      throw new Error('Python ランタイムに接続できません');
    }

    try {
      // カーネルを再起動
      await this.restartKernel();
    } catch (error) {
      console.error('[PythonRuntime] セッションリセットエラー:', error);
      throw error;
    }
  }

  /**
   * 切断処理
   */
  private handleDisconnect(): void {
    if (this.manualClose) {
      return;
    }

    // 再接続をスケジュール
    this.scheduleReconnect();
  }

  /**
   * 再接続をスケジュール
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        // 既存のセッションをクリーンアップ
        if (this.session) {
          await this.session.shutdown();
          this.session = null;
        }
        this.kernel = null;
        this.initialized = false;

        // 再接続（最初のエディタで再初期化）
        await this.initializeForEditor('default');
      } catch (error: unknown) {
        console.error('[PythonRuntime] 再接続失敗:', error);
      }
    }, 2000);
  }

  /**
   * 接続を切断
   */
  dispose(): void {
    this.manualClose = true;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // セッションをシャットダウン
    if (this.session) {
      this.session.shutdown().catch((error: unknown) => {
        console.error('[PythonRuntime] セッションシャットダウンエラー:', error);
      });
      this.session = null;
    }
    
    this.kernel = null;
    this.initialized = false;
    this.connectionPromise = null;
  }

}
