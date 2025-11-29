<!-- 821d19ce-6b1a-467f-9ee9-42e12aa96772 08ed9cbb-f762-4b08-b551-cef22f48db96 -->
# @jupyterlab/services 完全置き換え計画

## 概要

現在のフロントエンドは、`PythonRuntimeService` で直接 WebSocket と REST API を使って Jupyter サーバーと通信しています。これを完全に `@jupyterlab/services` パッケージを使用した実装に置き換えます。後方互換性は考慮せず、既存の実装を完全に作り直します。

## 実装方針

- `@jupyterlab/services` の標準 API を使用
- `ServiceManager`, `SessionManager`, `KernelConnection` を直接使用
- 既存のカスタム実装（WebSocket、JSP メッセージ処理など）を削除
- `ExecutionService` と `OutputService` を `@jupyterlab/services` のメッセージ形式に合わせて更新

## 実装手順

### 1. パッケージのインストール

`package.json` に `@jupyterlab/services` を追加します。

### 2. PythonRuntimeService の完全書き直し

`src/app/services/python-runtime/python-runtime.service.ts` を完全に書き直し：

- `ServiceManager` を使用して Jupyter サーバーとの通信を管理
- `SessionManager` を使用してセッションの作成・管理
- `KernelConnection` を使用してカーネルとの通信（メッセージ送受信）
- `@jupyterlab/services` の標準メッセージ形式（`IMessage`）を使用
- 新しい公開 API：
- `message$: Observable<{ event: string; message: IMessage }>` - `@jupyterlab/services` の `IMessage` 形式
- `initializeForEditor(editorId: string): Promise<void>`
- `sendExecuteRequest(code: string, options?: IExecuteRequestMsg['content']): void`
- `sendInterruptRequest(): void`
- `isReady(): boolean`
- `restartKernel(): Promise<void>`
- `resetSession(): Promise<void>`
- `dispose(): void`

### 3. ExecutionService の更新

`src/app/services/python-runtime/execution.service.ts` を更新：

- `@jupyterlab/services` のメッセージ形式（`IMessage`）に対応
- `PythonRuntimeService` の新しい API に合わせて更新
- メッセージハンドリングを `@jupyterlab/services` の標準形式に変更

### 4. OutputService の更新

`src/app/services/python-runtime/output.service.ts` を更新：

- `@jupyterlab/services` のメッセージ形式（`IMessage`）に対応
- `PythonRuntimeService` の新しい API に合わせて更新
- メッセージハンドリングを `@jupyterlab/services` の標準形式に変更

### 5. 不要ファイルの削除

- `src/app/services/python-runtime/jsp-message.util.ts` - `@jupyterlab/services` が標準形式を提供するため不要

### 6. 環境設定の更新

`src/environments/environment.ts` を `@jupyterlab/services` の `ServerConnection.makeSettings()` で使用できる形式に更新。

### 7. テストと動作確認

- 既存のテストを更新して動作確認
- カーネル作成・セッション作成・コード実行が正常に動作することを確認
- WebSocket 通信が正常に動作することを確認

## 主な変更ファイル

- `package.json` - `@jupyterlab/services` の追加
- `src/app/services/python-runtime/python-runtime.service.ts` - 完全に書き直し
- `src/app/services/python-runtime/execution.service.ts` - `@jupyterlab/services` 形式に対応
- `src/app/services/python-runtime/output.service.ts` - `@jupyterlab/services` 形式に対応
- `src/app/services/python-runtime/jsp-message.util.ts` - 削除
- `src/environments/environment.ts` - `@jupyterlab/services` 形式に対応

## 注意事項

- `@jupyterlab/services` は Jupyter Server Protocol (JSP) の標準実装を使用するため、メッセージ形式が異なります
- `IMessage` インターフェースを使用し、`header`, `parent_header`, `content`, `metadata`, `buffers` の標準形式に従います
- カーネルメッセージの購読は `kernel.iopubMessage.connect()` や `kernel.anyMessage.connect()` を使用します

### To-dos

- [ ] package.json に @jupyterlab/services を追加
- [ ] PythonRuntimeService を @jupyterlab/services を使用するようにリファクタリング（既存APIを維持）
- [ ] 環境設定を @jupyterlab/services の ServerConnection で使用できる形式に確認・調整
- [ ] 既存のテストと統合テストを実行して動作確認