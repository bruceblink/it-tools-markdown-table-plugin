import { execFile as execFileCallback } from 'node:child_process';
import { createRequire } from 'node:module';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const configuredHostRoot = process.env.IT_TOOLS_HOST_ROOT?.trim();
if (!configuredHostRoot) {
  throw new Error('IT_TOOLS_HOST_ROOT is required. Set it to the IT Tools host repository before running desktop E2E.');
}
const hostRoot = resolve(configuredHostRoot);
const hostRequire = createRequire(join(hostRoot, 'package.json'));
const playwrightRequire = createRequire(import.meta.url);
const { _electron } = await import('@playwright/test');
const electronExecutablePath = hostRequire('electron') as string;
const playwrightCoreDirectory = dirname(playwrightRequire.resolve('playwright-core'));
const playwrightElectronLoader = join(playwrightCoreDirectory, 'lib', 'server', 'electron', 'loader.js');
const execFile = promisify(execFileCallback);
const pluginId = 'org.it-tools.markdown-table-formatter';
const contributionId = `${pluginId}/markdown-table-formatter`;
const keyId = 'markdown-table-e2e-publisher';
const pluginVersion = '1.0.0';

let temporaryDirectory: string;
let userDataDirectory: string;
let stagedPluginDirectory: string;
let stagedPluginParentDirectory: string;
let archivePath: string;
let electronApp: ElectronApplication;
let hostPage: Page;

test.beforeAll(async () => {
  const fixtureDirectory = await mkdtemp(join(tmpdir(), 'it-tools-markdown-plugin-e2e-'));
  temporaryDirectory = fixtureDirectory;
  userDataDirectory = join(fixtureDirectory, 'profile');
  stagedPluginParentDirectory = await mkdtemp(join(dirname(projectRoot), '.it-tools-markdown-stage-'));
  stagedPluginDirectory = join(stagedPluginParentDirectory, randomUUID());
  archivePath = join(fixtureDirectory, 'markdown-table-formatter.itplugin');
  await mkdir(userDataDirectory);

  await execFile(
    process.execPath,
    [join(projectRoot, 'scripts', 'stage-plugin.mjs'), '--output', stagedPluginDirectory],
    { cwd: projectRoot },
  );
  const stagedManifest = JSON.parse(
    await readFile(join(stagedPluginDirectory, 'plugin.source.json'), 'utf8'),
  ) as { id: string; version: string; contributions: { tools: Array<{ id: string }> } };
  expect(stagedManifest).toMatchObject({
    id: pluginId,
    version: pluginVersion,
    contributions: { tools: [{ id: contributionId }] },
  });

  const signingPair = generateKeyPairSync('ed25519');
  const pluginPack = await import(pathToFileURL(join(hostRoot, 'scripts', 'plugin-pack.mjs')).href) as {
    buildPluginPackage(options: {
      sourceDirectory: string;
      signingKey: typeof signingPair.privateKey;
      keyId: string;
    }): Promise<{ archive: Buffer }>;
  };
  const { archive } = await pluginPack.buildPluginPackage({
    sourceDirectory: stagedPluginDirectory,
    signingKey: signingPair.privateKey,
    keyId,
  });
  await writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
  const publicKey = signingPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  electronApp = await _electron.launch({
    executablePath: electronExecutablePath,
    args: [
      '-r',
      playwrightElectronLoader,
      '--no-sandbox',
      `--user-data-dir=${userDataDirectory}`,
      hostRoot,
    ],
    cwd: hostRoot,
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 60_000,
  });
  hostPage = await electronApp.firstWindow({ timeout: 60_000 });
  await expect.poll(() => hostPage.evaluate(() => document.readyState)).toMatch(/interactive|complete/);

  const actualUserDataDirectory = await electronApp.evaluate(({ app }) => app.getPath('userData'));
  expect(resolve(actualUserDataDirectory)).toBe(resolve(userDataDirectory));

  await electronApp.evaluate(({ clipboard }) => {
    let writeCount = 0;
    Object.defineProperty(clipboard, 'writeText', {
      configurable: true,
      value: (text: string) => {
        writeCount += 1;
        Object.assign(globalThis, {
          __markdownPluginClipboardText: text,
          __markdownPluginClipboardWrites: writeCount,
        });
      },
    });
  });
  await electronApp.evaluate(({ dialog }, selectedPackagePath) => {
    Object.defineProperty(dialog, 'showOpenDialog', {
      configurable: true,
      value: async () => ({ canceled: false, filePaths: [selectedPackagePath] }),
    });
    Object.defineProperty(dialog, 'showMessageBox', {
      configurable: true,
      value: async () => ({ response: 0 }),
    });
  }, archivePath);

  await hostPage.getByRole('link', { name: /Settings|设置/ }).click();
  await expect(hostPage).toHaveURL('app://bundle/settings');
  await expect(hostPage.locator('[data-test-id="plugin-manager-onboarding"]')).toBeVisible();
  await hostPage.getByLabel(/Signer key ID|签名者密钥 ID/).fill(keyId);
  await hostPage.getByLabel(/Allowed plugin IDs|允许签名的插件 ID/).fill(pluginId);
  await hostPage.getByLabel(/Ed25519 public key|Ed25519 公钥/).fill(publicKey);
  await hostPage.getByRole('button', { name: /Preview fingerprint|查看指纹/ }).click();
  await expect(hostPage.locator('.signer-preview code')).toContainText('SHA256:');
  await hostPage.getByRole('button', { name: /Trust this signer|信任此签名者/ }).click();
  await expect(hostPage.getByText(
    /Signer key added\. Plugin capabilities still require separate approval\.|已添加签名者公钥。插件仍需单独取得能力授权。/,
  )).toBeVisible();

  await hostPage.getByRole('button', { name: /Install signed package|安装已签名的插件包/ }).click();
  const packageCard = hostPage.locator(`[data-test-id="plugin-package-${pluginId}-${pluginVersion}"]`);
  await expect(packageCard).toBeVisible();
  await expect(packageCard.getByText(
    /Requested 1 · supported 1 · selected 0 · active 0|已请求 1 · 宿主支持 1 · 下次运行将授权 0 · 当前已授权 0/,
  )).toBeVisible();
});

test.afterAll(async () => {
  try {
    await electronApp?.close();
  }
  finally {
    if (temporaryDirectory) {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
        maxRetries: 6,
        retryDelay: 250,
      });
    }
    if (stagedPluginParentDirectory) {
      await rm(stagedPluginParentDirectory, {
        recursive: true,
        force: true,
        maxRetries: 6,
        retryDelay: 250,
      });
    }
  }
});

test('installs and runs the signed tool with least privilege, then grants and stops it', async () => {
  test.setTimeout(120_000);

  const contributionLink = hostPage.locator(`[data-test-id="plugin-package-${pluginId}-${pluginVersion}"]`)
    .getByRole('link', { name: 'Markdown Table Formatter', exact: true });
  await expect(contributionLink).toHaveAttribute(
    'href',
    `/extensions/${pluginId}/${pluginVersion}/markdown-table-formatter`,
  );
  await contributionLink.click();
  await expect(hostPage).toHaveURL(`app://bundle/extensions/${pluginId}/${pluginVersion}/markdown-table-formatter`);
  await electronApp.evaluate(({ dialog }) => {
    Object.defineProperty(dialog, 'showMessageBox', {
      configurable: true,
      value: async () => ({ response: 1 }),
    });
  });
  await expect(hostPage.getByRole('button', { name: /Run plugin|运行插件/ })).toBeVisible();
  await hostPage.getByRole('button', { name: /Run plugin|运行插件/ }).click();
  await expect(hostPage.getByText(/Plugin window started\.|插件窗口已启动。/)).toBeVisible();

  const deniedPluginWindow = await getPluginWindow();
  await expect.poll(async () => deniedPluginWindow.evaluate(() => (
    (globalThis as unknown as { itTools?: { toolId?: string } }).itTools?.toolId
  ))).toBe(contributionId);
  await expect.poll(async () => deniedPluginWindow.evaluate(() => {
    const api = (globalThis as unknown as {
      itTools?: {
        plugin?: { id?: string; version?: string };
        tool?: { id?: string; dataProcessing?: string; offline?: string; capabilities?: readonly string[] };
        permissions?: { requestedCapabilities: readonly string[]; grantedCapabilities: readonly string[] };
      };
    }).itTools;
    return {
      plugin: api?.plugin,
      tool: api?.tool,
      requestedCapabilities: [...(api?.permissions?.requestedCapabilities ?? [])],
      grantedCapabilities: [...(api?.permissions?.grantedCapabilities ?? [])],
    };
  })).toMatchObject({
    plugin: { id: pluginId, version: pluginVersion },
    tool: {
      id: contributionId,
      dataProcessing: 'local-data',
      offline: 'available',
      capabilities: ['clipboard.write'],
    },
    requestedCapabilities: ['clipboard.write'],
    grantedCapabilities: [],
  });

  const tableInput = [
    '| Name | Notes | Value |',
    '| :--- | :----: | ---: |',
    '| Alice | Plain text | 10 |',
    '| Bob | Uses a \\| delimiter | 2 |',
  ].join('\n');
  const expectedDefaultOutput = [
    '| Name | Notes | Value |',
    '| :--- | :---: | ---: |',
    '| Alice | Plain text | 10 |',
    '| Bob | Uses a \\| delimiter | 2 |',
  ].join('\n');

  await expect(deniedPluginWindow.locator('#table-status')).toHaveAttribute('data-state', 'pending');
  await expect(deniedPluginWindow.locator('#table-output')).toHaveValue('');
  await expect(deniedPluginWindow.locator('#select-output')).toBeDisabled();
  await expect(deniedPluginWindow.locator('#copy-output')).toBeDisabled();
  expect(await deniedPluginWindow.locator('#table-input').inputValue()).toBe('');
  await deniedPluginWindow.locator('#table-input').fill(tableInput);
  await expect(deniedPluginWindow.locator('#table-status')).toHaveAttribute('data-state', 'valid');
  await deniedPluginWindow.locator('#table-input').fill('| Bad |\n| -- |');
  await expect(deniedPluginWindow.locator('#table-status')).toHaveAttribute('data-state', 'invalid');
  await expect(deniedPluginWindow.locator('#table-error')).toBeVisible();
  await expect(deniedPluginWindow.locator('#table-output')).toHaveValue('');
  await expect(deniedPluginWindow.locator('#select-output')).toBeDisabled();
  await expect(deniedPluginWindow.locator('#copy-output')).toBeDisabled();

  await deniedPluginWindow.locator('#table-input').fill(tableInput);
  await expect(deniedPluginWindow.locator('#table-status')).toHaveAttribute('data-state', 'valid');
  await expect(deniedPluginWindow.locator('#table-error')).toBeHidden();
  await expect(deniedPluginWindow.locator('#table-output')).toHaveValue(expectedDefaultOutput);
  const alignmentControls = deniedPluginWindow.locator('#alignment-controls');
  await expect(alignmentControls.locator('select[data-column-alignment]')).toHaveCount(3);
  await deniedPluginWindow.locator('select[data-column-alignment="1"]').selectOption('left');
  const expectedAlignedOutput = expectedDefaultOutput.replace('| :--- | :---: | ---: |', '| :--- | :--- | ---: |');
  await expect(deniedPluginWindow.locator('#table-output')).toHaveValue(expectedAlignedOutput);

  await deniedPluginWindow.locator('#select-output').click();
  await expect(deniedPluginWindow.locator('#copy-result')).toContainText(/Ctrl\+C/);
  await expect.poll(() => deniedPluginWindow.locator('#table-output').evaluate((element) => {
    const output = element as HTMLTextAreaElement;
    return output === document.activeElement
      && output.selectionStart === 0
      && output.selectionEnd === output.value.length;
  })).toBe(true);

  await deniedPluginWindow.locator('#copy-output').click();
  await expect(deniedPluginWindow.locator('#copy-result')).toContainText(/not approved|尚未授权/);
  await expect(deniedPluginWindow.locator('#table-output')).toHaveValue(expectedAlignedOutput);
  expect(await getClipboardState()).toEqual({ writes: 0, text: undefined });

  const deniedPluginWindowClosed = deniedPluginWindow.waitForEvent('close');
  await hostPage.getByRole('button', { name: /Stop plugin|停止插件/ }).click();
  await deniedPluginWindowClosed;
  await expect(hostPage.getByText(/Plugin window stopped\.|插件窗口已停止。/)).toBeVisible();

  await hostPage.goto('app://bundle/settings');
  const packageCard = hostPage.locator(`[data-test-id="plugin-package-${pluginId}-${pluginVersion}"]`);
  await packageCard.getByRole('checkbox', {
    name: /Write to the system clipboard|写入系统剪贴板/,
  }).check();
  await packageCard.getByRole('link', { name: 'Markdown Table Formatter', exact: true }).click();
  await expect(hostPage).toHaveURL(`app://bundle/extensions/${pluginId}/${pluginVersion}/markdown-table-formatter`);
  await electronApp.evaluate(({ dialog }) => {
    Object.defineProperty(dialog, 'showMessageBox', {
      configurable: true,
      value: async () => ({ response: 0 }),
    });
  });
  await hostPage.getByRole('button', { name: /Run plugin|运行插件/ }).click();
  await expect(hostPage.getByText(/Plugin window started\.|插件窗口已启动。/)).toBeVisible();

  const authorizedPluginWindow = await getPluginWindow();
  await expect.poll(async () => authorizedPluginWindow.evaluate(() => (
    (globalThis as unknown as { itTools?: { permissions?: { grantedCapabilities: readonly string[] } } })
      .itTools?.permissions?.grantedCapabilities
  ))).toEqual(['clipboard.write']);
  await authorizedPluginWindow.locator('#table-input').fill(tableInput);
  await authorizedPluginWindow.locator('select[data-column-alignment="1"]').selectOption('left');
  await authorizedPluginWindow.locator('#copy-output').click();
  await expect(authorizedPluginWindow.locator('#copy-result')).toContainText(/copied|已复制/);
  expect(await getClipboardState()).toEqual({ writes: 1, text: expectedAlignedOutput });

  const pluginWindowClosed = authorizedPluginWindow.waitForEvent('close');
  await hostPage.getByRole('button', { name: /Stop plugin|停止插件/ }).click();
  await pluginWindowClosed;
  await expect(hostPage.getByText(/Plugin window stopped\.|插件窗口已停止。/)).toBeVisible();
  await hostPage.goto('app://bundle/settings');
  await expect(hostPage.locator(`[data-test-id="plugin-package-${pluginId}-${pluginVersion}"]`)
    .getByText(/Installed|已安装/)).toBeVisible();
});

async function getPluginWindow() {
  await expect.poll(async () => (
    (await electronApp.windows()).filter(window => window.url().startsWith(`it-plugin://${pluginId}/`)).length
  )).toBe(1);
  const pluginWindow = (await electronApp.windows()).find(
    window => window.url().startsWith(`it-plugin://${pluginId}/`),
  );
  if (!pluginWindow) {
    throw new Error(`The isolated plugin window for ${pluginId} did not open.`);
  }
  return pluginWindow;
}

async function getClipboardState() {
  return electronApp.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __markdownPluginClipboardText?: string;
      __markdownPluginClipboardWrites?: number;
    };
    return {
      writes: state.__markdownPluginClipboardWrites ?? 0,
      text: state.__markdownPluginClipboardText,
    };
  });
}
