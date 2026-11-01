const test = require('node:test');
const assert = require('node:assert/strict');
const { bulkEdit, bulkKeys } = require('../attributes');
test('maximização nunca altera dimensões ou potencial', () => {
  const values = Object.fromEntries(bulkKeys.map(key => [key, 50]));
  Object.assign(values, { height: 178, weight: 63, potential: 88 });
  const result = bulkEdit(values, Object.keys(values), 'max');
  for (const key of bulkKeys) assert.equal(result[key],99);
  assert.equal(result.height,178); assert.equal(result.weight,63); assert.equal(result.potential,88);
  assert.equal(values.agility,50);
});
test('lote altera apenas selecionados e respeita 1–99', () => {
  assert.deepEqual(bulkEdit({ agility:95, stamina:90 }, ['agility'], 'add', 10), { agility:99, stamina:90 });
  assert.deepEqual(bulkEdit({ agility:5 }, ['agility'], 'add', -10), { agility:1 });
  assert.throws(() => bulkEdit({ agility:5 }, ['agility'], 'set', 0), /inteiro/);
  assert.throws(() => bulkEdit({ agility:5 }, ['agility'], 'set', 1.5), /inteiro/);
});
