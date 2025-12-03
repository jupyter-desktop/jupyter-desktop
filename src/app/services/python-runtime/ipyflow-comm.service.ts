import { Injectable, inject } from '@angular/core';
import { PythonRuntimeService } from './python-runtime.service';
import { FloatingWindowManagerService } from '../floating-window-manager.service';
import { ExecutionService } from './execution.service';
import { Kernel } from '@jupyterlab/services';
import { Subject } from 'rxjs';

/**
 * IpyflowCommService
 * 
 * 【役割】
 * - IPyflow Comm通信の管理
 * - Comm接続の確立と維持
 * - メッセージの送受信
 * - ready_cellsの通知
 * 
 * 【実装方針】
 * - @jupyterlab/servicesのkernel.createComm()を直接使用
 * - Comm通信でIPyflowとリアクティブ実行を制御
 */

/**
 * IPyflow Commメッセージの型定義
 */
interface IpyflowCommMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * establishメッセージの型定義
 */
interface IpyflowEstablishMessage extends IpyflowCommMessage {
  type: 'establish';
  success?: boolean;
}

/**
 * compute_exec_scheduleレスポンスの型定義
 */
interface IpyflowComputeExecScheduleResponse extends IpyflowCommMessage {
  type: 'compute_exec_schedule';
  ready_cells?: string[];
  new_ready_cells?: string[];
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class IpyflowCommService {
  private pythonRuntime = inject(PythonRuntimeService);
  private windowManager = inject(FloatingWindowManagerService);
  private executionService = inject(ExecutionService);
  private comm: Kernel.IComm | null = null;
  private isConnected = false;

  // ready_cellsの通知用（既存のExecutionServiceと連携するため、Subjectは残す）
  public readonly readyCells$ = new Subject<string[]>();

  /**
   * IPyflow Comm接続を初期化
   */
  async initialize(): Promise<void> {
    try {
      const kernel = this.pythonRuntime.getKernel();
      if (!kernel) {
        throw new Error('Kernel not ready');
      }

      // 0. IPyflow拡張機能をロード（カーネル起動時に自動的に読み込まれない場合があるため）
      // これにより、IPyflowのCommターゲットが登録される
      try {
        await this.loadIpyflowExtension(kernel);
      } catch (error) {
        console.warn('[IPyflow] Failed to load extension (may already be loaded):', error);
        // 拡張機能が既にロードされている場合はエラーを無視
      }

      // 少し待ってからComm接続を試みる（IPyflowの初期化が完了するまで）
      await new Promise(resolve => setTimeout(resolve, 500));

      // 1. Comm作成（たった1行！）
      this.comm = kernel.createComm('ipyflow', 'ipyflow');

      // 2. メッセージハンドラー登録
      this.comm.onMsg = (msg) => {
        try {
          const payload = msg.content.data as IpyflowCommMessage;

          if (payload['type'] === 'establish') {
            const establishMsg = payload as IpyflowEstablishMessage;
            this.isConnected = true;
          } else if (payload['type'] === 'compute_exec_schedule') {
            const scheduleMsg = payload as IpyflowComputeExecScheduleResponse;
            // ready_cellsを通知
            const readyCells = (scheduleMsg['ready_cells'] || []) as string[];
            
            // ExecutionServiceに通知（既存の実装を活用）
            this.executionService.markWindowsForReexecution(readyCells);
            
            // Subjectにも通知（FloatingEditorWindowComponent用）
            this.readyCells$.next(readyCells);
          }
        } catch (error) {
          console.error('[IPyflow] Message handling error:', error);
        }
      };

      // 3. Comm切断時のハンドラー
      this.comm.onClose = () => {
        console.warn('[IPyflow] Comm disconnected');
        this.isConnected = false;
        this.comm = null;
        // 必要に応じて再接続を試みる
      };

      // 4. Comm接続を開く
      this.comm.open({
        interface: 'jupyter-desktop',
        cell_metadata_by_id: this.gatherCellMetadata()
      });
    } catch (error) {
      console.error('[IPyflow] Initialization error:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * IPyflow拡張機能をロード
   */
  private async loadIpyflowExtension(kernel: Kernel.IKernelConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      // %load_ext ipyflow を実行
      const code = '%load_ext ipyflow';
      const future = kernel.requestExecute({ code, silent: true, store_history: false });
      
      future.onIOPub = (msg) => {
        if (msg.header.msg_type === 'status' && (msg.content as any).execution_state === 'idle') {
          resolve();
        }
      };
      
      future.done.then(() => {
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /**
   * セルメタデータを収集（FloatingWindowManagerから取得）
   */
  private gatherCellMetadata(): Record<string, any> {
    // FloatingWindowManagerServiceから全ウィンドウを取得
    // 注: getAllWindows()メソッドが既に存在（247行目）
    const windows = this.windowManager.getAllWindows();
    const metadata: Record<string, any> = {};

    // 配列のインデックスをセルの実行順序として使用
    // 注: IPyflowはindexをセルの実行順序として使用する
    windows.forEach((win, index) => {
      if (win.type === 'editor') {
        metadata[win.id] = {
          id: win.id,
          index: index, // 配列の順序 = セルの実行順序
          type: 'code',
          content: win.content || ''
        };
      }
    });

    return metadata;
  }

  /**
   * 実行スケジュールを計算
   */
  async computeExecSchedule(cellId: string): Promise<void> {
    if (!this.comm || !this.isConnected) {
      console.warn('[IPyflow] Comm not connected, skipping computeExecSchedule');
      return;
    }

    try {
      this.comm.send({
        type: 'compute_exec_schedule',
        executed_cell_id: cellId,
        cell_metadata_by_id: this.gatherCellMetadata(),
        // オプションフィールドを明示的に設定
        notify_content_changed: true,
        allow_new_ready: true
      });
    } catch (error) {
      console.error('[IPyflow] Error sending compute_exec_schedule:', error);
    }
  }
}

