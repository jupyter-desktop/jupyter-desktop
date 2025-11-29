export const environment = {
  production: true,
  debug: false,
  // backend (Tornado + JSP) のURL
  pythonBackendUrl: 'http://localhost:8888',  // REST API用
  pythonBackendWsUrl: 'ws://localhost:8888',  // WebSocket用
  firebaseConfig: undefined as Record<string, string> | undefined,
};


