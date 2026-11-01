const { contextBridge, ipcRenderer } = require('electron');
// Ponte de capacidades limitada: a página não recebe fs, ipcRenderer ou Node.
contextBridge.exposeInMainWorld('fifaEditor', {
  selectSave: () => ipcRenderer.invoke('select-save'),
  listSaves: () => ipcRenderer.invoke('list-saves'),
  selectSaveFolder: () => ipcRenderer.invoke('select-save-folder'),
  loadSave: key => ipcRenderer.invoke('load-save', key),
  reloadSave: () => ipcRenderer.invoke('reload-save'),
  saveChanges: data => ipcRenderer.invoke('save-changes', data),
  listBackups: () => ipcRenderer.invoke('list-backups'),
  restoreBackup: key => ipcRenderer.invoke('restore-backup', key)
});
