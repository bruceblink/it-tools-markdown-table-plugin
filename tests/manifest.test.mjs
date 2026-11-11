import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('declares one capability-free v2 table tool', async () => {
  const manifest = JSON.parse(await readFile(join(repositoryRoot, 'plugin.manifest.json'), 'utf8'));
  const tool = manifest.contributions.tools[0];
  const command = manifest.contributions.commands[0];

  assert.deepEqual({ formatVersion: manifest.formatVersion, apiVersion: manifest.apiVersion }, {
    formatVersion: 2,
    apiVersion: { minInclusive: '2.0.0', maxExclusive: '3.0.0' },
  });
  assert.equal(manifest.requestedCapabilities.length, 0);
  assert.equal(manifest.contributions.tools.length, 1);
  assert.equal(manifest.contributions.commands.length, 1);
  assert.equal(tool.output.kind, 'table');
  assert.deepEqual(tool.capabilities, []);
  assert.deepEqual(tool.inputs, [expectTextInput()]);
  assert.equal(command.toolId, tool.id);
  assert.equal('runtime' in manifest, false);
  assert.equal('entrypoint' in manifest, false);
  assert.equal('signature' in manifest, false);
});

function expectTextInput() {
  return {
    kind: 'text',
    id: 'table',
    label: 'Markdown pipe table',
    description: 'Use a header row, a separator row, and optional data rows.',
    placeholder: '| Name | Value |\n| --- | ---: |\n| Alice | 10 |',
    multiline: true,
    required: true,
    maxLength: 12000,
  };
}
