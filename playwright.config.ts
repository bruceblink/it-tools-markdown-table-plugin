import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  rootDir: projectRoot,
  testDir: join(projectRoot, 'tests'),
  testMatch: 'desktop.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? join(tmpdir(), 'it-tools-markdown-table-plugin-playwright'),
  timeout: 120_000,
  expect: { timeout: 20_000 },
});
