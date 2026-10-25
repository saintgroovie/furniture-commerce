// LOCAL proposal. Verifies registry mapping before npm; npm ci enforces archive SRI.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
function verify(a, pkg, lock) {
  assert.equal(a.schema, 1);
  assert.equal(a.name, 'playwright-core');
  assert.equal(a.version, '1.64.1');
  assert.equal(a.tarball, 'https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz');
  assert.equal(a.integrity, 'sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==');
  assert.deepEqual(pkg.dependencies, {'playwright-core': '1.64.1'});
  assert(!pkg.optionalDependencies && !pkg.devDependencies && !pkg.overrides);
  assert.equal(pkg.private, true);
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(Object.keys(lock.packages).sort(), ['', 'node_modules/playwright-core']);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  const p = lock.packages['node_modules/playwright-core'];
  assert.equal(p.version, a.version); assert.equal(p.resolved, a.tarball); assert.equal(p.integrity, a.integrity);
  assert(!p.dependencies && !p.optionalDependencies && !p.hasInstallScript);
  assert.equal(a.registry_key.keyid, 'SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U');
  assert.equal(a.registry_key.keytype, 'ecdsa-sha2-nistp256');
  assert(!a.registry_key.expires || Date.parse(a.registry_key.expires) > Date.now());
  const der = Buffer.from(a.registry_key.key, 'base64');
  assert.equal(crypto.createHash('sha256').update(der).digest('hex'), 'fb190a462123443500cbcdb6519623e7179e9f38d84ad4e9362b72d2b68b62c1');
  const key = crypto.createPublicKey({key: der, format: 'der', type: 'spki'});
  const message = Buffer.from(`${a.name}@${a.version}:${a.integrity}`);
  assert(a.registry_signatures.some(s => s.keyid === a.registry_key.keyid && crypto.verify('sha256', message, key, Buffer.from(s.sig, 'base64'))));
  return {name:a.name, version:a.version, integrity:a.integrity, registryMappingAuthenticated:true};
}
function installed(a) {
  const pkg = require('./node_modules/playwright-core/package.json');
  assert.equal(pkg.version, a.version);
  assert(Number(process.versions.node.split('.')[0]) >= 20);
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'arm64');
  const browsers = require('./node_modules/playwright-core/browsers.json').browsers;
  assert(browsers.some(b => b.name === 'chromium' && b.revision === a.chromium_revision && b.browserVersion === a.chromium_version));
  assert(fs.statSync(a.module_path).isFile()); assert(fs.statSync(a.chromium_path).isFile());
  assert.equal(path.resolve(a.module_path), '/opt/woodright-cart-probe/node_modules/playwright-core/index.mjs');
  assert.equal(path.resolve(a.chromium_path), '/ms-playwright/chromium-1248/chrome-linux-arm64/chrome');
}
function resourceBounds(memory,swap,cpu) {
  assert.equal(memory.trim(),String(768*1024*1024));
  assert.equal(swap.trim(),'0');
  assert.equal(cpu.trim(),'100000 100000');
}
module.exports = {verify,resourceBounds};
if (require.main === module) {
  const a = require('./SDK-INTEGRITY.lock.json');
  const proof = verify(a, require('./package.json'), require('./package-lock.json'));
  assert(['metadata', 'installed'].includes(process.argv[2]));
  assert.equal(process.argv[3],'--build-bounds');
  resourceBounds(fs.readFileSync('/sys/fs/cgroup/memory.max','utf8'),fs.readFileSync('/sys/fs/cgroup/memory.swap.max','utf8'),fs.readFileSync('/sys/fs/cgroup/cpu.max','utf8'));
  if (process.argv[2] === 'installed') installed(a);
  console.log(JSON.stringify({...proof, installedPathCheck:process.argv[2] === 'installed'}));
}
