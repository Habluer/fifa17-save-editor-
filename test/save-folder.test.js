const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { folderPreference } = require('../save-folder');

test('pasta escolhida persiste e pasta removida exige nova escolha', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa-folder-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const config = path.join(root, 'config', 'save-folder.json');
  const folder = path.join(root, 'saves'); fs.mkdirSync(folder);
  const preference = folderPreference(config);
  assert.equal(preference.get(), null);
  assert.equal(preference.usable(), false);
  preference.set(folder);
  const reopened = folderPreference(config);
  assert.equal(reopened.get(), folder);
  assert.equal(reopened.usable(), true);
  assert.throws(() => reopened.set('relative-folder'));
  assert.equal(reopened.get(), folder);
  fs.rmdirSync(folder);
  assert.equal(reopened.usable(), false);
});

test('configuração inválida não impede a abertura', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fifa-folder-'));
  t.after(() => fs.rmSync(root, { recursive:true, force:true }));
  const config = path.join(root, 'save-folder.json');
  for (const content of ['{', '{"saveFolder":17}', '{"saveFolder":"relative"}', 'x'.repeat(16385)]) {
    fs.writeFileSync(config, content);
    assert.equal(folderPreference(config).get(), null);
  }
});
