const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadDatabase:       ()      => ipcRenderer.invoke('db:get'),
  saveDatabase:       (b64)   => ipcRenderer.invoke('db:save', b64),
  chooseFolder:       ()      => ipcRenderer.invoke('db:choose-folder'),
  getStorageInfo:     ()      => ipcRenderer.invoke('db:info'),
  chooseInitialFolder: ()     => ipcRenderer.invoke('app:choose-initial-folder'),
  restoreDatabase:     ()     => ipcRenderer.invoke('db:restore'),
});
