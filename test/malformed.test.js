const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectSave } = require('../save-editor');
test('ID com tipo e profundidade inválidos é rejeitado antes da leitura de bits', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'fifa-id-'));
  try {
    const bytes = Buffer.alloc(2048), start = 1500;
    Buffer.from([68,66,0,8,0,0,0,0]).copy(bytes,start);
    bytes.writeUInt32LE(164,start+8); bytes.writeUInt32LE(2,start+16);
    for (const [index,name] of ['bxis','CZUM'].entries()) {
      bytes.write(name,start+24+index*8); bytes.writeUInt32LE(index*60,start+28+index*8);
      const table = start+44+index*60;
      bytes.writeUInt32LE(4,table+4); bytes.writeUInt16LE(1,table+18); bytes[table+24]=1;
      bytes.writeUInt32LE(0,table+36); bytes.write('ykFq',table+44); bytes.writeUInt32LE(256,table+48);
    }
    const input = path.join(directory,'invalid'); fs.writeFileSync(input,bytes);
    assert.throws(()=>inspectSave(input),/ID.*inválido/);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
test('tamanho zero, banco truncado e diretório gigante são rejeitados', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-malformed-'));
  try {
    const input = path.join(directory,'invalid');
    for (const [size, tables] of [[0,0],[9999999,0],[100,0xffffffff]]) {
      const bytes = Buffer.alloc(2048);
      Buffer.from([68,66,0,8,0,0,0,0]).copy(bytes,1500);
      bytes.writeUInt32LE(size,1508); bytes.writeUInt32LE(tables,1516);
      fs.writeFileSync(input,bytes);
      assert.throws(() => inspectSave(input), /inválido/);
      assert.deepEqual(fs.readFileSync(input),bytes);
    }
    fs.writeFileSync(input,Buffer.alloc(10)); assert.throws(() => inspectSave(input), /inválido/);
  } finally { fs.rmSync(directory,{ recursive:true, force:true }); }
});
