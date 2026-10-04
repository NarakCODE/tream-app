import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const workspaceYamlPath = path.join(rootDir, 'pnpm-workspace.yaml');
const workspaceYaml = fs.readFileSync(workspaceYamlPath, 'utf8');

const pinnedPackages = ['react', 'react-dom', '@tanstack/react-query'];
const catalog = {};
let inCatalogSection = false;

for (const line of workspaceYaml.split('\n')) {
  if (/^catalog:\s*$/.test(line)) {
    inCatalogSection = true;
    continue;
  }
  if (inCatalogSection && /^[a-zA-Z0-9_-]+:/.test(line)) {
    inCatalogSection = false;
  }
  if (inCatalogSection) {
    const match = line.match(/^\s+['"]?([^'":\s]+)['"]?:\s*['"]?([^'"]+)['"]?\s*$/);
    if (match) {
      catalog[match[1]] = match[2];
    }
  }
}

console.log('Pinned catalog dependencies:', catalog);

const searchDirs = ['apps', 'packages'];
const packageJsonPaths = [];

for (const dir of searchDirs) {
  const fullDir = path.join(rootDir, dir);
  if (!fs.existsSync(fullDir)) continue;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const pkgJson = path.join(fullDir, entry.name, 'package.json');
      if (fs.existsSync(pkgJson)) {
        packageJsonPaths.push(pkgJson);
      }
    }
  }
}

let hasDrift = false;
const dependencyFields = ['dependencies', 'devDependencies', 'peerDependencies'];

for (const pkgJsonPath of packageJsonPaths) {
  const relativePath = path.relative(rootDir, pkgJsonPath);
  const pkgContent = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const pkgName = pkgContent.name || relativePath;

  for (const depName of pinnedPackages) {
    for (const field of dependencyFields) {
      if (pkgContent[field] && pkgContent[field][depName]) {
        const declaredVersion = pkgContent[field][depName];
        const expectedCatalogVersion = catalog[depName];

        const isValid =
          declaredVersion === 'catalog:' ||
          (expectedCatalogVersion && declaredVersion === expectedCatalogVersion);

        if (!isValid) {
          console.error(
            `❌ Version drift in ${pkgName} (${relativePath}): ` +
            `"${depName}" in ${field} is "${declaredVersion}" ` +
            `(expected "catalog:" or "${expectedCatalogVersion}")`
          );
          hasDrift = true;
        } else {
          console.log(
            `✓ ${pkgName}: ${field} -> "${depName}" is aligned ("${declaredVersion}")`
          );
        }
      }
    }
  }
}

if (hasDrift) {
  console.error('\nVersion drift detected across workspaces! Align package.json with catalog.');
  process.exit(1);
} else {
  console.log('\nAll pinned versions (react, react-dom, @tanstack/react-query) are in sync across workspaces.');
  process.exit(0);
}
