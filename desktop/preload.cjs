const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('agentTerminal', {
  postMessage: message => ipcRenderer.send('agent-terminal:message', message),
  onMessage: callback => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('agent-terminal:event', listener);
    return () => ipcRenderer.removeListener('agent-terminal:event', listener);
  }
});
