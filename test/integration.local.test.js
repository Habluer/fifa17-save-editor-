const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectSave, patchSave, applySave, crcErrors, listBackups, restoreBackup } = require('../save-editor');

const source = process.env.FIFA17_TEST_SAVE;
test('campo estreito demais é recusado antes de criar backup', {skip:!source}, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'fifa-depth-'));
  t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  const input = path.join(directory,'Career-test'), bytes=fs.readFileSync(source);
  const { databaseCrc } = require('../save-editor');
  const signature=Buffer.from([68,66,0,8,0,0,0,0]); let mutated=false;
  for(let at=bytes.indexOf(signature);at>=0;) {
    const size=bytes.readUInt32LE(at+8), db=bytes.subarray(at,at+size);
    const count=db.readUInt32LE(16), base=28+count*8;
    const offsets=Array.from({length:count},(_,i)=>db.readUInt32LE(28+i*8)).sort((a,b)=>a-b);
    for(let i=0;i<offsets.length;i++) {
      const start=base+offsets[i], end=i+1<offsets.length?base+offsets[i+1]:size;
      for(let j=0;j<db[start+24];j++) {
        const p=start+36+j*16;
        if(db.subarray(p+8,p+12).toString()==='RRQB') {db.writeUInt32LE(1,p+12); mutated=true;}
      }
      db.writeUInt32LE(databaseCrc(db.subarray(start+36,end-4)),end-4);
    }
    at=bytes.indexOf(signature,at+size);
  }
  assert.equal(mutated,true); fs.writeFileSync(input,bytes);
  assert.throws(()=>applySave(input,{agility:99}),/representável/);
  assert.deepEqual(fs.readFileSync(input),bytes);
  assert.deepEqual(fs.readdirSync(directory),['Career-test']);
});

test('restauração é exata e preserva o estado editado em outro backup', { skip: !source }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-restore-'));
  try {
    const input = path.join(directory, 'Career-test'); fs.copyFileSync(source, input);
    const original = fs.readFileSync(input), state = inspectSave(input);
    const applied = applySave(input, { agility:90 }, state.fingerprint);
    const edited = fs.readFileSync(input);
    const entry = listBackups(input).find(item => item.backupPath === applied.backup);
    const result = restoreBackup(input, entry.backupPath, inspectSave(input).fingerprint, entry.fingerprint);
    assert.deepEqual(fs.readFileSync(input), original);
    assert.deepEqual(fs.readFileSync(result.backup), edited);
    assert.throws(() => restoreBackup(input, path.join(directory,'unrelated')), /não pertence/);
  } finally { fs.rmSync(directory, { recursive:true, force:true }); }
});

test('save alterado após abertura não é sobrescrito', { skip: !source }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-stale-'));
  try {
    const input = path.join(directory, 'Career-test'); fs.copyFileSync(source, input);
    const old = inspectSave(input);
    applySave(input, { agility:90 }, old.fingerprint);
    const newer = fs.readFileSync(input);
    assert.throws(() => applySave(input, { agility:80 }, old.fingerprint), /mudou desde/);
    assert.deepEqual(fs.readFileSync(input), newer);
  } finally { fs.rmSync(directory, { recursive:true, force:true }); }
});

test('restaura o original se a troca do temporário falhar', { skip: !source }, (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-rollback-'));
  try {
    const input = path.join(directory, 'Career-test');
    fs.copyFileSync(source, input);
    const original = fs.readFileSync(input);
    const rename = fs.renameSync;
    const mock = t.mock.method(fs, 'renameSync', (from, to) => {
      if (from.includes('.tmp-')) throw new Error('falha simulada na troca');
      return rename(from, to);
    });
    assert.throws(() => applySave(input, { agility: 90 }), /falha simulada/);
    mock.mock.restore();
    assert.deepEqual(fs.readFileSync(input), original);
    const backups = fs.readdirSync(path.join(directory, 'fifa17-editor-backups'));
    assert.equal(backups.length, 1);
    assert.deepEqual(fs.readFileSync(path.join(directory, 'fifa17-editor-backups', backups[0])), original);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('recusa atributos fora de 1–99 sem modificar o save', { skip: !source }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-limits-'));
  try {
    const input = path.join(directory, 'Career-test');
    fs.copyFileSync(source, input);
    const original = fs.readFileSync(input);
    for (const value of [0, 100, 255, 1.5]) assert.throws(() => applySave(input, { agility: value }), /entre 1 e 99/);
    assert.deepEqual(fs.readFileSync(input), original);
    assert.deepEqual(fs.readdirSync(directory), ['Career-test']);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('altura experimental atualiza registro físico e campo binário da tabela', { skip: !source }, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-height-'));
  try {
    const input = path.join(directory, 'Career-test');
    fs.copyFileSync(source, input);
    const original = fs.readFileSync(input);
    const first = patchSave(input, { height: 180 });
    const second = patchSave(input, { height: 165 });
    const a = fs.readFileSync(first.edited), b = fs.readFileSync(second.edited);
    assert.equal(a.readUInt32LE(1406), 180);
    assert.equal(b.readUInt32LE(1406), 165);
    assert.equal(inspectSave(first.edited).values.height, 180);
    assert.deepEqual(fs.readFileSync(input), original);
    // There must also be a changed database byte, not only the physical header.
    assert.ok(a.subarray(211126).some((byte, index) => byte !== b[211126 + index]));
    const invalid = Buffer.from(original);
    invalid.writeUInt32LE(0, 1390);
    fs.writeFileSync(input, invalid);
    assert.throws(() => patchSave(input, { height: 180 }), /Registro físico/);
    assert.deepEqual(fs.readFileSync(input), invalid);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('preserva o save original e produz uma cópia com CRCs válidos', { skip: !source }, () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-save-editor-'));
  const testSave = path.join(tempDirectory, 'Career-test');
  fs.copyFileSync(source, testSave);
  const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(testSave)).digest('hex');
  const before = inspectSave(testSave);
  const changedAgility = before.values.agility === 86 ? 87 : 86;
  const result = patchSave(testSave, { agility: changedAgility });
  const sections = []; const bytes = fs.readFileSync(result.edited); const signature = Buffer.from([0x44, 0x42, 0, 8, 0, 0, 0, 0]);
  for (let offset = bytes.indexOf(signature); offset >= 0;) { const size = bytes.readUInt32LE(offset + 8); sections.push({ start: offset, end: offset + size }); offset = bytes.indexOf(signature, offset + size); }
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(testSave)).digest('hex'), sourceHash);
  assert.equal(inspectSave(result.edited).values.agility, changedAgility);
  assert.deepEqual(crcErrors(bytes, sections), []);
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

test('aplica a alteração no nome reconhecido pelo jogo e mantém backup restaurável', { skip: !source }, () => {
  const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-save-editor-apply-'));
  const testSave = path.join(tempDirectory, 'Career-test');
  fs.copyFileSync(source, testSave);
  const original = fs.readFileSync(testSave);
  const before = inspectSave(testSave);
  const changedAgility = before.values.agility === 86 ? 87 : 86;
  const result = applySave(testSave, { agility: changedAgility });
  assert.equal(result.filePath, testSave);
  assert.match(result.saveName, /^EDITADO/);
  assert.equal(inspectSave(testSave).saveName, result.saveName);
  assert.equal(inspectSave(testSave).values.agility, changedAgility);
  assert.deepEqual(fs.readFileSync(result.backup), original);
  assert.equal(fs.existsSync(`${testSave}.tmp`), false);
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});
