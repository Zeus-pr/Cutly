import fs from 'fs';

const p = '/Users/prajesh/Downloads/Request animation source code/src/App.tsx';
const s = fs.readFileSync(p, 'utf8');
const imports = {};
for (const m of s.matchAll(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`/g)) {
  imports[m[1]] = m[2];
}

const items = [];
const blockRe =
  /left-\[(\d+)px\][\s\S]*?top-\[(\d+)px\][\s\S]*?src=\{(\w+)\}/g;
let m;
while ((m = blockRe.exec(s))) {
  items.push({ l: +m[1], t: +m[2], f: imports[m[3]] });
}
const cells = items.filter((x) => x.f);
console.log('cells', cells.length);
const payload = JSON.stringify({ designWidth: 720, designHeight: 2380, cells });
const constantsPath = new URL('../constants/splashFieldLayout.json', import.meta.url);
fs.writeFileSync(constantsPath, payload);
const androidPath = new URL('../android/app/src/main/assets/splash_field_layout.json', import.meta.url);
fs.mkdirSync(new URL('../android/app/src/main/assets/', import.meta.url), { recursive: true });
fs.writeFileSync(androidPath, payload);
console.log('wrote android assets splash_field_layout.json');
