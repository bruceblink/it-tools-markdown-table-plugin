# IT Tools Markdown 表格 v2 插件示例

这是一个 IT Tools 插件系统 v2 的最小示例。插件使用 Zig 编译一个只导入 `env.memory` 的 freestanding WASM 模块。插件声明一个文本输入和一个 `table` 结果，IT Tools 宿主负责渲染表格。插件不会提供 HTML、CSS、Vue 组件或自定义单元格模板。

插件只在内存中解析受限的 Markdown 管道表格：第一行是表头，第二行是分隔符，后续行是数据。单元格内容作为原始文本返回，宿主工作台使用统一的 `c-table` 组件显示结果。当前示例限制为 3,000 个输入字符、约 12 KiB UTF-8 输入字节、16 列、64 行和 256 字节单元格。

## 文件

- `plugin.manifest.json`：v2 未签名静态清单，声明工具、文本字段和宿主表格结果。
- `plugin/src/extension.c`：WASM 插件实现，解析请求 JSON 并返回 `table` 结果。
- `plugin/build.mjs`：调用 `zig cc` 编译 WASM，不依赖 WASI 或仓库内部构建工具。
- `scripts/stage-plugin.mjs`：把清单和已构建的 WASM 复制到仓库外的暂存目录。
- `tests/`：清单、WASM ABI 和暂存白名单测试。

## 工具要求

- Node.js 24 或更新版本。
- pnpm 12.16.1。
- Zig 0.14.1 或兼容版本，并能通过 `zig cc` 使用 WebAssembly 链接器。示例当前已在 Zig 0.17.1 上验证。
- 要运行桌面 E2E，还需要已构建的 `it-tools-template` 宿主和 Electron 依赖。

## 本地验证

安装依赖并运行离线检查：

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test:wasm
```

`pnpm test` 使用 Node.js 内置测试运行器。没有 Zig 时，WASM 构建和暂存测试会跳过；有 Zig 时，测试会编译真实 C 源码，并直接通过 WebAssembly ABI 验证表格结果和错误结果。

## 暂存和 v2 签名打包

先构建 WASM，再把两个发布输入复制到仓库外的新目录：

```sh
corepack pnpm build
corepack pnpm stage --output /tmp/it-tools-markdown-table-plugin-stage
```

暂存目录只包含 `plugin.manifest.json` 和 `extension.wasm`。v2 打包器不编译插件；它读取静态清单、计算 WASM SHA-256、加入 `runtime` 和 `entrypoint` 字段，并使用仓库外的 Ed25519 私钥签名：

```sh
corepack pnpm --dir /path/to/it-tools-template plugin:keygen:v2 \
  --key-id markdown-table-sample-publisher \
  --output-directory "$HOME/.config/it-tools/plugin-keys"

corepack pnpm --dir /path/to/it-tools-template plugin:pack:v2 \
  --manifest /tmp/it-tools-markdown-table-plugin-stage/plugin.manifest.json \
  --wasm /tmp/it-tools-markdown-table-plugin-stage/extension.wasm \
  --entrypoint extension.wasm \
  --private-key "$HOME/.config/it-tools/plugin-keys/markdown-table-sample-publisher.private.pem" \
  --key-id markdown-table-sample-publisher \
  --output /tmp/it-tools-markdown-table-plugin.itxs
```

在 IT Tools 桌面设置中先核对签名者指纹，再信任签名者并安装 `.itxs`。安装后，工具会进入同一导航和搜索索引。打开工具时，宿主按需启动 WASM 扩展进程；输入表格并运行后，结果由宿主工作台渲染。

## 桌面 E2E

桌面 E2E 使用真实签名包验证 v2 安装、导航、搜索、表格输入和宿主渲染结果：

```sh
IT_TOOLS_HOST_ROOT=/path/to/it-tools-template corepack pnpm test:e2e:desktop
```

测试会创建临时签名密钥、用户数据目录、WASM 构建和安装包，并在结束时清理。它不替代三平台安装包、发布资产和真实用户权限验收。

## 开发边界

1. 只修改 `plugin.manifest.json`、`plugin/src/extension.c` 和构建脚本，不在插件中增加界面代码。
2. 保持 `requestedCapabilities` 和工具 `capabilities` 为空。解析表格不需要宿主能力。
3. 保持输出符合 v2 `table` 协议：列 ID 使用稳定的小写标识符，每行列数一致，单元格只返回字符串。
4. 私钥、`.itxs` 包和构建输出不能提交到仓库。
5. 文档只描述已经实现和通过验证的行为。没有 Zig 或宿主路径时，明确记录跳过的检查。
