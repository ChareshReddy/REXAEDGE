import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.resolve(rootDir, '../frontend/src');

console.log('--- PHASE 0 AUDIT & INVENTORY ---');

// 1. Inventory Routes
const routesFile = fs.readFileSync(path.resolve(frontendDir, 'config/routes.js'), 'utf8');
const routeMatches = [...routesFile.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
console.log(`Routes found: ${routeMatches.length}`);
console.log(routeMatches);

// 2. Inventory Components & Popups
const components = fs.readdirSync(path.resolve(frontendDir, 'components')).filter(f => f.endsWith('.jsx'));
console.log(`Components found: ${components.length}`);
const popups = components.filter(f => f.toLowerCase().includes('modal') || f.toLowerCase().includes('help') || f.toLowerCase().includes('popup'));
console.log(`Popups found: ${popups.length}`, popups);

// 3. Inventory CSS files
const cssFiles = [];
function findCss(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && !item.name.startsWith('.')) findCss(full);
    } else if (item.name.endsWith('.css')) {
      cssFiles.push(path.relative(frontendDir, full));
    }
  }
}
findCss(frontendDir);
console.log(`CSS files found: ${cssFiles.length}`, cssFiles);

// 4. Scan for hardcoded colors in component files
const hexColorRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const strayColors = {};
for (const comp of components) {
  const content = fs.readFileSync(path.resolve(frontendDir, 'components', comp), 'utf8');
  const matches = [...content.matchAll(hexColorRegex)].map(m => m[0].toUpperCase());
  if (matches.length > 0) {
    strayColors[comp] = matches;
  }
}
console.log('Components with inline hex colors:', Object.keys(strayColors).length);
fs.writeFileSync(path.resolve(rootDir, 'test/audit_inventory.json'), JSON.stringify({
  routes: routeMatches,
  components,
  popups,
  cssFiles,
  strayColors
}, null, 2));
console.log('Audit saved to backend/test/audit_inventory.json');
