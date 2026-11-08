# IT Tools Markdown 表格整理器插件

这是一个离线的第三方工具插件示例。插件在独立窗口中整理受限格式的 Markdown 管道表格。它也展示插件清单、SDK 类型、能力授权、验证、暂存和宿主打包流程。

## 功能范围

插件处理纯文本。它要求每行以未转义的 `|` 开始和结束。第一行是表头，第二行是分隔符。分隔符单元格包含至少三个连字符。单元格两端可用冒号指定左对齐、居中或右对齐；无冒号表示 Markdown 默认对齐。

插件保留单元格里的 Markdown 原始文本和反斜杠，不解析或渲染链接、强调、代码、HTML、列表、代码块或其他 GFM 规则。插件只按竖线前连续反斜杠的奇偶数识别列边界。行列数不一致、内部空行、无效分隔符和缺少外侧竖线会显示错误。输入上限为 100,000 个字符、5,000 行数据和 100 列。

用户可以逐列更改对齐方式。默认选项保留 Markdown 默认对齐。插件仅在用户点击“使用桌面授权复制”后调用 `clipboard.write`。未授权时，插件显示拒绝状态。用户仍可选中结果并手动复制。插件不自动保存输入，也不访问网络。

## 项目结构

- `plugin.source.json` 是插件源码的唯一清单。
- `plugin/` 存放界面、格式化逻辑和 SDK 声明副本。
- `scripts/stage-plugin.mjs` 从唯一清单和静态文件白名单创建包暂存目录。
- `tests/` 存放不依赖宿主界面的单元测试。桌面集成测试另外由 `tests/desktop.e2e.spec.ts` 提供。
- `LICENSE` 使用 GPL-3.0-only。

SDK 声明应与宿主 `plugins/sdk/` 的同名文件逐字一致。宿主升级 API 时，请将宿主声明文件复制到 `plugin/types/`，再运行 `pnpm typecheck`。

## 开发与验证

需要 Node.js 24 或更新版本，以及 pnpm 12.16.1。首次安装开发依赖：

```powershell
corepack pnpm install --frozen-lockfile
```

运行离线检查：

```powershell
corepack pnpm test
corepack pnpm typecheck
```

`pnpm test` 使用 Node.js 内置测试运行器，不需要网络或宿主项目。桌面端 E2E 使用 `@playwright/test`，并连接本机 IT Tools 宿主项目。先按宿主的开发说明安装宿主依赖和 Electron，再运行：

```powershell
$env:IT_TOOLS_HOST_ROOT = "<宿主仓库的绝对路径>"
corepack pnpm test:e2e:desktop
```

E2E 会创建临时签名密钥、独立用户数据目录和安装包，并在测试结束时清理。它验证真实桌面宿主中的安装、未授权复制拒绝、授权复制和停止插件。它不替代独立 Windows 安装包或发布验收。

最小验收顺序是：`pnpm install --frozen-lockfile`、`pnpm test`、`pnpm typecheck`、宿主 `plugin:validate`，最后再运行桌面 E2E。任何一步失败都不能报告插件已完成验收。

## 暂存、验证与签名打包

本项目不复制宿主的验证和签名工具。请先检出并安装 `it-tools-template` 宿主，再通过宿主的 `plugin:validate`、`plugin:keygen` 和 `plugin:build` 命令处理暂存包。暂存目录必须位于本项目仓库之外，避免包中包含测试、脚本、依赖或 Git 数据。

```powershell
$pluginRoot = "<插件仓库的绝对路径>"
$hostRoot = "<宿主仓库的绝对路径>"
$stageRoot = "<仓库外的新暂存目录>"
$keyDirectory = "D:\secure-keys\it-tools"
$packagePath = "<仓库外的新安装包路径>"

corepack pnpm --dir $pluginRoot run stage --output $stageRoot
corepack pnpm --dir $hostRoot plugin:validate --source $stageRoot
corepack pnpm --dir $hostRoot plugin:keygen --key-id markdown-table-sample-publisher --output-directory $keyDirectory
corepack pnpm --dir $hostRoot plugin:build --source $stageRoot --private-key "$keyDirectory\markdown-table-sample-publisher.private.pem" --key-id markdown-table-sample-publisher --output $packagePath
```

`stage` 只复制根目录唯一清单、入口 HTML、JavaScript、CSS 和 SDK 类型文件。它拒绝覆盖已有暂存目录，并拒绝把目录放在本项目仓库内。清单只允许请求 `clipboard.write`。宿主的 `plugin:build` 默认在暂存目录检查 JavaScript，因此无需将测试配置或开发依赖复制到插件包。

私钥必须存放在安全目录，不能存放在任何项目仓库中，也不能提交或上传。构建命令会检查私钥路径和格式。签名包不能覆盖已有文件。请在桌面设置中独立核对签名者指纹，再信任签名者并安装插件。能力授权与签名者信任是两个独立操作。

## 开发约定

1. 修改行为时，先更新对应 Node 测试，再运行全部离线检查。
2. 保持单一根 `plugin.source.json`。不要在 `plugin/` 内维护第二份源码清单。
3. 保持插件能力最小化。普通格式化不调用宿主 API。只有用户触发复制时才申请剪贴板写入。
4. 不记录或持久化用户输入。不要把真实用户内容、密钥或敏感数据放入测试样例。
5. 保持 `plugin/types/` 与宿主 SDK 声明同步，并运行独立类型检查。
6. 暂存包采用白名单。不要把 `tests/`、`scripts/`、`node_modules/`、签名密钥或构建输出放入插件包。
7. 文档只描述已经实现和验证的行为。桌面 E2E、宿主验证、签名打包和真实安装分别报告结果。

## 授权标记说明

宿主界面中的蓝色插件标记说明此工具来自第三方插件。它不等同于签名者信任或能力授权。安装前请检查发布者、签名指纹、插件源码和请求的能力。
