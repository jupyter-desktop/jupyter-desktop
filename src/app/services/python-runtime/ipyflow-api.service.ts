import { Injectable, inject } from '@angular/core';
import { ExecutionService } from './execution.service';

/**
 * IpyflowApiService
 * 
 * 【役割】
 * - IPyflowのPython APIを使用して依存関係を取得
 * - 変数の依存関係を追跡
 * - 再実行が必要なウィンドウを判定
 * 
 * 【実装方針】
 * - Pythonコードを実行して `from ipyflow import deps, users` を使用
 * - 実行結果をパースして依存関係を取得
 * - 注意: IPyflow APIは、セルID（`cellId`）を使って各実行を識別するため、
 *   `cellId` が正しく設定されている必要がある
 */

@Injectable({
  providedIn: 'root'
})
export class IpyflowApiService {
  private readonly executionService = inject(ExecutionService);

  /**
   * シンボルの依存関係を取得
   * 
   * @param symbolName シンボル名（例: 'x'）
   * @returns 依存しているシンボルのリスト（セルIDのリスト）
   */
  async getDependencies(symbolName: string): Promise<string[]> {
    try {
      // IPyflowの `deps` APIを使用して依存関係を取得
      // 注意: セルIDは実行時にメタデータから取得されるため、
      // このメソッドを呼び出す前に、該当シンボルが定義されているセルが実行されている必要がある
      const code = `
from ipyflow import deps
import json

try:
    deps_list = deps('${symbolName}')
    # deps_listはSymbolオブジェクトのリスト
    # 各Symbolオブジェクトからcell_idを取得
    cell_ids = [str(symbol.cell_id) for symbol in deps_list if hasattr(symbol, 'cell_id')]
    print(json.dumps(cell_ids))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

      const result = await this.executionService.runPython(code);
      
      // 実行結果から出力を取得（簡易版: 実際の実装ではOutputServiceから取得する必要がある）
      // 注意: この実装は簡易版のため、実際の出力取得は後で改善する必要がある
      console.log('[IpyflowApiService] getDependencies result:', result);
      
      // TODO: 実際の出力を取得してパースする
      // 現時点では空配列を返す（実装を段階的に進める）
      return [];
    } catch (error) {
      console.error('[IpyflowApiService] getDependencies error:', error);
      return [];
    }
  }

  /**
   * シンボルを使用しているセル（ウィンドウ）を取得
   * 
   * @param symbolName シンボル名（例: 'x'）
   * @returns シンボルを使用しているセルIDのリスト（ウィンドウIDのリスト）
   */
  async getUsers(symbolName: string): Promise<string[]> {
    try {
      // IPyflowの `users` APIを使用して、シンボルを使用しているセルを取得
      const code = `
from ipyflow import users
import json

try:
    users_list = users('${symbolName}')
    # users_listはSymbolオブジェクトのリスト
    # 各Symbolオブジェクトからcell_idを取得
    cell_ids = [str(symbol.cell_id) for symbol in users_list if hasattr(symbol, 'cell_id')]
    print(json.dumps(cell_ids))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

      const result = await this.executionService.runPython(code);
      
      // 実行結果から出力を取得（簡易版: 実際の実装ではOutputServiceから取得する必要がある）
      console.log('[IpyflowApiService] getUsers result:', result);
      
      // TODO: 実際の出力を取得してパースする
      // 現時点では空配列を返す（実装を段階的に進める）
      return [];
    } catch (error) {
      console.error('[IpyflowApiService] getUsers error:', error);
      return [];
    }
  }

  /**
   * 変数が変更された際に、依存するウィンドウを取得
   * 
   * @param symbolName シンボル名（例: 'x'）
   * @returns 影響を受けるウィンドウIDのリスト
   */
  async getAffectedWindows(symbolName: string): Promise<string[]> {
    // getUsersと同じ実装（将来的に拡張可能）
    return this.getUsers(symbolName);
  }
}

