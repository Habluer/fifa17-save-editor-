const fs = require('node:fs');
const path = require('node:path');

// Only the folder preference is stored here; save files are never copied.
function folderPreference(file) {
  let directory = null;
  try {
    if (fs.statSync(file).size <= 16384) {
      const stored = JSON.parse(fs.readFileSync(file, 'utf8')).saveFolder;
      if (typeof stored === 'string' && path.isAbsolute(stored)) directory = stored;
    }
  } catch { /* Missing or invalid preferences prompt a fresh choice. */ }
  return {
    get: () => directory,
    usable: () => {
      try { return Boolean(directory && fs.statSync(directory).isDirectory()); }
      catch { return false; }
    },
    set(value) {
      if (typeof value !== 'string' || !path.isAbsolute(value) || !fs.statSync(value).isDirectory()) throw new Error('Selecione uma pasta válida.');
      fs.mkdirSync(path.dirname(file), { recursive:true });
      fs.writeFileSync(file, JSON.stringify({ saveFolder:value }), { mode:0o600 });
      directory = value;
    }
  };
}
module.exports = { folderPreference };
