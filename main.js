const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { inspectSave, applySave, listBackups, restoreBackup } = require('./save-editor');
const { folderPreference } = require('./save-folder');
// ZIP distribution keeps its profile beside the executable, for removal in one folder.
if (app.isPackaged) {
  try {
    const data = path.join(path.dirname(app.getPath('exe')), 'data');
    fs.mkdirSync(data, { recursive:true });
    for (const [name, directory] of [['userData',data],['sessionData',path.join(data,'session')],['crashDumps',path.join(data,'crashes')]]) {
      fs.mkdirSync(directory, { recursive:true }); app.setPath(name,directory);
    }
    app.setAppLogsPath(path.join(data,'logs'));
  } catch {
    dialog.showErrorBox('Pasta sem permissão de gravação', 'Extraia o ZIP completo para uma pasta onde você possa gravar, como Downloads.');
    app.exit(1);
  }
}
const saveFolder = folderPreference(path.join(app.getPath('userData'), 'save-folder.json'));
let window, selected, catalog = [], backups = [], busy = false;
// A trava usa o perfil desta cópia do aplicativo; perfis em pastas diferentes
// não equivalem a um bloqueio global dos saves. O fingerprint protege o arquivo.
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
app.on('second-instance', () => { if (window) { if (window.isMinimized()) window.restore(); window.focus(); } });
const page = pathToFileURL(path.join(__dirname, 'index.html')).href;

function trusted(event) {
  // Autorize apenas o frame principal da nossa janela local, não qualquer IPC.
  if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) throw new Error('Origem não autorizada.');
}
function handle(name, fn) {
  // Serializa as operações assíncronas para evitar dois fluxos de gravação
  // concorrentes nesta instância, inclusive durante o seletor nativo.
  ipcMain.handle(name, async (event, data) => {
    trusted(event);
    if (busy) throw new Error('Aguarde a operação atual terminar.');
    busy = true;
    try { return await fn(data); } finally { busy = false; }
  });
}
async function requireGameClosed() {
  const running = await new Promise((resolve, reject) => execFile(path.join(process.env.SystemRoot || 'C:\\Windows','System32','tasklist.exe'), ['/FI', 'IMAGENAME eq FIFA17.exe', '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000 }, (error, stdout) => {
    if (error) return reject(new Error('Não foi possível verificar se o FIFA está fechado.'));
    resolve(stdout.toLowerCase().includes('fifa17.exe'));
  }));
  if (running) throw new Error('Feche completamente o FIFA 17 para aplicar ou restaurar.');
}
function choose(filePath) { selected = inspectSave(filePath); backups = []; return selected; }
// O caminho selecionado fica no processo principal. O renderer envia valores
// ou chaves da lista, nunca um caminho arbitrário para aplicar/restaurar.
function requireSelected() { if (!selected) throw new Error('Abra uma carreira primeiro.'); return selected; }

app.whenReady().then(() => {
  if (!primary) return;
  app.setAppUserModelId('local.fifa17.saveeditor');
  window = new BrowserWindow({ width: 1000, height: 760, minWidth: 520, minHeight: 460,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color:'#11151b', symbolColor:'#f3f4f6', height:32 },
    backgroundColor: '#11151b',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(window, { type:'question', buttons:['Continuar editando','Descartar e fechar'], defaultId:0, cancelId:0, message:'Há alterações ainda não aplicadas. Deseja fechar?' });
    if (choice === 1) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.loadFile(path.join(__dirname, 'index.html'));
});
app.on('window-all-closed', () => app.quit());

handle('select-save', async () => {
  const picked = await dialog.showOpenDialog(window, { properties: ['openFile'], defaultPath: path.join(app.getPath('documents'), 'FIFA 17', 'settings'), filters: [{ name: 'Save de carreira', extensions: ['*'] }] });
  if (picked.canceled) return null;
  return choose(picked.filePaths[0]);
});
async function selectSaveFolder() {
  const picked = await dialog.showOpenDialog(window, {
    title:'Selecionar pasta dos saves do FIFA 17', properties:['openDirectory'],
    defaultPath:saveFolder.usable() ? saveFolder.get() : path.join(app.getPath('documents'), 'FIFA 17', 'settings')
  });
  if (picked.canceled || !picked.filePaths.length) return false;
  saveFolder.set(picked.filePaths[0]); catalog = [];
  return true;
}
handle('select-save-folder', selectSaveFolder);
handle('list-saves', async () => {
  if (!saveFolder.usable() && !await selectSaveFolder()) return null;
  const directory = saveFolder.get();
  catalog = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^Career[^.]*$/i.test(entry.name)) continue;
    try { catalog.push(inspectSave(path.join(directory, entry.name))); } catch { /* Unsupported saves are not offered. */ }
  }
  catalog.sort((a,b) => b.modified.localeCompare(a.modified));
  return catalog.map((entry, index) => ({ ...entry, key: String(index) }));
});
handle('load-save', key => {
  if (typeof key !== 'string' || !/^\d+$/.test(key) || !catalog[Number(key)]) throw new Error('Carreira não encontrada. Atualize a lista.');
  return choose(catalog[Number(key)].filePath);
});
handle('reload-save', () => choose(requireSelected().filePath));
handle('save-changes', async data => {
  const current = requireSelected();
  await requireGameClosed();
  const result = applySave(current.filePath, data?.values, current.fingerprint);
  return { ...result, state: choose(current.filePath) };
});
handle('list-backups', () => {
  backups = listBackups(requireSelected().filePath);
  return backups.map((entry, index) => ({ ...entry, key: String(index) }));
});
handle('restore-backup', async key => {
  const current = requireSelected();
  if (typeof key !== 'string' || !/^\d+$/.test(key) || !backups[Number(key)]) throw new Error('Backup não encontrado. Atualize a lista.');
  const entry = backups[Number(key)];
  await requireGameClosed();
  const result = restoreBackup(current.filePath, entry.backupPath, current.fingerprint, entry.fingerprint);
  return { ...result, state: choose(current.filePath) };
});
