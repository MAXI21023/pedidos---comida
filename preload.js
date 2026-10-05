const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopAPI', {
  getData: () => ipcRenderer.invoke('data:get'),
  setData: (data) => ipcRenderer.invoke('data:set', data),
  notify: (title, body) => ipcRenderer.invoke('notify', { title, body }),
  printVoucher: (html) => ipcRenderer.invoke('print:voucher', html),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  exportBackup: (data) => ipcRenderer.invoke('backup:export', data),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  exportCSV: (csv) => ipcRenderer.invoke('csv:export', csv),
  serverRequest: (request) => ipcRenderer.invoke('server:request', request)
});
