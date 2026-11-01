const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isUtf8 } = require('node:buffer');
const MAX_FILE_BYTES = 64 * 1024 * 1024;
// Este módulo não depende do Electron: recebe caminhos/valores e devolve dados.
// A interface nunca deve gravar bytes diretamente; use applySave/restoreBackup.
function fingerprint(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function readBounded(filePath) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FILE_BYTES || stat.size < 1414) throw new Error('Save inválido ou tamanho não suportado.');
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('Arquivo cresceu durante a leitura.');
  return bytes;
}

const DB_HEADER = Buffer.from([0x44, 0x42, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]);
const ALLOWED = ['acceleration', 'sprintspeed', 'agility', 'balance', 'jumping', 'stamina', 'strength', 'reactions', 'aggression', 'interceptions', 'positioning', 'vision', 'penalties', 'composure', 'crossing', 'freekickaccuracy', 'shortpassing', 'longpassing', 'curve', 'dribbling', 'ballcontrol', 'finishing', 'headingaccuracy', 'shotpower', 'longshots', 'volleys', 'standingtackle', 'slidingtackle', 'marking', 'height', 'weight', 'potential'];
// Dicionário do FIFA 17: identificador binário -> [nome legível, base do valor].
// A base é somada na leitura e subtraída na escrita; não é o limite da UI.
const FIELD_MAP = {
  ykFq: ['playerid', 0], nEbM: ['dribbling', 1], ohpV: ['shotpower', 1], onkY: ['balance', 1], wxMq: ['marking', 1], AGsE: ['penalties', 1], Dydz: ['volleys', 1], PhuM: ['slidingtackle', 1], URGo: ['jumping', 1], aReg: ['headingaccuracy', 1], iTce: ['aggression', 1], kerE: ['longpassing', 1], mpuH: ['potential', 1], sNZW: ['weight', 30], YFaA: ['curve', 1], nmgT: ['strength', 1], vObb: ['shortpassing', 1], wWzG: ['interceptions', 1], xJZL: ['finishing', 1], NrcP: ['sprintspeed', 1], SPge: ['acceleration', 1], XjDq: ['stamina', 1], YCnI: ['reactions', 1], wGOH: ['crossing', 1], ypBQ: ['height', 130], CsBG: ['longshots', 1], CsyD: ['standingtackle', 1], RRQB: ['agility', 1], VgKc: ['freekickaccuracy', 1], XsFD: ['positioning', 1], ZoOK: ['vision', 1], jlQJ: ['composure', 1], MgwU: ['ballcontrol', 1]
};
const KNOWN_TABLES = { CZUM: { name: 'players', fields: Object.fromEntries(Object.entries(FIELD_MAP).map(([short, [name, low]]) => [short, { name, low }])) }, bxis: { name: 'career_playasplayer', fields: { ykFq: { name: 'playerid', low: -1 } } } };
function dbSections(buffer) {
  // Cada banco informa o próprio tamanho. Os offsets de tabela são relativos
  // ao fim do diretório, não ao início do arquivo. Valide antes de ler campos.
  const out = []; let at = buffer.indexOf(DB_HEADER);
  while (at >= 0) {
    if (out.length >= 16 || at + 24 > buffer.length) throw new Error('Cabeçalho do banco inválido.');
    const size = buffer.readUInt32LE(at + 8), end = at + size;
    if (size < 28 || end > buffer.length) throw new Error('Tamanho do banco inválido.');
    const db = buffer.subarray(at, end), count = db.readUInt32LE(16), tablesStart = 28 + count * 8;
    if (count > 4096 || tablesStart > size) throw new Error('Diretório do banco inválido.');
    const offsets = Array.from({ length: count }, (_, i) => db.readUInt32LE(28 + i * 8)).sort((a,b) => a-b);
    for (let i = 0; i < offsets.length; i++) {
      const start = tablesStart + offsets[i], tableEnd = i + 1 < offsets.length ? tablesStart + offsets[i+1] : size;
      if (start + 40 > tableEnd || tableEnd > size) throw new Error('Limites de tabela inválidos.');
      const recordSize = db.readUInt32LE(start + 4), records = db.readUInt16LE(start + 18), fields = db.readUInt8(start + 24);
      const recordsAt = start + 36 + fields * 16;
      if (!recordSize || recordsAt + recordSize * records > tableEnd - 4) throw new Error('Registros fora dos limites da tabela.');
      for (let f = 0; f < fields; f++) {
        const p = start + 36 + f * 16;
        if (p + 16 > tableEnd - 4) throw new Error('Campo truncado.');
        if (db.readUInt32LE(p) === 3 && (db.readUInt32LE(p+12) < 1 || db.readUInt32LE(p+12) > 32 || db.readUInt32LE(p+4) + db.readUInt32LE(p+12) > recordSize * 8)) throw new Error('Campo inteiro inválido.');
      }
    }
    out.push({ start: at, size, end }); at = buffer.indexOf(DB_HEADER, end);
  }
  return out;
}
function tableDescriptors(db, known) {
  const tableCount = db.readUInt32LE(16); let p = 24; const index = [];
  for (let i = 0; i < tableCount; i++) { index.push({ short: db.subarray(p, p + 4).toString(), offset: db.readUInt32LE(p + 4) }); p += 8; }
  const tableStart = p + 4; const output = [];
  for (const item of index) {
    if (!known[item.short]) continue;
    let q = tableStart + item.offset; q += 4; const recordSize = db.readUInt32LE(q); q += 14; const count = db.readUInt16LE(q); q += 6; const fieldCount = db.readUInt8(q); q += 12;
    const raw = [];
    for (let i = 0; i < fieldCount; i++) { raw.push({ type: db.readUInt32LE(q), bit: db.readUInt32LE(q + 4), short: db.subarray(q + 8, q + 12).toString(), depth: db.readUInt32LE(q + 12) }); q += 16; }
    output.push({ ...item, recordSize, count, recordsAt: q, fields: raw.sort((a,b) => a.bit - b.bit), table: known[item.short] });
  }
  return output;
}
function unsignedAt(buffer, start, bitOffset, depth) {
  // Campos podem começar no meio de um byte. BigInt evita perder bits em IDs
  // de 32 bits; o resultado só é convertido em Number depois da máscara.
  let value = 0n;
  for (let i = 0; i < Math.ceil(depth / 8) + 1; i++) value |= BigInt(buffer[start + Math.floor(bitOffset / 8) + i] || 0) << BigInt(i * 8);
  value >>= BigInt(bitOffset % 8);
  return Number(value & ((1n << BigInt(depth)) - 1n));
}
function writeUnsigned(buffer, start, bitOffset, depth, value) {
  // Preserve os bits vizinhos: substitua apenas a máscara do campo escolhido.
  if (!Number.isInteger(value) || value < 0 || value > 2 ** depth - 1) throw new Error('Valor não representável no campo do save.');
  const byte = start + Math.floor(bitOffset / 8), shift = bitOffset % 8, bytes = Math.ceil((depth + shift) / 8);
  let cur = 0n; for (let i = 0; i < bytes; i++) cur |= BigInt(buffer[byte + i]) << BigInt(i * 8);
  const mask = ((1n << BigInt(depth)) - 1n) << BigInt(shift);
  cur = (cur & ~mask) | (BigInt(value) << BigInt(shift));
  for (let i = 0; i < bytes; i++) buffer[byte + i] = Number((cur >> BigInt(i * 8)) & 255n);
}
const CRC_TABLE = Uint32Array.from({ length:256 }, (_, byte) => {
  let crc = byte << 24;
  for(let bit=0;bit<8;bit++) crc=(crc&0x80000000)?((crc<<1)^0x04c11db7)>>>0:(crc<<1)>>>0;
  return crc>>>0;
});
function databaseCrc(bytes) {
  let crc = 0xffffffff;
  for(let i=0;i<bytes.length;i++) crc=(crc<<8)^CRC_TABLE[((crc>>>24)^bytes[i])&255];
  return crc>>>0;
}
function refreshCrcs(buffer, sections) {
  // Há CRCs separados para cabeçalho do banco, diretório e cada tabela.
  // Um checksum válido não comprova que o jogo usará o valor editado.
  for (const section of sections) {
    const db = buffer.subarray(section.start, section.end), tableCount = db.readUInt32LE(16), directoryEnd = 24 + tableCount * 8, tablesStart = directoryEnd + 4;
    const offsets = Array.from({ length: tableCount }, (_, i) => db.readUInt32LE(28 + i * 8)).sort((a, b) => a - b);
    for (let i = 0; i < offsets.length; i++) {
      const start = tablesStart + offsets[i], end = i + 1 < offsets.length ? tablesStart + offsets[i + 1] : db.length;
      db.writeUInt32LE(databaseCrc(db.subarray(start, start + 32)), start + 32);
      db.writeUInt32LE(databaseCrc(db.subarray(start + 36, end - 4)), end - 4);
    }
    db.writeUInt32LE(databaseCrc(db.subarray(0, 20)), 20);
    db.writeUInt32LE(databaseCrc(db.subarray(24, directoryEnd)), directoryEnd);
  }
}
function invalidateContainerIntegrity(buffer, firstDatabaseOffset) {
  // Regra observada no contêiner FIFA 17. Não generalizar estes offsets para
  // outra versão: eles não são os CRCs internos calculados acima.
  if (buffer.subarray(0, 8).toString('ascii') !== 'FBCHUNKS') return;
  for (const [offset, length] of [[118, 32], [218, 16], [1142, 16]]) {
    if (offset + length > firstDatabaseOffset) throw new Error('A área de integridade do save se sobrepõe ao banco de dados.');
    buffer.fill(0, offset, offset + length);
  }
}
function crcErrors(buffer, sections) {
  const errors = [];
  for (const section of sections) {
    const db = buffer.subarray(section.start, section.end), tableCount = db.readUInt32LE(16), directoryEnd = 24 + tableCount * 8, tablesStart = directoryEnd + 4;
    const offsets = Array.from({ length: tableCount }, (_, i) => db.readUInt32LE(28 + i * 8)).sort((a, b) => a - b);
    if (db.readUInt32LE(20) !== databaseCrc(db.subarray(0, 20))) errors.push(`Banco em ${section.start}: cabeçalho inválido`);
    if (db.readUInt32LE(directoryEnd) !== databaseCrc(db.subarray(24, directoryEnd))) errors.push(`Banco em ${section.start}: diretório inválido`);
    for (let i = 0; i < offsets.length; i++) {
      const start = tablesStart + offsets[i], end = i + 1 < offsets.length ? tablesStart + offsets[i + 1] : db.length;
      if (db.readUInt32LE(start + 32) !== databaseCrc(db.subarray(start, start + 32))) errors.push(`Tabela em ${section.start + start}: cabeçalho inválido`);
      if (db.readUInt32LE(end - 4) !== databaseCrc(db.subarray(start + 36, end - 4))) errors.push(`Tabela em ${section.start + start}: conteúdo inválido`);
    }
  }
  return errors;
}
function locate(filePath) {
  // O ID da carreira aponta para uma linha de players. Procurar por esse ID
  // evita depender de nome, ordem da tabela ou um personagem fixo.
  const file = readBounded(filePath); const sections = dbSections(file);
  if (!sections.length) throw new Error('Este arquivo não parece ser um save de carreira do FIFA 17.');
  const dbs = sections.map(s => ({ section: s, bytes: file.subarray(s.start, s.end), tables: tableDescriptors(file.subarray(s.start, s.end), KNOWN_TABLES) }));
  const career = dbs.flatMap(d => d.tables.map(t => ({d,t}))).find(x => x.t.table.name === 'career_playasplayer');
  const players = dbs.flatMap(d => d.tables.map(t => ({d,t}))).find(x => x.t.table.name === 'players');
  if (!career || !players || career.t.count < 1) throw new Error('Não foi possível localizar uma Carreira de Jogador neste save.');
  const idField = career.t.fields.find(f => career.t.table.fields[f.short]?.name === 'playerid');
  if (!idField || idField.type !== 3 || idField.depth < 1 || idField.depth > 32) throw new Error('ID da carreira inválido.');
  const playerId = unsignedAt(career.d.bytes, career.t.recordsAt, idField.bit, idField.depth) + career.t.table.fields[idField.short].low;
  const fields = Object.fromEntries(players.t.fields.map(f => [players.t.table.fields[f.short]?.name, f])); const id = fields.playerid;
  if (!id || id.type !== 3 || id.depth < 1 || id.depth > 32) throw new Error('ID do jogador inválido.');
  for (let n = 0; n < players.t.count; n++) { const start = players.t.recordsAt + n * players.t.recordSize; if (unsignedAt(players.d.bytes, start, id.bit, id.depth) + players.t.table.fields[id.short].low === playerId) return { file, sections, playerId, table: players.t, recordStartAbsolute: players.d.section.start + start, fields }; }
  throw new Error('O jogador controlado não foi encontrado na tabela de jogadores.');
}
function fieldLimits(name) {
  return name === 'height' ? {min:130,max:215} : name === 'weight' ? {min:30,max:150} : {min:1,max:99};
}
function inspectSave(filePath) {
  // Somente leitura. O fingerprint representa o conteúdo carregado e permite
  // detectar progresso salvo pelo jogo antes de uma futura edição.
  const x = locate(filePath); const values = {};
  for (const [name, field] of Object.entries(x.fields)) if (ALLOWED.includes(name) && field.type === 3) values[name] = unsignedAt(x.file, x.recordStartAbsolute, field.bit, field.depth) + x.table.table.fields[field.short].low;
  const physical = readPhysicalRecord(x);
  if (physical) { values.height = physical.height; values.weight = physical.weight; }
  const stringAt = (offset) => { const end = x.file.indexOf(0, offset); return end >= offset && end < offset + 77 ? x.file.subarray(offset, end).toString('utf8').replace(/[\x00-\x1f]/g, '').trim() : ''; };
  const firstName = stringAt(199), surname = stringAt(276);
  return { filePath, playerId: x.playerId, playerName: [firstName, surname].filter(Boolean).join(' ') || `Jogador ${x.playerId}`, modified: fs.statSync(filePath).mtime.toISOString(), fingerprint: fingerprint(x.file), values, saveName: readSaveName(x.file), limits: Object.fromEntries(Object.keys(values).map(name => [name, fieldLimits(name)])) };
}
function readSaveTitle(buffer) {
  const end = buffer.indexOf(0, 18);
  if (buffer.subarray(0, 8).toString('ascii') !== 'FBCHUNKS' || end < 18 || end >= 118) {
    throw new Error('Nome interno do save não reconhecido.');
  }
  const bytes = buffer.subarray(18, end);
  // Some FIFA 17 titles use UTF-8, others Latin-1. Preserve the detected encoding on write.
  const encoding = isUtf8(bytes) ? 'utf8' : 'latin1';
  return { end, encoding, text: bytes.toString(encoding) };
}
function readSaveName(buffer) {
  return readSaveTitle(buffer).text;
}
function markEditedName(buffer) {
  // O título tem capacidade fixa em bytes. Preserve a codificação original e
  // não ocupe os dados reservados que vêm depois da área alocada ao nome.
  const title = readSaveTitle(buffer), original = title.text;
  const nameEnd = title.end;
  let allocationEnd = nameEnd + 1;
  while (allocationEnd < 118 && buffer[allocationEnd] === 0) allocationEnd++;
  const capacity = allocationEnd - 18 - 1;
  if (capacity < 7) throw new Error('Não há espaço seguro para identificar o save como EDITADO.');
  const base = original.replace(/^(?:Carreira|Career)\s*-\s*/i, '').replace(/^EDITADO\s*/i, '');
  let name = '';
  for (const character of `EDITADO ${base}`) {
    if (Buffer.byteLength(name + character, title.encoding) > capacity) break;
    name += character;
  }
  name = name.trim();
  buffer.fill(0, 18, allocationEnd);
  buffer.write(name, 18, title.encoding);
  return name;
}
// Registro físico duplicado, observado em carreiras do FIFA 17 PC.
// A assinatura, o ID e os intervalos são obrigatórios para usar estes offsets.
function readPhysicalRecord(x) {
  if (x.file.subarray(0, 8).toString('ascii') !== 'FBCHUNKS' || x.sections[0].start <= 1414 ||
      x.file.readUInt32LE(1390) !== x.playerId) return null;
  const height = x.file.readUInt32LE(1406), weight = x.file.readUInt32LE(1410);
  if (height < 130 || height > 215 || weight < 30 || weight > 150) return null;
  return { height, weight };
}
function buildPatchedSave(filePath, values) {
  // Prepare e confira tudo em memória. Esta etapa ainda não modifica o save.
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Alterações inválidas.');
  for (const [name, value] of Object.entries(values)) {
    if (!ALLOWED.includes(name) || typeof value !== 'number' && typeof value !== 'string') throw new Error('Campo ou valor não suportado.');
  }
  const x = locate(filePath);
  const inputErrors = crcErrors(x.file, x.sections);
  if (inputErrors.length) throw new Error('O save já apresenta erro de integridade. Restaure um backup válido.');
  for (const [name, offset] of [['height',1406],['weight',1410]]) {
    if (!(name in values)) continue;
    if (!readPhysicalRecord(x) || !x.fields[name]) throw new Error('Registro físico do jogador não reconhecido; dados físicos não foram alterados.');
    const value = Number(values[name]), limit = fieldLimits(name);
    if (values[name] === '' || !Number.isInteger(value) || value < limit.min || value > limit.max) throw new Error(`${name}: use um inteiro entre ${limit.min} e ${limit.max}.`);
    x.file.writeUInt32LE(value, offset);
  }
  let changed = 0;
  for (const [name, raw] of Object.entries(values)) {
    if (!ALLOWED.includes(name) || !x.fields[name] || raw === '' || raw === null) continue;
    const field = x.fields[name]; const value = Number(raw), low = x.table.table.fields[field.short].low;
    if (field.type !== 3) throw new Error('Tipo de atributo não suportado.');
    const { min, max } = fieldLimits(name);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name}: use um valor inteiro entre ${min} e ${max}.`);
    writeUnsigned(x.file, x.recordStartAbsolute, field.bit, field.depth, value - low); changed++;
  }
  if (!changed) throw new Error('Nenhuma alteração válida foi informada.');
  const saveName = markEditedName(x.file);
  refreshCrcs(x.file, x.sections);
  invalidateContainerIntegrity(x.file, x.sections[0].start);
  const errors = crcErrors(x.file, x.sections);
  if (errors.length) throw new Error(`A verificação de integridade falhou: ${errors[0]}`);
  return { changed, bytes: x.file, saveName };
}
function verifyWrittenSave(filePath, values, expectedName) {
  const reread = inspectSave(filePath);
  if (expectedName && reread.saveName !== expectedName) throw new Error('A verificação do nome interno falhou.');
  for (const [name, value] of Object.entries(values)) if (value !== '' && value !== null && ALLOWED.includes(name) && reread.values[name] !== Number(value)) {
    throw new Error(`A verificação após gravar falhou no campo ${name}.`);
  }
}
function patchSave(filePath, values) {
  const { changed, bytes, saveName } = buildPatchedSave(filePath, values);
  const edited = `${filePath}.edited-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.writeFileSync(edited, bytes, { flag: 'wx' });
  try { verifyWrittenSave(edited, values, saveName); } catch (error) { fs.unlinkSync(edited); throw error; }
  return { changed, edited, saveName };
}
function applySave(filePath, values, expectedFingerprint) {
  const original = readBounded(filePath);
  if (expectedFingerprint && fingerprint(original) !== expectedFingerprint) throw new Error('O save mudou desde a abertura. Recarregue antes de aplicar.');
  const { changed, bytes, saveName } = buildPatchedSave(filePath, values);
  const backup = replaceSafely(filePath, original, bytes, temporary => verifyWrittenSave(temporary, values, saveName));
  return { changed, filePath, backup, saveName };
}
function replaceSafely(filePath, original, bytes, verify) {
  // Ordem importante: backup conferido -> temporário com fsync -> comparação
  // com o original -> troca -> releitura. Uma falha tenta restaurar o original.
  // Isto não é uma transação compartilhada com FIFA ou sincronização na nuvem.
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
  const backupDirectory = path.join(path.dirname(filePath), 'fifa17-editor-backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  if (fs.lstatSync(backupDirectory).isSymbolicLink()) throw new Error('Pasta de backups não pode ser um atalho.');
  const backup = path.join(backupDirectory, `${path.basename(filePath)}.backup-${stamp}`);
  const temporary = `${filePath}.tmp-${stamp}`;
  const displaced = `${filePath}.previous-${stamp}`;

  fs.writeFileSync(backup, original, { flag: 'wx' });
  if (!readBounded(backup).equals(original)) throw new Error('O backup não corresponde ao original; aplicação cancelada.');
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx' });
    const handle = fs.openSync(temporary, 'r+');
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    verify(temporary);
    if (!readBounded(filePath).equals(original)) throw new Error('O save mudou durante a operação. Recarregue antes de aplicar.');
    fs.renameSync(filePath, displaced);
    fs.renameSync(temporary, filePath);
    verify(filePath);
    fs.unlinkSync(displaced);
    return backup;
  } catch (error) {
    if (fs.existsSync(displaced)) {
      try {
        fs.copyFileSync(displaced, filePath);
        if (!fs.readFileSync(filePath).equals(fs.readFileSync(backup))) throw new Error('restauração não conferiu');
        fs.unlinkSync(displaced);
      } catch (restoreError) {
        throw new Error(`Falha ao aplicar e restaurar: ${restoreError.message}. Original preservado em: ${backup}`);
      }
    }
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}
function listBackups(filePath) {
  const directory = path.join(path.dirname(filePath), 'fifa17-editor-backups');
  const prefix = `${path.basename(filePath)}.backup-`;
  const entries = [];
  for (const folder of [directory, path.dirname(filePath)]) {
    if (!fs.existsSync(folder) || fs.lstatSync(folder).isSymbolicLink()) continue;
    for (const name of fs.readdirSync(folder)) {
      if (!name.startsWith(prefix)) continue;
      const backupPath = path.join(folder, name);
      try { entries.push({ ...inspectSave(backupPath), backupPath }); } catch { /* Ignore unsupported backups. */ }
    }
  }
  return entries.sort((a,b) => b.filePath.localeCompare(a.filePath));
}
function restoreBackup(filePath, backupPath, expectedFingerprint, expectedBackupFingerprint) {
  // Só aceite backups vinculados a esta carreira e preserve o estado atual
  // em outro backup antes de restaurar. Assim a restauração também é reversível.
  const permitted = listBackups(filePath).find(entry => entry.backupPath === backupPath);
  if (!permitted) throw new Error('Backup não pertence ao save selecionado.');
  const target = inspectSave(filePath), restored = inspectSave(backupPath);
  if (target.playerId !== restored.playerId) throw new Error('Jogador do backup não corresponde à carreira.');
  const original = readBounded(filePath), bytes = readBounded(backupPath);
  if (expectedFingerprint && fingerprint(original) !== expectedFingerprint || expectedBackupFingerprint && fingerprint(bytes) !== expectedBackupFingerprint) throw new Error('Arquivo alterado desde a abertura. Atualize a lista.');
  const sections = dbSections(bytes);
  if (crcErrors(bytes, sections).length) throw new Error('Backup apresenta erro de integridade.');
  const backup = replaceSafely(filePath, original, bytes, temporary => {
    if (!readBounded(temporary).equals(bytes)) throw new Error('A restauração não corresponde ao backup.');
  });
  return { ...inspectSave(filePath), backup };
}
module.exports = { inspectSave, patchSave, applySave, restoreBackup, listBackups, databaseCrc, crcErrors, markEditedName };
