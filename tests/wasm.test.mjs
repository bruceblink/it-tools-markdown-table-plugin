import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = join(repositoryRoot, 'plugin', 'build.mjs');
const hasZig = spawnSync('zig', ['version'], { stdio: 'ignore' }).status === 0;

test('builds the v2 module and returns a host-owned table result', { skip: !hasZig }, async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'it-tools-markdown-table-plugin-'));
  const wasmPath = join(temporaryDirectory, 'extension.wasm');
  try {
    execFileSync(process.execPath, [buildScript, '--output', wasmPath], { cwd: repositoryRoot, stdio: 'pipe' });
    const moduleBytes = new Uint8Array(await readFile(wasmPath));
    const module = new WebAssembly.Module(moduleBytes);
    assert.deepEqual(WebAssembly.Module.imports(module), [{ module: 'env', name: 'memory', kind: 'memory' }]);
    assert.deepEqual(WebAssembly.Module.exports(module).map(item => item.name).sort(), ['alloc', 'execute', 'free']);

    const result = execute(moduleBytes, {
      commandId: 'org.it-tools.markdown-table-formatter/format-markdown-table',
      input: {
        table: '| Name | Value |\n| --- | ---: |\n| Alice | 10 |\n| Bob | 2 |',
      },
    });
    assert.deepEqual(result, {
      kind: 'table',
      value: {
        columns: [{ id: 'column1', label: 'Name' }, { id: 'column2', label: 'Value' }],
        rows: [['Alice', '10'], ['Bob', '2']],
      },
    });

    assert.deepEqual(execute(moduleBytes, {
      commandId: 'org.it-tools.markdown-table-formatter/format-markdown-table',
      input: { table: '| Name |\n| -- |' },
    }), {
      kind: 'table',
      value: {
        columns: [{ id: 'error', label: 'Error' }],
        rows: [['Each separator cell needs at least three hyphens.']],
      },
    });
  }
  finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

function execute(moduleBytes, request) {
  const memory = new WebAssembly.Memory({ initial: 16, maximum: 256 });
  const instance = new WebAssembly.Instance(new WebAssembly.Module(moduleBytes), { env: { memory } });
  const requestBytes = new TextEncoder().encode(JSON.stringify(request));
  const requestPointer = instance.exports.alloc(requestBytes.byteLength);
  new Uint8Array(memory.buffer, requestPointer, requestBytes.byteLength).set(requestBytes);
  const descriptor = instance.exports.execute(requestPointer, requestBytes.byteLength);
  const resultPointer = Number(descriptor >> 32n);
  const resultLength = Number(descriptor & 0xffff_ffffn);
  const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
    new Uint8Array(memory.buffer, resultPointer, resultLength),
  ));
  instance.exports.free(requestPointer, requestBytes.byteLength);
  if (resultPointer !== requestPointer) {
    instance.exports.free(resultPointer, resultLength);
  }
  return result;
}
