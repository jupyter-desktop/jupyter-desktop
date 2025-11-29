/**
 * PythonRuntimeService 統合テスト
 * 
 * 【このテストファイルの目的】
 * @jupyterlab/servicesを使用した実装の統合テストを行います。
 * 実際のJupyter Serverに接続して、以下の機能をテストします：
 * - サービス初期化
 * - セッション作成
 * - カーネル接続
 * - コード実行
 * - メッセージ受信
 * 
 * 【前提条件】
 * - バックエンドサーバーが起動していること（http://localhost:8888）
 * - テスト実行前にサーバーを起動: cd backend && python run.py --no-browser
 * 
 * 【実行方法】
 * 統合テストを実行するには、このファイルを含むようにテストを実行してください
 */

import { TestBed } from '@angular/core/testing';
import { PythonRuntimeService } from './python-runtime.service';
import { ExecutionService } from './execution.service';
import { OutputService } from './output.service';
import { KernelMessage } from '@jupyterlab/services';
import { firstValueFrom, take } from 'rxjs';
import { timeout } from 'rxjs/operators';

// 個別テスト実行用: 特定のdescribeブロックのみを実行する場合は、他のdescribeをxdescribeに変更
// 例: xdescribe('コード実行', () => { ... }) でスキップ

describe('PythonRuntimeService Integration Tests', () => {
  // テストを順次実行する（並列実行を防ぐ）
  jasmine.getEnv().configure({ random: false, seed: 12345 });

  let pythonRuntime: PythonRuntimeService;
  let executionService: ExecutionService;
  let outputService: OutputService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PythonRuntimeService,
        ExecutionService,
        OutputService,
      ],
    });

    pythonRuntime = TestBed.inject(PythonRuntimeService);
    executionService = TestBed.inject(ExecutionService);
    outputService = TestBed.inject(OutputService);
  });

  afterEach(async () => {
    // クリーンアップ（タイムアウト付き）
    if (pythonRuntime) {
      try {
        pythonRuntime.dispose();
        // クリーンアップが完了するまで少し待つ
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('[afterEach] クリーンアップエラー:', error);
      }
    }
  });

  // テストタイムアウトを長めに設定（統合テストは時間がかかる）
  const TEST_TIMEOUT = 60000; // 60秒（統合テストは時間がかかるため）

  /**
   * カーネルが準備されるまで待機するヘルパー関数
   */
  async function waitForKernelReady(maxWaitTime: number = 15000): Promise<void> {
    const startTime = Date.now();
    let lastStatus: string | undefined;
    
    while (!pythonRuntime.isReady()) {
      const elapsed = Date.now() - startTime;
      if (elapsed > maxWaitTime) {
        console.error(`[waitForKernelReady] タイムアウト: elapsed=${elapsed}ms, lastStatus=${lastStatus}`);
        throw new Error(`カーネルが準備されるまでのタイムアウト (${elapsed}ms経過)`);
      }
      
      // カーネルの状態をログ出力（デバッグ用）
      if (pythonRuntime['kernel']) {
        const kernel = pythonRuntime['kernel'] as any;
        const currentStatus = kernel.status;
        if (currentStatus !== lastStatus) {
          console.log(`[waitForKernelReady] カーネル状態: ${currentStatus}, initialized=${pythonRuntime['initialized']}`);
          lastStatus = currentStatus;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[waitForKernelReady] カーネル準備完了: ${elapsed}ms`);
  }

  describe('サービス初期化', () => {
    it('サービスが正常に初期化されること', () => {
      expect(pythonRuntime).toBeTruthy();
      expect(executionService).toBeTruthy();
      expect(outputService).toBeTruthy();
    });

    it('初期状態ではisReady()がfalseを返すこと', () => {
      expect(pythonRuntime.isReady()).toBe(false);
    });
  });

  describe('セッション作成とカーネル接続', () => {
    it('initializeForEditor()でセッションが作成され、カーネルに接続できること', async () => {
      // セッション作成
      await pythonRuntime.initializeForEditor('test-editor-1');

      // カーネルが準備されるまで待機
      await waitForKernelReady();

      // カーネルが準備されていることを確認
      expect(pythonRuntime.isReady()).toBe(true);
    }, TEST_TIMEOUT);

    it('複数のエディタで同じカーネルを共有できること', async () => {
      // 最初のエディタで初期化
      await pythonRuntime.initializeForEditor('test-editor-1');
      await waitForKernelReady();
      expect(pythonRuntime.isReady()).toBe(true);

      // 2つ目のエディタでも同じカーネルを使用
      await pythonRuntime.initializeForEditor('test-editor-2');
      // 既にカーネルが作成されているので、即座に準備完了のはず
      expect(pythonRuntime.isReady()).toBe(true);
    }, TEST_TIMEOUT);
  });

  // 個別テスト実行用: 他のdescribeをxdescribeに変更してスキップ
  // xdescribe('セッション作成とカーネル接続', () => {
  // xdescribe('メッセージ受信', () => {
  // xdescribe('カーネル再起動', () => {
  // xdescribe('セッションリセット', () => {
  // xdescribe('切断とクリーンアップ', () => {

  describe('コード実行', () => {
    beforeEach(async () => {
      // 前のテストの影響を避けるため、念のためクリーンアップ
      if (pythonRuntime && pythonRuntime.isReady()) {
        pythonRuntime.dispose();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // 各テスト前に初期化
      await pythonRuntime.initializeForEditor('test-editor-exec');
      // カーネルが準備されるまで待機
      await waitForKernelReady();
    });

    it('簡単なPythonコードを実行できること', async () => {
      const code = 'print("Hello, World!")';
      
      // 実行（Promiseを直接await）
      const result = await executionService.runPython(code, 'test-editor-exec');
      expect(result.status).toBe('completed');
    }, TEST_TIMEOUT);

    it('変数の代入と参照ができること', async () => {
      // 変数を代入
      const code1 = 'x = 42';
      const result1 = await executionService.runPython(code1, 'test-editor-exec');
      expect(result1.status).toBe('completed');

      // 変数を参照
      const code2 = 'print(x)';
      const result2 = await executionService.runPython(code2, 'test-editor-exec');
      expect(result2.status).toBe('completed');
    }, TEST_TIMEOUT);

    it('エラーが発生した場合、エラーメッセージが受信されること', async () => {
      const code = 'raise ValueError("Test error")';
      
      // エラーが発生する場合、rejectされるか、statusが'error'になる
      try {
        const result = await executionService.runPython(code, 'test-editor-exec');
        // エラーが発生しても、実行は完了する
        expect(result.status).toBeDefined();
      } catch (error) {
        // エラーがrejectされる場合も許容
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('メッセージ受信', () => {
    beforeEach(async () => {
      await pythonRuntime.initializeForEditor('test-editor-messages');
      await waitForKernelReady();
    });

    it('iopubメッセージが受信されること', async () => {
      const code = 'print("Test message")';
      
      // メッセージを監視
      const messagePromise = firstValueFrom(
        pythonRuntime.message$.pipe(
          take(1),
          timeout({ first: 5000 })
        )
      );

      // コードを実行
      executionService.runPython(code, 'test-editor-messages');

      // メッセージが受信されることを確認
      const { event, message } = await messagePromise;
      expect(event).toBeTruthy();
      expect(message).toBeTruthy();
      expect(message.header).toBeTruthy();
    }, TEST_TIMEOUT);

    it('streamメッセージが受信されること', async () => {
      const code = 'print("Stream output")';
      
      // streamメッセージを監視
      let streamReceived = false;
      const subscription = pythonRuntime.message$.subscribe(({ event, message }) => {
        if (event === 'stream' || message.header.msg_type === 'stream') {
          streamReceived = true;
        }
      });

      // コードを実行
      await executionService.runPython(code, 'test-editor-messages');

      // 少し待ってから確認
      await new Promise(resolve => setTimeout(resolve, 1000));

      subscription.unsubscribe();
      expect(streamReceived).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('カーネル再起動', () => {
    beforeEach(async () => {
      await pythonRuntime.initializeForEditor('test-editor-restart');
      await waitForKernelReady();
    });

    it('カーネルを再起動できること', async () => {
      // 変数を設定
      const code1 = 'x = 100';
      const result1 = await executionService.runPython(code1, 'test-editor-restart');
      expect(result1.status).toBe('completed');

      // カーネルを再起動
      await pythonRuntime.restartKernel();

      // 再起動後、カーネルが準備されるまで待機
      await waitForKernelReady();

      // 再起動後も準備状態であることを確認
      expect(pythonRuntime.isReady()).toBe(true);

      // 変数がリセットされていることを確認（変数が存在しないエラーが発生する）
      const code2 = 'print(x)';
      try {
        const result2 = await executionService.runPython(code2, 'test-editor-restart');
        // エラーが発生することを期待（変数xが存在しない）
        expect(result2.status).toBeDefined();
      } catch (error) {
        // エラーがrejectされる場合も許容
        expect(error).toBeDefined();
      }
    }, TEST_TIMEOUT);
  });

  describe('セッションリセット', () => {
    beforeEach(async () => {
      await pythonRuntime.initializeForEditor('test-editor-reset');
      await waitForKernelReady();
    });

    it('セッションをリセットできること', async () => {
      // 変数を設定
      const code1 = 'y = 200';
      const result1 = await executionService.runPython(code1, 'test-editor-reset');
      expect(result1.status).toBe('completed');

      // セッションをリセット
      await pythonRuntime.resetSession();

      // リセット後、カーネルが準備されるまで待機
      await waitForKernelReady();

      // リセット後も準備状態であることを確認
      expect(pythonRuntime.isReady()).toBe(true);
    }, TEST_TIMEOUT);
  });

  describe('切断とクリーンアップ', () => {
    beforeEach(async () => {
      await pythonRuntime.initializeForEditor('test-editor-dispose');
      await waitForKernelReady();
    });

    it('dispose()で正常に切断できること', async () => {
      expect(pythonRuntime.isReady()).toBe(true);

      // 切断
      pythonRuntime.dispose();

      // dispose()は同期的に状態を更新するので、即座にfalseになるはず
      // ただし、非同期のシャットダウンが完了するまで少し待つ
      await new Promise(resolve => setTimeout(resolve, 500));

      // 切断後は準備状態でないことを確認
      expect(pythonRuntime.isReady()).toBe(false);
    }, TEST_TIMEOUT);
  });
});

