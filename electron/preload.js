const { contextBridge, ipcRenderer } = require('electron');

// Renderer プロセスに安全な API を公開
contextBridge.exposeInMainWorld('electronAPI', {
  // ファイルダイアログを開いてファイルを読み込む
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  
  // ファイルダイアログを開いてファイルを保存
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  
  // アプリ情報取得
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),

  // アプリ終了
  exitApp: () => ipcRenderer.invoke('app:exit'),

  // 既定ブラウザで外部リンクを開く
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  
  // イベントリスナー
  onMenuCommand: (callback) => {
    ipcRenderer.on('menu:command', (event, command) => callback(command));
  },
});

