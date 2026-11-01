const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

test('app distribuído direciona perfil e cache para data antes de abrir preferências', () => {
  const directory = path.join(os.tmpdir(),'profile-test-app');
  const paths = {exe:path.join(directory,'FIFA17 Career Editor.exe'),userData:'old-profile'};
  const created = []; let config;
  const app = {
    isPackaged:true, getPath:key=>paths[key], setPath:(key,value)=>{paths[key]=value;},
    setAppLogsPath:value=>{paths.logs=value;}, requestSingleInstanceLock:()=>true,
    on:()=>{}, whenReady:()=>({then:()=>{}})
  };
  const realRequire = require;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../main.js'),'utf8'), {
    __dirname:path.join(directory,'resources','app.asar'),
    require:name => {
      if(name==='electron') return {app,dialog:{},ipcMain:{handle:()=>{}}};
      if(name==='node:fs') return {mkdirSync:value=>created.push(value)};
      if(name==='./save-editor') return {};
      if(name==='./save-folder') return {folderPreference:file=>{config=file; return {};}};
      return realRequire(name);
    }
  });
  const data = path.join(directory,'data');
  assert.equal(paths.userData,data);
  assert.equal(paths.sessionData,path.join(data,'session'));
  assert.equal(paths.crashDumps,path.join(data,'crashes'));
  assert.equal(paths.logs,path.join(data,'logs'));
  assert.equal(config,path.join(data,'save-folder.json'));
  assert.ok(created.every(value=>value===data || value.startsWith(data+path.sep)));
});
