// Runs the Go toolchain for this module with the project's node_modules/.bin
// on PATH (golem-bake's JavaScript integration needs the local tsc) and with
// GOWORK=off, so a go.work in a parent directory cannot replace the released
// engine with a local checkout.
import { spawn } from 'node:child_process';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length === 0) throw new Error('usage: node scripts/go.mjs <go arguments>');

const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
const child = spawn('go', args, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    GOWORK: 'off',
    [pathKey]: `${resolve(root, 'node_modules/.bin')}${delimiter}${process.env[pathKey] ?? ''}`,
  },
});
child.on('error', (error) => { console.error(error); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
