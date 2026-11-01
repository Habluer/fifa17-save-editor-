const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseCrc, patchSave, applySave, markEditedName } = require('../save-editor');

test('calcula CRC-32/MPEG-2 conhecido', () => {
  assert.equal(databaseCrc(Buffer.from('123456789')), 0x0376e6e7);
});

test('CRC equivale à implementação bit a bit para entradas determinísticas', () => {
  function reference(bytes) {
    let crc=0xffffffff;
    for(const byte of bytes) { crc^=byte<<24; for(let bit=0;bit<8;bit++) crc=(crc&0x80000000)?((crc<<1)^0x04c11db7)>>>0:(crc<<1)>>>0; }
    return crc>>>0;
  }
  let seed=123456;
  for(const length of [0,1,2,7,255,256,1024,65536]) {
    const bytes=Buffer.alloc(length);
    for(let i=0;i<length;i++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; bytes[i]=seed>>>24; }
    assert.equal(databaseCrc(bytes),reference(bytes));
  }
});

test('marca título sem ultrapassar o espaço existente nem duplicar prefixo', () => {
  const bytes = Buffer.alloc(200, 0xab);
  bytes.write('FBCHUNKS');
  bytes.write('Carreira - TESTE167\0', 18, 'latin1');
  const afterTitle = Buffer.from(bytes.subarray(37));
  assert.equal(markEditedName(bytes), 'EDITADO TESTE167');
  assert.deepEqual(bytes.subarray(37), afterTitle);
  assert.equal(markEditedName(bytes), 'EDITADO TESTE167');
});

test('recusa nomes sem espaço suficiente', () => {
  const bytes = Buffer.alloc(200, 0xab);
  bytes.write('FBCHUNKS');
  bytes.write('ABC\0', 18, 'latin1');
  const before = Buffer.from(bytes);
  assert.throws(() => markEditedName(bytes), /espaço seguro/);
  assert.deepEqual(bytes, before);
});

for (const encoding of ['utf8','latin1']) {
  test(`prefixo EDITADO preserva acentos e bytes ${encoding}`, () => {
    const bytes = Buffer.alloc(200,0xab);
    bytes.write('FBCHUNKS');
    const title = Buffer.from('Carreira - José',encoding);
    title.copy(bytes,18); bytes[18+title.length] = 0;
    const reserved = Buffer.from(bytes.subarray(19+title.length));
    assert.equal(markEditedName(bytes),'EDITADO José');
    const expected = Buffer.from('EDITADO José',encoding);
    assert.deepEqual(bytes.subarray(18,18+expected.length),expected);
    assert.deepEqual(bytes.subarray(19+title.length),reserved);
    assert.equal(markEditedName(bytes),'EDITADO José');
  });
}

test('abrevia título UTF-8 por bytes sem cortar caracteres multibyte', () => {
  const bytes = Buffer.alloc(200,0xab);
  bytes.write('FBCHUNKS');
  const title = Buffer.from('éééééééé','utf8');
  title.copy(bytes,18); bytes[18+title.length] = 0;
  assert.equal(markEditedName(bytes),'EDITADO éééé');
  assert.equal(bytes[18+title.length],0);
  assert.equal(bytes[19+title.length],0xab);
  assert.equal(require('node:buffer').isUtf8(bytes.subarray(18,18+title.length)),true);
});

test('peso exige um arquivo válido antes de qualquer gravação', () => {
  for (const write of [patchSave, applySave]) {
    for (const field of ['weight']) {
      assert.throws(() => write('arquivo-inexistente', { [field]: 80 }), /ENOENT/);
    }
  }
});
