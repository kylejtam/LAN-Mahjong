// Runs before "npm start": makes sure "npm install" has been done in this folder.
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const bin = (dir, name) =>
  existsSync(join(dir, 'node_modules', '.bin', name)) || existsSync(join(dir, 'node_modules', '.bin', `${name}.cmd`));

const ok = bin(root, 'tsx') && (bin(join(root, 'client'), 'vite') || bin(root, 'vite'));
if (!ok) {
  console.error('');
  console.error('  The game\'s tools are not installed in this folder yet.');
  console.error('  Type this and press Enter (it takes a minute or two):');
  console.error('');
  console.error('      npm install');
  console.error('');
  console.error('  Then start the game again with:  npm start');
  console.error('');
  process.exit(1);
}
