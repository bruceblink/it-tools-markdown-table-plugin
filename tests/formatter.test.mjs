import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { formatterErrors, formatPipeTable } from '../plugin/formatter.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');

test('normalizes spacing while preserving alignment, text, and Markdown escapes', () => {
  const result = formatPipeTable([
    '| Name | Notes | Value |',
    '| :--- | :----: | ---: |',
    '| Alice | **Plain text** | 10 |',
    '| Bob | Uses a \\| delimiter | 2 |',
  ].join('\r\n'));

  assert.deepEqual(result, {
    ok: true,
    output: [
      '| Name | Notes | Value |',
      '| :--- | :---: | ---: |',
      '| Alice | **Plain text** | 10 |',
      '| Bob | Uses a \\| delimiter | 2 |',
    ].join('\n'),
    rows: 2,
    columns: 3,
    alignments: ['left', 'center', 'right'],
  });
});

test('preserves Markdown default alignment instead of converting it to left alignment', () => {
  assert.equal(formatPipeTable('| A | B |\n| --- | ---- |').output, '| A | B |\n| --- | --- |');
});

test('changes only selected column alignment and preserves defaults for other columns', () => {
  const result = formatPipeTable('| A | B | C |\n| --- | :---: | ---: |', {
    alignments: ['center', 'default', 'left'],
  });

  assert.equal(result.output, '| A | B | C |\n| :---: | --- | :--- |');
  assert.deepEqual(result.alignments, ['center', 'default', 'left']);
});

test('preserves unknown escapes, even backslashes, and escaped pipes', () => {
  const source = String.raw`| A | B | C | D |
| --- | --- | --- | --- |
| \* | \\ | \| | \q |`;
  const result = formatPipeTable(source);
  assert.equal(result.ok, true);
  assert.equal(result.output, source);
});

test('counts backslash parity when finding separators and outer pipes', () => {
  const source = String.raw`| A | B | C |
| --- | --- | --- |
| first\\|second | third |`;
  const result = formatPipeTable(source);
  assert.equal(result.ok, true);
  assert.equal(result.output, String.raw`| A | B | C |
| --- | --- | --- |
| first\\ | second | third |`);
});

test('normalization is idempotent and leaves escapes unchanged', () => {
  const input = String.raw`| A | B |
| --- | :---: |
| \* | \| |`;
  const first = formatPipeTable(input);
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.deepEqual(formatPipeTable(first.output), first);
  }
});

test('supports empty cells, one-column tables, and optional surrounding blank lines', () => {
  assert.deepEqual(formatPipeTable('\n| Header |\n| --- |\n| |\n\n'), {
    ok: true,
    output: '| Header |\n| --- |\n|  |',
    rows: 1,
    columns: 1,
    alignments: ['default'],
  });
});

test('reports stable error codes and row details for invalid input', () => {
  assert.equal(failureCode(''), formatterErrors.missingHeader);
  assert.equal(failureCode('A | B\n--- | ---'), formatterErrors.invalidOuterPipes);
  assert.equal(failureCode('| A | B |\n| --- |'), formatterErrors.separatorColumnCount);
  assert.equal(failureCode('| A |\n| -- |'), formatterErrors.invalidSeparator);
  assert.equal(failureCode('| A |\n| --- |\n\n| 1 |'), formatterErrors.blankLine);
  assert.deepEqual(formatPipeTable('| A |\n| --- |\n| 1 | 2 |'), {
    ok: false,
    error: formatterErrors.rowColumnCount,
    errorCode: formatterErrors.rowColumnCount,
    errorParameters: { row: 3, actual: 2, expected: 1 },
  });
});

test('rejects inputs and tables above documented limits', () => {
  assert.equal(failureCode('x'.repeat(100_001)), formatterErrors.inputTooLong);
  const tooManyColumns = `| ${Array.from({ length: 101 }, () => 'A').join(' | ')} |\n| ${Array.from({ length: 101 }, () => '---').join(' | ')} |`;
  assert.equal(failureCode(tooManyColumns), formatterErrors.invalidColumnCount);
  const tooManyRows = `| A |\n| --- |\n${Array.from({ length: 5_001 }, () => '| x |').join('\n')}`;
  assert.equal(failureCode(tooManyRows), formatterErrors.tooManyRows);
});

test('the repository root has one source manifest with the expected plugin permissions', async () => {
  const manifest = JSON.parse(await readFile(resolve(repositoryRoot, 'plugin.source.json'), 'utf8'));
  assert.equal(manifest.id, 'org.it-tools.markdown-table-formatter');
  assert.equal(manifest.entrypoint, 'index.html');
  assert.deepEqual(manifest.requestedCapabilities, ['clipboard.write']);
  assert.deepEqual(manifest.contributions.tools[0].capabilities, ['clipboard.write']);
  assert.equal(manifest.contributions.tools[0].dataProcessing, 'local-data');
  assert.equal(manifest.contributions.tools[0].offline, 'available');
});

function failureCode(input) {
  const result = formatPipeTable(input);
  assert.equal(result.ok, false);
  return result.errorCode;
}
