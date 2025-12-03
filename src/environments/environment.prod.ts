export const environment = {
  production: true,
  debug: false,
  // backend (Tornado + JSP) のURL
  // binder環境では空文字列を使用することで、JupyterLabが自動的に現在のオリジンを検出
  pythonBackendUrl: '',  // REST API用（空文字列で現在のオリジンを自動検出）
  pythonBackendWsUrl: '',  // WebSocket用（空文字列で現在のオリジンを自動検出）
  firebaseConfig: undefined as Record<string, string> | undefined,
};


