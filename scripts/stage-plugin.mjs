#!/usr/bin/env node
import { cp, lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowedPluginFiles = ['index.html', 'plugin.mjs', 'formatter.mjs', 'styles.css'];
const allowedTypeFiles = [
  'it-tools-plugin.d.ts',
  'it-tools-plugin-package.d.ts',
  'plugin-api-errors.d.ts',
  'plugin-api-version.d.ts',
  'plugin-capabilities.d.ts',
];

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
const sourceManifestPath = join(projectRoot, 'plugin.source.json');
await requireRegularFile(sourceManifestPath, 'The root plugin.source.json');

const manifestText = await readFile(sourceManifestPath, 'utf8');
const manifest = JSON.parse(manifestText);
if (manifest.formatVersion !== 1 || manifest.entrypoint !== 'index.html') {
  throw new Error('The root manifest must use format version 1 and the index.html entrypoint.');
}

const expectedPaths = [
  'plugin.source.json',
  ...allowedPluginFiles,
  ...allowedTypeFiles.map(name => join('types', name)),
];
const sourcePaths = [
  sourceManifestPath,
  ...allowedPluginFiles.map(name => join(projectRoot, 'plugin', name)),
  ...allowedTypeFiles.map(name => join(projectRoot, 'plugin', 'types', name)),
];
for (const [index, sourcePath] of sourcePaths.entries()) {
  await requireRegularFile(sourcePath, expectedPaths[index]);
}

if (manifest.requestedCapabilities.some(capability => !['clipboard.write'].includes(capability))) {
  throw new Error('The sample plugin may request only clipboard.write.');
}
const tool = manifest.contributions?.tools?.[0];
if (!tool || tool.capabilities?.some(capability => !manifest.requestedCapabilities.includes(capability))) {
  throw new Error('The manifest must declare one tool whose capabilities are a subset of the requested capabilities.');
}
if (manifest.entrypoint !== 'index.html') {
  throw new Error('The manifest entrypoint is not included in the static staging file list.');
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
  await writeFile(join(outputDirectory, 'plugin.source.json'), manifestText, { flag: 'wx' });
  for (const name of allowedPluginFiles) {
    await cp(join(projectRoot, 'plugin', name), join(outputDirectory, name), { errorOnExist: true });
  }
  await mkdir(join(outputDirectory, 'types'));
  for (const name of allowedTypeFiles) {
    await cp(join(projectRoot, 'plugin', 'types', name), join(outputDirectory, 'types', name), { errorOnExist: true });
  }
}
catch (error) {
  await rm(outputDirectory, { recursive: true, force: true });
  throw new Error(`Staging failed; the newly created staging directory was removed: ${basename(outputDirectory)}.`, { cause: error });
}

const stagedPaths = [];
for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    for (const child of await readdir(join(outputDirectory, entry.name))) {
      stagedPaths.push(join(entry.name, child));
    }
  }
  else {
    stagedPaths.push(entry.name);
  }
}
stagedPaths.sort();
if (stagedPaths.length !== expectedPaths.length || stagedPaths.some((path, index) => path !== expectedPaths.toSorted()[index])) {
  await rm(outputDirectory, { recursive: true, force: true });
  throw new Error('The staged package contains an unexpected file set; the staging directory was removed.');
}

process.stdout.write(`Staged ${manifest.id} ${manifest.version} (${stagedPaths.length} files): ${outputDirectory}\n`);
