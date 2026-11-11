import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stageScript = join(projectRoot, 'scripts', 'stage-plugin.mjs');
const hasZig = spawnSync('zig', ['version'], { stdio: 'ignore' }).status === 0;
const expectedFiles = ['extension.wasm', 'plugin.manifest.json'];

test('stages only the unsigned v2 manifest and built WASM module', { skip: !hasZig }, async () => {
  await execFile(process.execPath, [join(projectRoot, 'plugin', 'build.mjs')], { cwd: projectRoot });
  const temporaryParent = await mkdtemp(join(dirname(projectRoot), '.it-tools-plugin-stage-test-'));
  const stagedDirectory = join(temporaryParent, 'plugin');
  try {
    const { stdout } = await execFile(process.execPath, [stageScript, '--output', stagedDirectory], {
      cwd: projectRoot,
    });
    assert.match(stdout, /Staged org\.it-tools\.markdown-table-formatter 2\.0\.0 \(2 files\)/);

    const stagedFiles = await listFiles(stagedDirectory);
    assert.deepEqual(stagedFiles, expectedFiles);
    assert.equal(await readFile(join(stagedDirectory, 'plugin.manifest.json'), 'utf8'), await readFile(join(projectRoot, 'plugin.manifest.json'), 'utf8'));
    assert.equal(await exists(join(stagedDirectory, 'README.md')), false);
    assert.equal(await exists(join(stagedDirectory, 'tests')), false);
    assert.equal(await exists(join(stagedDirectory, 'node_modules')), false);
  }
  finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test('runs the staging package script with documented pnpm arguments', { skip: !hasZig }, async () => {
  const temporaryParent = await mkdtemp(join(dirname(projectRoot), '.it-tools-plugin-stage-pnpm-test-'));
  const stagedDirectory = join(temporaryParent, 'plugin');
  try {
    const corepackPath = process.env.COREPACK_HOME
      ? join(process.env.COREPACK_HOME, 'corepack.cjs')
      : join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
    const command = existsSync(corepackPath) ? process.execPath : 'corepack';
    const prefixArguments = command === process.execPath ? [corepackPath, 'pnpm'] : ['pnpm'];
    const { stdout } = await execFile(
      command,
      [...prefixArguments, '--dir', projectRoot, 'run', 'stage', '--output', stagedDirectory],
      { cwd: projectRoot },
    );
    assert.match(stdout, /Staged org\.it-tools\.markdown-table-formatter 2\.0\.0 \(2 files\)/);
    assert.deepEqual(await listFiles(stagedDirectory), expectedFiles);
  }
  finally {
    await rm(temporaryParent, { recursive: true, force: true });
  }
});

test('refuses an output directory inside the repository', async () => {
  const refusedDirectory = join(projectRoot, '.plugin-stage-test-must-not-exist');
  await assert.rejects(
    execFile(process.execPath, [stageScript, '--output', refusedDirectory], { cwd: projectRoot }),
    /outside this repository/,
  );
  assert.equal(await exists(refusedDirectory), false);
});

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(join(directory, entry.name), relativePath));
    }
    else {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function exists(path) {
  try {
    await readdir(path);
    return true;
  }
  catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}
