#!/usr/bin/env node
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseOutputDirectory(argv) {
  if (argv.length !== 2 || argv[0] !== '--output' || !argv[1] || argv[1].startsWith('--')) {
    throw new Error('Usage: node scripts/stage-plugin.mjs --output <new-directory-outside-repository>');
  }
  const output = resolve(argv[1]);
  if (!isAbsolute(output) || output === projectRoot || output.startsWith(`${projectRoot}${sep}`)) {
    throw new Error('Choose a staging directory outside this repository.');
  }
  return output;
}

async function requireRegularFile(path, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error(`${label} must be a regular file.`);
  }
}

const outputDirectory = parseOutputDirectory(process.argv.slice(2));
const realProjectRoot = await realpath(projectRoot);
const sourceManifestPath = join(projectRoot, 'plugin.manifest.json');
const wasmPath = join(projectRoot, 'plugin', 'build', 'extension.wasm');
await requireRegularFile(sourceManifestPath, 'The root plugin.manifest.json');
await requireRegularFile(wasmPath, 'Build the plugin before staging it; plugin/build/extension.wasm');

const manifestText = await readFile(sourceManifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.formatVersion !== 2 || manifest.runtime || manifest.entrypoint || manifest.signature) {
  throw new Error('The source manifest must contain only unsigned v2 contribution fields.');
}
const tool = manifest.contributions?.tools?.[0];
if (manifest.requestedCapabilities?.length !== 0
  || !tool
  || tool.output?.kind !== 'table'
  || tool.capabilities?.length !== 0) {
  throw new Error('The sample v2 manifest must expose one capability-free table tool.');
}

const outputParent = dirname(outputDirectory);
await mkdir(outputParent, { recursive: true });
const outputParentReal = await realpath(outputParent);
const relativeToProject = relative(realProjectRoot, outputParentReal);
const outputOnSameVolume = !isAbsolute(relativeToProject);
if (relativeToProject === '' || (outputOnSameVolume && !relativeToProject.startsWith(`..${sep}`) && relativeToProject !== '..')) {
  throw new Error('Staging output must remain outside this repository.');
}

try {
  await mkdir(outputDirectory);
}
catch (error) {
  if (error?.code === 'EEXIST') {
    throw new Error(`The staging output already exists; choose a new directory: ${outputDirectory}`);
  }
  throw error;
}

try {
  await writeFile(join(outputDirectory, 'plugin.manifest.json'), manifestText, { flag: 'wx' });
  await cp(wasmPath, join(outputDirectory, 'extension.wasm'), { errorOnExist: true });
}
catch (error) {
  await rm(outputDirectory, { recursive: true, force: true });
  throw new Error(`Staging failed; the newly created staging directory was removed: ${basename(outputDirectory)}.`, { cause: error });
}

const stagedPaths = (await readdir(outputDirectory, { withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => entry.name)
  .sort();
const expectedPaths = ['extension.wasm', 'plugin.manifest.json'];
if (stagedPaths.length !== expectedPaths.length || stagedPaths.some((path, index) => path !== expectedPaths[index])) {
  await rm(outputDirectory, { recursive: true, force: true });
  throw new Error('The staged package contains an unexpected file set; the staging directory was removed.');
}

process.stdout.write(`Staged ${manifest.id} ${manifest.version} (${stagedPaths.length} files): ${outputDirectory}\n`);
