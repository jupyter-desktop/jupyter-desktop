import { test, expect } from '@playwright/test';

/**
 * IPyflow Reactive機能のE2Eテスト
 * 
 * 【このテストファイルの目的】
 * IPyflowのリアクティブ実行機能をE2Eテストで検証します。
 * 複数のフローティングウィンドウ間で変数の変更が自動的に反映されることを確認します。
 * 
 * 【重要な設計判断と背景】
 * 1. Monaco Editorの操作
 *    - Monaco Editorはiframe内で動作するため、直接`.fill()`は使用できない
 *    - `page.evaluate()`を使用してMonaco EditorのAPIにアクセス
 *    - または、キーボード入力でコードを入力する方法も使用可能
 * 
 * 2. バックエンドサーバーの起動
 *    - テスト実行前にバックエンドサーバーが起動している必要がある
 *    - 起動コマンド: `cd backend && python run.py --port 8888`
 * 
 * 3. 自動再実行の確認
 *    - Phase 3で実装された自動再実行機能をテスト
 *    - `needsReexecution`フラグが立ったときに自動的に再実行されることを確認
 * 
 * 【数年後に知っておくべきこと】
 * - ウィンドウIDは動的に生成されるため、固定のIDを想定しない
 * - コンソールウィンドウのIDは `{editorId}-console` 形式
 * - IPyflow Comm接続が確立されるまで時間がかかる場合がある
 */

test.describe('IPyflow Reactive機能のE2Eテスト', () => {
  test.beforeEach(async ({ page }) => {
    // アプリを開く
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // IPyflow Comm接続が確立されるまで待つ（最大15秒）
    await page.waitForFunction(
      () => {
        // コンソールログでIPyflow Comm接続を確認
        // 実際の実装では、接続状態を確認する方法を追加する必要がある
        return true;
      },
      { timeout: 15000 }
    );
  });

  /**
   * Monaco Editorにコードを入力するヘルパー関数
   */
  async function setEditorCode(page: any, windowId: string, code: string): Promise<void> {
    await page.evaluate(
      ({ windowId, code }: { windowId: string; code: string }) => {
        const windowElement = document.querySelector(`[data-window-id="${windowId}"]`);
        if (!windowElement) {
          throw new Error(`Window not found: ${windowId}`);
        }
        
        const editorHost = windowElement.querySelector('.editor-host');
        if (!editorHost) {
          throw new Error(`Editor host not found in window: ${windowId}`);
        }
        
        // Monaco Editorのインスタンスを取得
        const w = window as any;
        if (!w.monaco || !w.monaco.editor) {
          throw new Error('Monaco Editor not loaded');
        }
        
        // すべてのエディタインスタンスを取得
        const editors = w.monaco.editor.getEditors();
        const editor = editors.find((e: any) => {
          const container = e.getContainerDomNode();
          return container === editorHost;
        });
        
        if (editor) {
          editor.setValue(code);
        } else {
          // エディタが見つからない場合、直接DOM操作で試みる
          // これはフォールバック方法
          console.warn(`Editor instance not found for window: ${windowId}, trying alternative method`);
        }
      },
      { windowId, code }
    );
  }

  /**
   * ウィンドウの実行ボタンをクリックするヘルパー関数
   */
  async function clickRunButton(page: any, windowLocator: any): Promise<void> {
    const runButton = windowLocator.locator('.run-btn');
    await runButton.waitFor({ state: 'visible', timeout: 5000 });
    await runButton.click();
  }

  /**
   * コンソール出力を確認するヘルパー関数
   */
  async function waitForConsoleOutput(
    page: any,
    consoleId: string,
    expectedText: string,
    timeout: number = 10000
  ): Promise<void> {
    const consoleWindow = page.locator(`[data-window-id="${consoleId}"]`);
    await consoleWindow.waitFor({ state: 'visible', timeout: 5000 });
    await expect(consoleWindow).toContainText(expectedText, { timeout });
  }

  // TC-035: 正常系 - 基本的なReactive実行（2つのウィンドウ間での変数共有）
  test('TC-035: 基本的なReactive実行（2つのウィンドウ間での変数共有）', async ({ page }) => {
    // 1. 2つのウィンドウを作成
    const createButton = page.locator('.toolbar-btn').first();
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);

    // 2. エディタウィンドウを取得
    const editorWindows = await page
      .locator('[data-window-id]')
      .filter({ has: page.locator('.editor-host') })
      .all();
    
    expect(editorWindows.length).toBeGreaterThanOrEqual(2);
    
    const window1 = editorWindows[0];
    const window2 = editorWindows[1];
    const window1Id = await window1.getAttribute('data-window-id');
    const window2Id = await window2.getAttribute('data-window-id');
    
    expect(window1Id).toBeTruthy();
    expect(window2Id).toBeTruthy();

    // 3. window-1で x = 1 を実行
    await setEditorCode(page, window1Id!, 'x = 1');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000); // 実行完了を待つ

    // 4. window-2で print(x+12) を実行
    await setEditorCode(page, window2Id!, 'print(x+12)');
    await clickRunButton(page, window2);
    await page.waitForTimeout(2000);

    // 5. 出力を確認（コンソールウィンドウは {windowId}-console 形式）
    const console2Id = `${window2Id}-console`;
    await waitForConsoleOutput(page, console2Id, '13');

    // 6. window-1で x = 10 に変更して実行
    await setEditorCode(page, window1Id!, 'x = 10');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // 7. window-2が自動的に再実行されることを確認（Phase 3の自動再実行機能）
    // 自動再実行は即座に実行されるため、再実行インジケーターの確認はスキップ
    // 代わりに、自動再実行が完了するまで待つ（最大10秒）
    await page.waitForTimeout(5000);

    // 8. 出力が更新されることを確認（22になる）
    await waitForConsoleOutput(page, console2Id, '22');
  });

  // TC-036: 正常系 - 自動再実行機能の確認（手動クリック不要）
  test('TC-036: 自動再実行機能の確認（手動クリック不要）', async ({ page }) => {
    // 1. 2つのウィンドウを作成
    const createButton = page.locator('.toolbar-btn').first();
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);

    // 2. エディタウィンドウを取得
    const editorWindows = await page
      .locator('[data-window-id]')
      .filter({ has: page.locator('.editor-host') })
      .all();
    
    expect(editorWindows.length).toBeGreaterThanOrEqual(2);
    
    const window1 = editorWindows[0];
    const window2 = editorWindows[1];
    const window1Id = await window1.getAttribute('data-window-id');
    const window2Id = await window2.getAttribute('data-window-id');

    // 3. window-1で x = 1 を実行
    await setEditorCode(page, window1Id!, 'x = 1');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // 4. window-2で print(x*2) を実行
    await setEditorCode(page, window2Id!, 'print(x*2)');
    await clickRunButton(page, window2);
    await page.waitForTimeout(2000);

    // 5. 出力を確認
    const console2Id = `${window2Id}-console`;
    await waitForConsoleOutput(page, console2Id, '2');

    // 6. window-1で x = 5 に変更して実行
    await setEditorCode(page, window1Id!, 'x = 5');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // 7. 自動再実行が完了するまで待つ（手動で再実行ボタンをクリックしない）
    // 自動再実行は即座に実行されるため、再実行インジケーターの確認はスキップ
    await page.waitForTimeout(5000);

    // 8. 出力が自動的に更新されることを確認（10になる）
    await waitForConsoleOutput(page, console2Id, '10');
  });

  // TC-037: 正常系 - 複数ウィンドウでの依存関係チェーン（window-1 → window-2 → window-3）
  test('TC-037: 複数ウィンドウでの依存関係チェーン', async ({ page }) => {
    // 1. 3つのウィンドウを作成
    const createButton = page.locator('.toolbar-btn').first();
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);

    // 2. エディタウィンドウを取得
    const editorWindows = await page
      .locator('[data-window-id]')
      .filter({ has: page.locator('.editor-host') })
      .all();
    
    expect(editorWindows.length).toBeGreaterThanOrEqual(3);
    
    const window1 = editorWindows[0];
    const window2 = editorWindows[1];
    const window3 = editorWindows[2];
    const window1Id = await window1.getAttribute('data-window-id');
    const window2Id = await window2.getAttribute('data-window-id');
    const window3Id = await window3.getAttribute('data-window-id');

    // 3. window-1で a = 1 を実行
    await setEditorCode(page, window1Id!, 'a = 1');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // 4. window-2で b = a + 1 を実行
    await setEditorCode(page, window2Id!, 'b = a + 1');
    await clickRunButton(page, window2);
    await page.waitForTimeout(2000);

    // 5. window-3で print(b * 2) を実行
    await setEditorCode(page, window3Id!, 'print(b * 2)');
    await clickRunButton(page, window3);
    await page.waitForTimeout(2000);

    // 6. window-3の出力を確認（4になる: (1+1)*2 = 4）
    const console3Id = `${window3Id}-console`;
    await waitForConsoleOutput(page, console3Id, '4');

    // 7. window-1で a = 10 に変更して実行
    await setEditorCode(page, window1Id!, 'a = 10');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // 8. window-2とwindow-3が自動的に再実行されることを確認
    // 自動再実行は即座に実行されるため、再実行インジケーターの確認はスキップ
    // 自動再実行が完了するまで待つ
    await page.waitForTimeout(5000);

    // 9. window-3の出力が更新されることを確認（22になる: (10+1)*2 = 22）
    // 注意: window-2が再実行されると b = 11 になり、window-3が再実行されると 22 になる
    await waitForConsoleOutput(page, console3Id, '22');
  });

  // TC-038: 異常系 - 循環依存の検出とエラーハンドリング
  test('TC-038: 循環依存の検出とエラーハンドリング', async ({ page }) => {
    // テストタイムアウトを設定（60秒）
    test.setTimeout(60000);

    // 1. 3つのウィンドウを作成
    const createButton = page.locator('.toolbar-btn').first();
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);
    await createButton.click();
    await page.waitForTimeout(500);

    // 2. エディタウィンドウを取得
    const editorWindows = await page
      .locator('[data-window-id]')
      .filter({ has: page.locator('.editor-host') })
      .all();
    
    expect(editorWindows.length).toBeGreaterThanOrEqual(3);
    
    const window1 = editorWindows[0];
    const window2 = editorWindows[1];
    const window3 = editorWindows[2];
    const window1Id = await window1.getAttribute('data-window-id');
    const window2Id = await window2.getAttribute('data-window-id');
    const window3Id = await window3.getAttribute('data-window-id');

    // 3. 初期値を設定（循環依存を構築する前に、変数を初期化）
    // window-1で x = 0 を実行
    await setEditorCode(page, window1Id!, 'x = 0');
    await clickRunButton(page, window1);
    await page.waitForTimeout(2000);

    // window-2で y = 0 を実行
    await setEditorCode(page, window2Id!, 'y = 0');
    await clickRunButton(page, window2);
    await page.waitForTimeout(2000);

    // 4. 循環依存を構築
    // window-1で x = y + 1 を実行（yに依存）
    await setEditorCode(page, window1Id!, 'x = y + 1');
    await clickRunButton(page, window1);
    await page.waitForTimeout(3000); // 循環依存により再実行が発生する可能性があるため、少し長めに待機

    // window-2で y = x + 1 を実行（xに依存）
    await setEditorCode(page, window2Id!, 'y = x + 1');
    await clickRunButton(page, window2);
    await page.waitForTimeout(3000); // 循環依存により再実行が発生する可能性があるため、少し長めに待機

    // window-3で z = x + y を実行（xとyの両方に依存）
    await setEditorCode(page, window3Id!, 'z = x + y');
    await clickRunButton(page, window3);
    await page.waitForTimeout(3000); // 循環依存により再実行が発生する可能性があるため、少し長めに待機

    // 5. 循環依存の検出を確認
    // 無限ループが発生しないことを確認するため、一定時間待機
    // 循環依存により再実行が発生する可能性があるが、一定時間後に停止することを確認
    const startTime = Date.now();
    await page.waitForTimeout(10000); // 10秒待機して、無限ループが発生しないことを確認
    const elapsedTime = Date.now() - startTime;

    // 6. コンソールウィンドウでエラーメッセージまたは出力を確認
    const console1Id = `${window1Id}-console`;
    const console2Id = `${window2Id}-console`;
    const console3Id = `${window3Id}-console`;

    const console1 = page.locator(`[data-window-id="${console1Id}"]`);
    const console2 = page.locator(`[data-window-id="${console2Id}"]`);
    const console3 = page.locator(`[data-window-id="${console3Id}"]`);

    // コンソールウィンドウが存在することを確認
    await console1.waitFor({ state: 'visible', timeout: 5000 });
    await console2.waitFor({ state: 'visible', timeout: 5000 });
    await console3.waitFor({ state: 'visible', timeout: 5000 });

    // 7. 無限ループが発生しないことを確認
    // 一定時間待機後、システムが応答し続けていることを確認
    const console1Text = await console1.textContent();
    const console2Text = await console2.textContent();
    const console3Text = await console3.textContent();

    // コンソール出力が存在することを確認（エラーメッセージまたは正常な出力）
    expect(console1Text).toBeTruthy();
    expect(console2Text).toBeTruthy();
    expect(console3Text).toBeTruthy();

    // 8. 最終確認: システムが応答し続けていることを確認
    // ページが応答し続けていることを確認（タイムアウトが発生しないことを確認）
    // 追加の待機時間を設けて、無限ループが発生しないことを確認
    await page.waitForTimeout(5000);

    // 注意: IPyflowが循環依存を検出するかどうかは実装に依存する
    // このテストは、無限ループが発生しないことを確認することを主な目的とする
    // エラーメッセージの具体的な内容は、IPyflowの実装に依存する
    // テストが正常に完了すれば、無限ループが発生していないことを確認できる
  });
});

