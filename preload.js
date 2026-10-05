const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getData: () => ipcRenderer.invoke('data:get'),
  setData: (data) => ipcRenderer.invoke('data:set', data),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  exportBackup: (data) => ipcRenderer.invoke('backup:export', data),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  exportCSV: (csv) => ipcRenderer.invoke('csv:export', csv)
});
