const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { spawn } = require('child_process');
const http = require('http');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;
let flaskProcess = null;
let flaskPort = 8080;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Angular 18 application builder outputs to 'dist/<name>/browser'
    const indexPath = path.join(__dirname, '..', 'dist', 'jupyter-desktop', 'browser', 'index.html');
    mainWindow.loadFile(indexPath);
  }

  // メニューを設定
  createMenu();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:command', 'open');
            }
          }
        },
        {
          label: 'Save...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:command', 'save');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle DevTools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Reset Zoom' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Fullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About jupyter-desktop',
              message: 'jupyter-desktop',
              detail: `Version: ${app.getVersion()}\n\nA desktop application built with Angular, Electron, Three.js, and Monaco Editor.`
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC ハンドラー
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Notebook Files', extensions: ['ipynb'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const content = await fs.readFile(result.filePaths[0], 'utf-8');
      return { success: true, content, filePath: result.filePaths[0] };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: false, canceled: true };
});

ipcMain.handle('dialog:saveFile', async (event, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Notebook Files', extensions: ['ipynb'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: 'windows-config.ipynb'
  });

  if (!result.canceled && result.filePath) {
    try {
      await fs.writeFile(result.filePath, content, 'utf-8');
      return { success: true, filePath: result.filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  return { success: false, canceled: true };
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

ipcMain.handle('external:open', async (event, url) => {
  if (!url) {
    return false;
  }

  try {
    await shell.openExternal(url);
    return true;
  } catch (error) {
    console.error('Failed to open external link:', error);
    return false;
  }
});

ipcMain.handle('app:exit', () => {
  app.quit();
});

// Flaskプロセス管理機能
function getFlaskExecutablePath() {
  const platform = process.platform;
  const basePath = app.isPackaged 
    ? path.join(process.resourcesPath, 'flask-backend')
    : path.join(__dirname, '..', 'backend', 'dist');
  
  const executables = {
    'win32': 'app.exe',
    'darwin': 'app',
    'linux': 'app'
  };
  
  return path.join(basePath, executables[platform] || 'app.exe');
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.listen(port, '127.0.0.1', () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

async function findAvailablePort(startPort = 8080, maxPort = 8090) {
  for (let port = startPort; port <= maxPort; port++) {
    const available = await checkPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available port found between ${startPort} and ${maxPort}`);
}

function checkHealth(port, timeout = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    function poll() {
      const elapsed = Date.now() - startTime;
      if (elapsed > timeout) {
        resolve(false);
        return;
      }
      
      const req = http.get(`http://127.0.0.1:${port}/healthz`, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          setTimeout(poll, 500);
        }
      });
      
      req.on('error', () => {
        if (elapsed < timeout) {
          setTimeout(poll, 500);
        } else {
          resolve(false);
        }
      });
      
      req.setTimeout(2000, () => {
        req.destroy();
        if (elapsed < timeout) {
          setTimeout(poll, 500);
        } else {
          resolve(false);
        }
      });
    }
    
    poll();
  });
}

async function startFlask(retries = 3) {
  const exePath = getFlaskExecutablePath();
  
  // 実行ファイルの存在確認
  try {
    await fs.access(exePath);
  } catch (error) {
    console.error(`Flask executable not found at ${exePath}`);
    console.error('Please build the Flask app first: npm run build:backend');
    return false;
  }
  
  // ポートを検索
  try {
    flaskPort = await findAvailablePort(8080, 8090);
    console.log(`Starting Flask on port ${flaskPort}`);
  } catch (error) {
    console.error('Failed to find available port:', error.message);
    return false;
  }
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Flaskプロセスを起動
      const env = {
        ...process.env,
        PORT: flaskPort.toString(),
        HOST: '127.0.0.1',
        ENV: 'production'
      };
      
      flaskProcess = spawn(exePath, [], {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      });
      
      // プロセスのエラーハンドリング
      flaskProcess.on('error', (error) => {
        console.error('Failed to start Flask process:', error);
      });
      
      flaskProcess.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.error(`Flask process exited with code ${code}`);
        } else if (signal) {
          console.log(`Flask process killed with signal ${signal}`);
        }
        flaskProcess = null;
      });
      
      // 標準出力/エラー出力をログに記録（開発環境のみ）
      if (isDev) {
        flaskProcess.stdout.on('data', (data) => {
          console.log(`[Flask] ${data.toString().trim()}`);
        });
        
        flaskProcess.stderr.on('data', (data) => {
          console.error(`[Flask Error] ${data.toString().trim()}`);
        });
      }
      
      // ヘルスチェックを実行
      const isHealthy = await checkHealth(flaskPort, 10000);
      
      if (isHealthy) {
        console.log(`Flask started successfully on port ${flaskPort}`);
        return true;
      } else {
        console.warn(`Health check failed for Flask on port ${flaskPort} (attempt ${attempt}/${retries})`);
        
        // プロセスを終了
        if (flaskProcess) {
          try {
            flaskProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.error('Error killing Flask process:', error);
          }
          flaskProcess = null;
        }
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error(`Failed to start Flask (attempt ${attempt}/${retries}):`, error);
      
      if (flaskProcess) {
        try {
          flaskProcess.kill();
          flaskProcess = null;
        } catch (killError) {
          console.error('Error killing Flask process:', killError);
        }
      }
      
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  
  console.error('Failed to start Flask after all retries');
  return false;
}

function stopFlask() {
  if (flaskProcess) {
    console.log('Stopping Flask process...');
    try {
      // Windowsではkill()を使用、それ以外ではkill('SIGTERM')
      if (process.platform === 'win32') {
        flaskProcess.kill();
      } else {
        flaskProcess.kill('SIGTERM');
      }
      
      // 強制終了のタイムアウト
      setTimeout(() => {
        if (flaskProcess && !flaskProcess.killed) {
          console.warn('Force killing Flask process...');
          flaskProcess.kill('SIGKILL');
        }
      }, 5000);
      
      flaskProcess = null;
    } catch (error) {
      console.error('Error stopping Flask process:', error);
    }
  }
}

// アプリ終了時のクリーンアップ
app.on('before-quit', () => {
  stopFlask();
});

app.on('will-quit', () => {
  stopFlask();
});

app.whenReady().then(async () => {
  // 本番環境でのみFlaskを起動
  if (!isDev) {
    const flaskStarted = await startFlask();
    if (!flaskStarted) {
      console.error('Failed to start Flask backend. The app may not work correctly.');
    }
  }
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


