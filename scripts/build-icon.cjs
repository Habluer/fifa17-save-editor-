// Format conversion only: generate Windows ICO frames from the approved PNG.
const { app, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(() => {
  try {
    const directory = path.join(__dirname, '../assets');
    const source = nativeImage.createFromPath(path.join(directory, 'icon.png'));
    if (source.isEmpty()) throw new Error('Imagem do ícone não encontrada.');
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const frames = sizes.map(size => source.resize({ width:size, height:size, quality:'best' }).toPNG());
    const header = Buffer.alloc(6 + sizes.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(sizes.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const position = 6 + index * 16;
      header[position] = header[position + 1] = size === 256 ? 0 : size;
      header.writeUInt16LE(1, position + 4);
      header.writeUInt16LE(32, position + 6);
      header.writeUInt32LE(frames[index].length, position + 8);
      header.writeUInt32LE(offset, position + 12);
      offset += frames[index].length;
    });
    fs.writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([header, ...frames]));
    console.log(`ICO: ${sizes.join(', ')} px.`);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
