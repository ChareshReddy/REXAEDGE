import fs from 'fs';

let c = fs.readFileSync('backend/routes/chat.js', 'utf8');
c = c.replace(
  '        const summary = Copy BOM:  () →  ();',
  '        const summary = `Copy BOM: ${clean.sourceMaterial} (${clean.sourcePlant}) → ${clean.targetMaterial} (${clean.targetPlant})`;'
);
fs.writeFileSync('backend/routes/chat.js', c, 'utf8');
console.log('Fixed chat.js summary');
