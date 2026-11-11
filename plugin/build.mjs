#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const pluginDirectory = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(pluginDirectory, 'src/extension.c');
const outputPath = readOutputPath(process.argv.slice(2));

await mkdir(dirname(outputPath), { recursive: true });

const compilerArguments = [
  'cc',
  '-target', 'wasm32-freestanding',
  '-std=c11',
  '-O2',
  '-fno-builtin',
  '-nostdlib',
  '-Wl,--no-entry',
  '-Wl,--import-memory',
  '-Wl,-z,stack-size=32768',
  '-Wl,--initial-memory=1048576',
  '-Wl,--max-memory=16777216',
  '-Wl,--export=alloc',
  '-Wl,--export=execute',
  '-Wl,--export=free',
  sourcePath,
  '-o',
  outputPath,
];

// 使用 Zig 自带的链接器生成 freestanding WASM，不引入 WASI 或宿主函数。
const compiler = spawnSync('zig', compilerArguments, { stdio: 'inherit' });
if (compiler.error) {
  throw new Error(`无法启动 Zig C 编译器：${compiler.error.message}`, { cause: compiler.error });
}
if (compiler.status !== 0) {
  process.exitCode = compiler.status ?? 1;
}
else {
  process.stdout.write(`已构建 WASM 模块：${outputPath}\n`);
}

function readOutputPath(arguments_) {
  if (arguments_.length === 0) {
    return resolve(pluginDirectory, 'build/extension.wasm');
  }
  if (arguments_.length === 2 && arguments_[0] === '--output' && arguments_[1]) {
    return resolve(arguments_[1]);
  }
  throw new Error('用法：node plugin/build.mjs [--output <wasm 文件路径>]');
}
