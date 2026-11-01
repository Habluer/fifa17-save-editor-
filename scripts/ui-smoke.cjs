// Hidden test window with in-memory IPC doubles. Never writes to game saves.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { inspectSave } = require('../save-editor');
app.whenReady().then(async () => {
  let win;
  try {
    if (!process.env.FIFA17_TEST_SAVE) throw new Error('Defina FIFA17_TEST_SAVE para o teste visual.');
    const original = inspectSave(process.env.FIFA17_TEST_SAVE);
    let state = structuredClone(original), writes = 0, restores = 0;
    const backupPath = 'C:\\Tests\\FIFA 17\\settings\\fifa17-editor-backups\\CareerExample000000.backup-2000-01-01T00-00-00-000Z-11111111-2222-3333-4444-555555555555';
    for (const channel of ['select-save','reload-save','load-save']) ipcMain.handle(channel, () => state);
    let listing = null, folderSelections = 0;
    ipcMain.handle('list-saves', () => listing);
    ipcMain.handle('select-save-folder', () => { folderSelections++; listing = [{ ...state, key:'0' }]; return true; });
    ipcMain.handle('list-backups', () => [{ ...original, key:'0', backupPath:'backup-de-teste' }]);
    ipcMain.handle('save-changes', (_event,data) => {
      assert.equal(Object.hasOwn(data.values,'weight'),false);
      writes++; state = { ...state, values:{ ...state.values,...data.values }, saveName:'EDITADO TESTE' };
      return { state, saveName:state.saveName, backup:backupPath };
    });
    ipcMain.handle('restore-backup', () => { restores++; state = structuredClone(original); return { state,backup:backupPath }; });
    win = new BrowserWindow({ show:false, width:1000, height:760, titleBarStyle:'hidden', titleBarOverlay:{color:'#11151b',symbolColor:'#f3f4f6',height:32}, webPreferences:{ preload:path.join(__dirname,'../preload.js'), sandbox:true, contextIsolation:true, nodeIntegration:false, offscreen:true, backgroundThrottling:false } });
    const errors = [];
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message); });
    await win.loadFile(path.join(__dirname,'../index.html'));
    const js = code => win.webContents.executeJavaScript(code,true);
    async function until(expression) {
      const end = Date.now()+5000;
      while (!await js(expression)) { if (Date.now()>end) throw new Error(`Tempo excedido: ${expression}`); await new Promise(resolve=>setTimeout(resolve,25)); }
    }
    await js("document.querySelector('#folder-help button').click()");
    assert.equal(await js("getComputedStyle(document.getElementById('help-folder')).display"),'block');
    await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); document.getElementById('browse').click()");
    await until("!document.getElementById('browse').disabled");
    assert.equal(await js("document.getElementById('picker').open"),false,'Cancelar seleção de pasta não abre a lista');
    listing = [];
    await js("document.getElementById('browse').click()");
    await until("document.getElementById('picker').open && !document.getElementById('change-folder').disabled");
    assert.ok(await js("document.getElementById('picker-list').textContent.includes('Nenhuma carreira')"));
    await js("document.getElementById('change-folder').click()");
    await until("document.querySelector('.picker-item') !== null");
    assert.equal(folderSelections,1);
    await js("document.querySelector('.picker-item').click()");
    await until("!document.getElementById('editor').hidden && !document.getElementById('open').disabled");
    await js("document.getElementById('open').click()");
    await until("!document.getElementById('editor').hidden");
    assert.equal(await js("document.querySelectorAll('.indicator').length"),0);
    assert.equal(await js("document.body.textContent.includes('Experimental')"),false);
    const height = await js("document.getElementById('field-height').value");
    const potential = await js("document.getElementById('field-potential').value");
    const weight = await js("document.getElementById('field-weight').value");
    for (const group of ['Defesa','Técnica','Físico','Finalização','Mental','Progressão']) {
      await js(`document.getElementById('group').value=${JSON.stringify(group)}; document.getElementById('group').dispatchEvent(new Event('change'))`);
      assert.equal(await js("document.getElementById('field-height').closest('.field').hidden"),true);
      assert.equal(await js("document.getElementById('field-weight').closest('.field').hidden"),true);
    }
    await js("document.getElementById('group').value='Dados físicos'; document.getElementById('group').dispatchEvent(new Event('change'))");
    assert.equal(await js("document.getElementById('field-weight').closest('.field').hidden"),false);
    await js("document.getElementById('group').value=''; document.getElementById('group').dispatchEvent(new Event('change'))");
    await js("document.getElementById('max-all').click()");
    assert.equal(await js("document.getElementById('field-height').value"),height);
    assert.equal(await js("document.getElementById('field-weight').value"),weight);
    assert.equal(await js("document.getElementById('field-potential').value"),potential);
    assert.equal(writes,0);
    await js("document.getElementById('reset').click()");
    await js("document.getElementById('group').value='Defesa'; document.getElementById('group').dispatchEvent(new Event('change')); document.getElementById('select-group').click(); document.getElementById('max-selected').click(); document.getElementById('save').click()");
    await until("document.getElementById('review').open");
    assert.ok(await js("document.getElementById('review-list').children.length > 0"));
    assert.equal(writes,0);
    await js("document.getElementById('confirm-review').click()");
    await until("document.getElementById('status').textContent.startsWith('Aplicado.')");
    assert.equal(writes,1);
    assert.equal(await js("document.getElementById('status').textContent.includes('C:')"),false);
    assert.equal(await js("document.getElementById('show-status-details').hidden"),false);
    await js("document.getElementById('show-status-details').click()");
    assert.ok((await js("document.getElementById('status-details-text').textContent")).includes(backupPath));
    await js("document.getElementById('close-status-details').click()");
    await js("document.getElementById('backups').click()");
    await until("document.getElementById('picker').open");
    await js("document.querySelector('.picker-item').click(); document.getElementById('confirm-review').click()");
    await until("document.getElementById('status').textContent.startsWith('Backup restaurado.')");
    assert.equal(restores,1);
    assert.equal(await js("document.getElementById('status').textContent"),'Backup restaurado. Estado anterior preservado.');
    for (const [width,height] of [[520,460],[1600,1000]]) {
      win.setSize(width,height); await new Promise(resolve=>setTimeout(resolve,120));
      await js("document.getElementById('show-status-details').click()");
      assert.ok((await js("document.getElementById('status-details-text').textContent")).includes(backupPath));
      assert.ok(await js("document.getElementById('status-details').scrollWidth <= document.getElementById('status-details').clientWidth"),'Caminho não deve causar rolagem horizontal');
      await js("document.getElementById('close-status-details').click()");
    }
    await until("!document.getElementById('backups').disabled");
    assert.equal(await js("document.getElementById('field-marking').value"),String(original.values.marking));
    assert.equal(await js("document.querySelectorAll('dialog[open]').length"),0);
    assert.equal(await js("document.getElementById('changes-count').textContent"),'Sem alterações');
    await js("document.getElementById('group').value=''; document.getElementById('group').dispatchEvent(new Event('change'))");
    // Regression: the last help must stay above the sticky footer in small and large windows.
    for (const [width,height] of [[520,460],[1000,760],[1600,1000]]) {
      win.setSize(width,height); await new Promise(resolve=>setTimeout(resolve,150));
      await js("window.scrollTo(0,document.body.scrollHeight); document.querySelector('#help-volleys').parentElement.querySelector('button').click()");
      await new Promise(resolve=>setTimeout(resolve,80));
      const layout = await js("(() => { const tip=document.getElementById('help-volleys').getBoundingClientRect(), footer=document.querySelector('footer').getBoundingClientRect(); return {left:tip.left,right:tip.right,top:tip.top,bottom:tip.bottom,footer:footer.top,width:document.documentElement.clientWidth,visible:getComputedStyle(document.getElementById('help-volleys')).display!=='none'}; })()");
      assert.ok(layout.visible, 'A ajuda deve estar aberta');
      assert.ok(layout.bottom <= layout.footer - 4, `Ajuda sobre o rodapé em ${width}x${height}: ${JSON.stringify(layout)}`);
      assert.ok(layout.left >= 4 && layout.right <= layout.width-4 && layout.top >= 4,'Ajuda fora da janela');
      await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
      assert.equal(await js("getComputedStyle(document.getElementById('help-volleys')).display"),'none');
    }
    // Resize while open, then scroll the anchor out of view: no floating orphan help.
    await js("window.scrollTo(0,document.body.scrollHeight); document.querySelector('#help-volleys').parentElement.querySelector('button').focus()");
    win.setSize(1100,800); await new Promise(resolve=>setTimeout(resolve,150));
    assert.ok(await js("(() => { const tip=document.getElementById('help-volleys'), r=tip.getBoundingClientRect(); return getComputedStyle(tip).display==='none' || (r.top>=4 && r.bottom<=document.querySelector('footer').getBoundingClientRect().top-4 && r.left>=4 && r.right<=document.documentElement.clientWidth-4); })()"));
    await js("window.scrollTo(0,0)"); await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal(await js("getComputedStyle(document.getElementById('help-volleys')).display"),'none');
    const directory = path.resolve(__dirname,'../../ui-check'); fs.mkdirSync(directory,{recursive:true});
    await new Promise(resolve=>setTimeout(resolve,200));
    fs.writeFileSync(path.join(directory,'wide.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(520,640); await new Promise(resolve=>setTimeout(resolve,150));
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'),true);
    fs.writeFileSync(path.join(directory,'compact.png'),(await win.webContents.capturePage()).toPNG());
    assert.equal(errors.length,0, errors.join('\n'));
    console.log('UI: fluxos existentes e ajudas em 520x460, 1000x760 e 1600x1000, resize, scroll e Escape OK.');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); if(win)win.destroy(); app.exit(1); }
});
