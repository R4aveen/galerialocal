const fs = require('fs');
const path = require('path');

const root = process.cwd();

const aliases = [
  {
    file: path.join(root, 'node_modules/expo/tsconfig.base'),
    content: '{\n  "extends": "./tsconfig.base.json"\n}\n',
  },
  {
    file: path.join(root, 'node_modules/expo-module-scripts/tsconfig.base'),
    content: '{\n  "extends": "./tsconfig.base.json"\n}\n',
  },
];

for (const alias of aliases) {
  const dir = path.dirname(alias.file);
  if (!fs.existsSync(dir)) continue;
  fs.writeFileSync(alias.file, alias.content, 'utf8');
}

const mediaLibraryTsconfig = path.join(root, 'node_modules/expo-media-library/tsconfig.json');
if (fs.existsSync(mediaLibraryTsconfig)) {
  const content = fs.readFileSync(mediaLibraryTsconfig, 'utf8');
  const updated = content
    .replace('"extends": "expo-module-scripts/tsconfig.base"', '"extends": "../expo-module-scripts/tsconfig.base.json"')
    .replace('"extends": "expo-module-scripts/tsconfig.base.json"', '"extends": "../expo-module-scripts/tsconfig.base.json"');
  if (updated !== content) {
    fs.writeFileSync(mediaLibraryTsconfig, updated, 'utf8');
  }
}
