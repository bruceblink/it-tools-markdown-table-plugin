import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, _electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const configuredHostRoot = process.env.IT_TOOLS_HOST_ROOT?.trim();
if (!configuredHostRoot) {
  throw new Error('IT_TOOLS_HOST_ROOT is required. Set it to the IT Tools host repository before running desktop E2E.');
}
const hostRoot = resolve(configuredHostRoot);
const hostRequire = createRequire(join(hostRoot, 'package.json'));
const playwrightRequire = createRequire(import.meta.url);
const electronExecutablePath = hostRequire('electron') as string;
const playwrightCoreDirectory = dirname(playwrightRequire.resolve('playwright-core'));
const playwrightElectronLoader = join(playwrightCoreDirectory, 'lib', 'server', 'electron', 'loader.js');
const pluginId = 'org.it-tools.markdown-table-formatter';
const pluginVersion = '2.0.0';
const toolId = `${pluginId}/markdown-table-formatter`;
const commandId = `${pluginId}/format-markdown-table`;
const toolRoute = `/extensions/${pluginId}/${pluginVersion}/markdown-table-formatter`;
const signerKeyId = 'markdown-table-e2e-publisher';
const signingPair = generateKeyPairSync('ed25519');
const signerPublicKey = signingPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

let electronApp: ElectronApplication | undefined;
let page: Page;
let temporaryDirectory = '';
let userDataDirectory = '';

test.beforeAll(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'it-tools-markdown-table-plugin-e2e-'));
  userDataDirectory = await mkdtemp(join(tmpdir(), 'it-tools-markdown-table-plugin-profile-'));
  const wasmPath = join(temporaryDirectory, 'extension.wasm');
  const packagePath = join(temporaryDirectory, 'markdown-table.itxs');

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  await promisify(execFile)(process.execPath, [join(repositoryRoot, 'plugin', 'build.mjs'), '--output', wasmPath], {
    cwd: repositoryRoot,
  });

  const packer = await import(pathToFileURL(join(hostRoot, 'scripts', 'plugin-pack-v2.mjs')).href) as {
    buildExternalPluginV2Package(options: {
      manifestPath: string;
      wasmPath: string;
      entrypoint: string;
      signingKey: typeof signingPair.privateKey;
      keyId: string;
    }): Promise<{ archive: Buffer }>;
  };
  const { archive } = await packer.buildExternalPluginV2Package({
    manifestPath: join(repositoryRoot, 'plugin.manifest.json'),
    wasmPath,
    entrypoint: 'extension.wasm',
    signingKey: signingPair.privateKey,
    keyId: signerKeyId,
  });
  await writeFile(packagePath, archive, { flag: 'wx', mode: 0o600 });

  electronApp = await _electron.launch({
    executablePath: electronExecutablePath,
    args: ['-r', playwrightElectronLoader, '--no-sandbox', `--user-data-dir=${userDataDirectory}`, hostRoot],
    cwd: hostRoot,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 60_000,
  });
  page = await electronApp.firstWindow({ timeout: 60_000 });
  await page.waitForLoadState('load');

  await page.goto('app://bundle/settings');
  await electronApp.evaluate(({ dialog }, selectedPackagePath) => {
    Object.defineProperty(dialog, 'showMessageBox', {
      configurable: true,
      value: async () => ({ response: 0 }),
    });
    Object.defineProperty(dialog, 'showOpenDialog', {
      configurable: true,
      value: async () => ({ canceled: false, filePaths: [selectedPackagePath] }),
    });
  }, packagePath);
  await page.getByLabel('Signer key ID').fill(signerKeyId);
  await page.getByLabel('Allowed plugin IDs, separated by commas').fill(pluginId);
  await page.getByLabel('Ed25519 public key (PEM)').fill(signerPublicKey);
  await page.getByRole('button', { name: 'Preview fingerprint' }).click();
  await expect(page.locator('.signer-preview code')).toContainText('SHA256:');
  await page.getByRole('button', { name: 'Trust this signer' }).click();
  await expect(page.getByText('Signer key added. Plugin capabilities still require separate approval.')).toBeVisible();
  const installResult = await page.evaluate(() => window.itToolsDesktop!.installPluginV2Package!());
  expect(installResult).toMatchObject({ ok: true });
});

test.afterAll(async () => {
  try {
    await electronApp?.close();
  }
  finally {
    await Promise.all([temporaryDirectory, userDataDirectory].filter(Boolean).map(directory => rm(directory, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 250,
    })));
  }
});

test('installs and runs the markdown table command through navigation and search', async () => {
  test.setTimeout(120_000);
  await page.goto('app://bundle/');
  const toolLink = page.locator(`a[href="${toolRoute}"]`).first();
  await expect(toolLink).toBeVisible();
  await toolLink.click();
  await expect(page).toHaveURL(`app://bundle${toolRoute}`);
  await expect(page.getByRole('heading', { name: 'Markdown Table Formatter' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'External plugin tool', exact: true })).toHaveCount(0);

  await page.goto('app://bundle/');
  await page.keyboard.press('Control+k');
  const search = page.getByPlaceholder('Type to search a tool or a command...');
  await search.fill('Format Markdown table');
  const commandOption = page.getByRole('option').filter({ hasText: 'Format Markdown table' }).first();
  await expect(commandOption).toBeVisible();
  await commandOption.click();
  await expect(page).toHaveURL(`app://bundle${toolRoute}`);

  const tableInput = page.getByLabel('Markdown pipe table').locator('textarea');
  await tableInput.fill('| Name | Value |\n| --- | ---: |\n| Alice | 10 |\n| Bob | 2 |');
  await page.getByRole('button', { name: 'Run' }).click();
  const resultTable = page.getByRole('table', { name: 'Result' });
  await expect(resultTable).toBeVisible();
  await expect(resultTable).toContainText('Name');
  await expect(resultTable).toContainText('Alice');
  await expect(resultTable).toContainText('10');

  await electronApp!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(820, 700));
  await expect(page.locator('.plugin-tool-workbench-table-wrapper')).toBeVisible();
  expect(await page.locator('.plugin-tool-workbench').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);

  const result = await page.evaluate(async request => window.itToolsDesktop!.executePluginV2Command!({
    requestId: crypto.randomUUID(),
    ...request,
  }), {
    pluginId,
    version: pluginVersion,
    commandId,
    input: { table: '| A |\n| --- |\n| value |' },
  });
  expect(result).toMatchObject({
    ok: true,
    value: {
      kind: 'table',
      value: { columns: [{ id: 'column1', label: 'A' }], rows: [['value']] },
    },
  });
});
