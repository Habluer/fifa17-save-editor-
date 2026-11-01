// No game files are modified. Optional save inspection uses FIFA17_TEST_SAVE read-only.
const { performance } = require('node:perf_hooks');
const { databaseCrc, inspectSave } = require('../save-editor');
function referenceCrc(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte << 24;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 0x80000000) ? ((crc << 1) ^ 0x04c11db7) >>> 0 : (crc << 1) >>> 0;
  }
  return crc >>> 0;
}
function measure(fn, repeats = 7) {
  fn();
  const values = [];
  for(let i=0;i<repeats;i++) { const start=performance.now(); fn(); values.push(performance.now()-start); }
  return Number(values.sort((a,b)=>a-b)[Math.floor(values.length/2)].toFixed(2));
}
const bytes = Buffer.alloc(1024*1024,0x5a);
const reference = measure(()=>referenceCrc(bytes));
const current = measure(()=>databaseCrc(bytes));
if (referenceCrc(bytes) !== databaseCrc(bytes)) throw new Error('CRC divergiu da referência.');
const result = { crcMiBReferenceMs:reference, crcMiBCurrentMs:current, ratio:Number((reference/current).toFixed(2)) };
if(process.env.FIFA17_TEST_SAVE) result.inspectMedianMs=measure(()=>inspectSave(process.env.FIFA17_TEST_SAVE));
console.log(JSON.stringify(result,null,2));
