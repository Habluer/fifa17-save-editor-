const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectSave, patchSave } = require('../save-editor');
const source = process.env.FIFA17_TEST_SAVE;

for (const encoding of ['utf8', 'latin1']) {
  test(`nome acentuado ${encoding} é exibido corretamente e preservado ao editar`, { skip: !source }, () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa17-name-'));
    try {
      const input = path.join(directory, 'Career-test');
      const bytes = fs.readFileSync(source);
      // A short synthetic title fits in the known title allocation of the fixture.
      const end = bytes.indexOf(0, 18);
      const title = Buffer.from('Carreira - José', encoding);
      assert.ok(title.length <= end - 18);
      bytes.fill(0,18,end + 1); title.copy(bytes,18);
      fs.writeFileSync(input,bytes);
      assert.equal(inspectSave(input).saveName,'Carreira - José');
      const result = patchSave(input,{ agility:90 });
      assert.equal(inspectSave(result.edited).saveName,'EDITADO José');
      assert.deepEqual(fs.readFileSync(input),bytes);
      const edited = fs.readFileSync(result.edited);
      assert.deepEqual(edited.subarray(18,18 + Buffer.byteLength('EDITADO José',encoding)),Buffer.from('EDITADO José',encoding));
    } finally { fs.rmSync(directory,{ recursive:true, force:true }); }
  });
}
