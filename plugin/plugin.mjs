import { formatterErrors, formatPipeTable } from './formatter.mjs';

/** @typedef {'left' | 'center' | 'right' | 'default'} Alignment */
/** @typedef {Exclude<keyof typeof copy.en, 'errors'>} CopyKey */
/** @typedef {keyof typeof copy.en.errors} FormatterErrorCode */
const copy = {
  en: {
    eyebrow: 'Third-party plugin sample',
    title: 'Markdown Table Formatter',
    intro: 'Normalize a simple pipe table in this window. Your input stays here and is never saved.',
    inputHeading: 'Input table',
    inputHelp: 'Use one header row, one separator row, and optional data rows. Put an unescaped pipe at each row edge.',
    inputLabel: 'Markdown pipe table',
    inputPlaceholder: '| Name | Value |\n| :--- | ---: |\n| Alice | 10 |',
    outputHeading: 'Formatted output',
    outputHelp: 'The tool formats table structure. It does not render Markdown or interpret cell contents.',
    outputLabel: 'Result',
    outputPlaceholder: 'A formatted table will appear here.',
    copyHint: 'You can select the result and press Ctrl+C at any time.',
    permissionGranted: 'Clipboard permission: approved. Copying is available after you select the button.',
    permissionDenied: 'Clipboard permission: not approved. You can still select the result and press Ctrl+C.',
    permissionUnknown: 'Clipboard permission state is unavailable. You can still select the result and press Ctrl+C.',
    alignmentHeading: 'Column alignment',
    alignmentHelp: 'Choose an alignment for each column. The default keeps Markdown default alignment.',
    alignmentDefault: 'Default',
    alignmentLeft: 'Left',
    alignmentCenter: 'Center',
    alignmentRight: 'Right',
    alignmentLabel: 'Column {column} alignment',
    selectButton: 'Select result',
    copyButton: 'Copy with desktop permission',
    privacy: 'Processing stays in this isolated plugin window. The plugin does not save input, call a network service, or log cell contents.',
    waiting: 'Waiting for input',
    ready: '{rows} data rows · {columns} columns',
    invalid: 'Table needs attention',
    empty: 'Enter a pipe table to format.',
    copied: 'Result copied.',
    denied: 'Clipboard access is not approved. Select the result and press Ctrl+C.',
    failed: 'The desktop could not copy the result. Select it and press Ctrl+C.',
    selected: 'Result selected. Press Ctrl+C to copy it manually.',
    errors: {
      'input-too-long': 'The input exceeds the 100,000 character limit.',
      'missing-header': 'Add a header row and a separator row.',
      'too-many-rows': 'The table exceeds the 5,000 data row limit.',
      'blank-line': 'Blank lines inside a table are not supported.',
      'invalid-outer-pipes': 'Every row must start and end with an unescaped pipe character (|).',
      'invalid-column-count': 'Use between 1 and 100 columns.',
      'separator-column-count': 'The separator row must have the same number of cells as the header.',
      'invalid-separator': 'Each separator cell must contain at least three hyphens, with optional edge colons.',
      'invalid-alignment': 'Select a valid alignment for each table column.',
      'invalid-row': 'Row {row} must start and end with an unescaped pipe character (|).',
      'row-column-count': 'Row {row} has {actual} cells; expected {expected}.',
    },
  },
  zh: {
    eyebrow: '第三方插件示例',
    title: 'Markdown 表格整理器',
    intro: '在此窗口规范简单的管道表格。输入只在当前窗口处理，不会自动保存。',
    inputHeading: '输入表格',
    inputHelp: '输入一行表头、一行分隔符和可选的数据行。每行必须以未转义的竖线开头和结尾。',
    inputLabel: 'Markdown 管道表格',
    inputPlaceholder: '| 名称 | 数值 |\n| :--- | ---: |\n| Alice | 10 |',
    outputHeading: '整理结果',
    outputHelp: '工具只整理表格结构，不渲染 Markdown，也不解释单元格内容。',
    outputLabel: '结果',
    outputPlaceholder: '整理后的表格会显示在这里。',
    copyHint: '你可以随时选中结果并按 Ctrl+C。',
    permissionGranted: '剪贴板权限：已授权。点击复制按钮后即可复制。',
    permissionDenied: '剪贴板权限：未授权。你仍可选中结果并按 Ctrl+C。',
    permissionUnknown: '无法读取剪贴板权限状态。你仍可选中结果并按 Ctrl+C。',
    alignmentHeading: '列对齐方式',
    alignmentHelp: '为每列选择对齐方式。“默认”会保留 Markdown 的默认对齐。',
    alignmentDefault: '默认',
    alignmentLeft: '左对齐',
    alignmentCenter: '居中',
    alignmentRight: '右对齐',
    alignmentLabel: '第 {column} 列对齐方式',
    selectButton: '选中结果',
    copyButton: '使用桌面授权复制',
    privacy: '处理只在隔离的插件窗口内进行。插件不会保存输入、访问网络或记录单元格内容。',
    waiting: '等待输入',
    ready: '{rows} 行数据 · {columns} 列',
    invalid: '请检查表格',
    empty: '输入管道表格后即可整理。',
    copied: '已复制结果。',
    denied: '尚未授权剪贴板。请选中结果并按 Ctrl+C。',
    failed: '桌面无法复制结果。请选中结果并按 Ctrl+C。',
    selected: '已选中结果。请按 Ctrl+C 手动复制。',
    errors: {
      'input-too-long': '输入超过 100,000 个字符。',
      'missing-header': '请提供表头行和分隔符行。',
      'too-many-rows': '数据行不能超过 5,000 行。',
      'blank-line': '表格中不能包含空行。',
      'invalid-outer-pipes': '每行必须以未转义的竖线（|）开头和结尾。',
      'invalid-column-count': '列数必须在 1 到 100 列之间。',
      'separator-column-count': '分隔符行的列数必须与表头相同。',
      'invalid-separator': '每个分隔符单元格必须至少包含三个连字符；两端可选冒号。',
      'invalid-alignment': '请为每一列选择有效的对齐方式。',
      'invalid-row': '第 {row} 行必须以未转义的竖线（|）开头和结尾。',
      'row-column-count': '第 {row} 行有 {actual} 个单元格，预期为 {expected} 个。',
    },
  },
};

const language = navigator.language.toLowerCase().startsWith('zh') ? copy.zh : copy.en;
const input = /** @type {HTMLTextAreaElement} */ (document.querySelector('#table-input'));
const output = /** @type {HTMLTextAreaElement} */ (document.querySelector('#table-output'));
const status = /** @type {HTMLSpanElement} */ (document.querySelector('#table-status'));
const summary = /** @type {HTMLSpanElement} */ (document.querySelector('#table-summary'));
const error = /** @type {HTMLParagraphElement} */ (document.querySelector('#table-error'));
const alignmentControls = /** @type {HTMLDivElement} */ (document.querySelector('#alignment-controls'));
const alignmentCard = /** @type {HTMLElement} */ (document.querySelector('#alignment-card'));
const copyResult = /** @type {HTMLParagraphElement} */ (document.querySelector('#copy-result'));
const selectButton = /** @type {HTMLButtonElement} */ (document.querySelector('#select-output'));
const copyButton = /** @type {HTMLButtonElement} */ (document.querySelector('#copy-output'));
const permissionStatus = /** @type {HTMLParagraphElement} */ (document.querySelector('#permission-status'));
const alignmentNames = /** @type {const} */ (['default', 'left', 'center', 'right']);
const alignmentCopyKeys = /** @type {Record<Alignment, CopyKey>} */ ({
  default: 'alignmentDefault',
  left: 'alignmentLeft',
  center: 'alignmentCenter',
  right: 'alignmentRight',
});
/** @type {Alignment[]} */
let currentAlignments = [];
let copyPending = false;
/** @type {string | null} */
let currentTableSignature = null;

document.documentElement.lang = language === copy.zh ? 'zh-CN' : 'en';
for (const element of document.querySelectorAll('[data-copy]')) {
  const key = /** @type {CopyKey | undefined} */ (/** @type {HTMLElement} */ (element).dataset.copy);
  if (key && typeof language[key] === 'string') {
    element.textContent = language[key];
  }
}
for (const element of document.querySelectorAll('[data-copy-placeholder]')) {
  const key = /** @type {CopyKey | undefined} */ (/** @type {HTMLElement} */ (element).dataset.copyPlaceholder);
  if (key && typeof language[key] === 'string') {
    element.setAttribute('placeholder', language[key]);
  }
}

const permissionSnapshot = window.itTools.permissions;
permissionStatus.textContent = !permissionSnapshot
  ? language.permissionUnknown
  : permissionSnapshot.grantedCapabilities.includes('clipboard.write')
    ? language.permissionGranted
    : permissionSnapshot.requestedCapabilities.includes('clipboard.write')
      ? language.permissionDenied
      : language.permissionUnknown;

/**
 * @param {{errorCode: string, errorParameters?: Record<string, number>}} result
 */
function localizeError(result) {
  const code = /** @type {FormatterErrorCode} */ (result.errorCode);
  const message = language.errors[code] ?? language.invalid;
  return message.replace(/\{(row|actual|expected)\}/g, (placeholder, key) => (
    String(result.errorParameters?.[key] ?? placeholder)
  ));
}

/** @param {readonly Alignment[]} alignments */
function renderAlignmentControls(alignments) {
  currentAlignments = [...alignments];
  alignmentControls.replaceChildren();

  for (const [index, alignment] of alignments.entries()) {
    const label = document.createElement('label');
    const select = document.createElement('select');
    select.dataset.columnAlignment = String(index);
    label.htmlFor = `column-alignment-${index}`;
    label.textContent = language.alignmentLabel.replace('{column}', String(index + 1));
    select.id = label.htmlFor;

    for (const name of alignmentNames) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = language[alignmentCopyKeys[name]];
      option.selected = name === alignment;
      select.append(option);
    }

    select.addEventListener('change', () => {
      currentAlignments[index] = /** @type {Alignment} */ (select.value);
      updateOutput();
    });
    alignmentControls.append(label, select);
  }
  alignmentControls.hidden = alignments.length === 0;
  alignmentCard.hidden = alignments.length === 0;
}

/** @param {string} source */
function getTableSignature(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim());
  while (lines[0] === '') {
    lines.shift();
  }
  return lines.length >= 2 ? `${lines[0]}\n${lines[1]}` : null;
}

function updateOutput() {
  const result = formatPipeTable(input.value);
  summary.textContent = '';
  error.hidden = true;
  selectButton.disabled = !result.ok;
  copyButton.disabled = !result.ok || copyPending;
  if (!result.ok) {
    output.value = '';
    currentTableSignature = null;
    renderAlignmentControls([]);
    status.textContent = input.value.trim().length === 0 ? language.waiting : language.invalid;
    status.dataset.state = input.value.trim().length === 0 ? 'pending' : 'invalid';
    if (input.value.trim().length > 0) {
      error.textContent = localizeError(result);
      error.hidden = false;
    }
    if (!copyPending) {
      copyResult.textContent = language.copyHint;
    }
    return;
  }

  const tableSignature = getTableSignature(input.value);
  if (tableSignature !== currentTableSignature) {
    renderAlignmentControls(result.alignments);
    currentTableSignature = tableSignature;
  }
  const formatted = formatPipeTable(input.value, { alignments: currentAlignments });
  if (!formatted.ok) {
    error.textContent = localizeError(formatted);
    error.hidden = false;
    output.value = '';
    selectButton.disabled = true;
    copyButton.disabled = true;
    status.textContent = language.invalid;
    status.dataset.state = 'invalid';
    return;
  }

  output.value = formatted.output;
  status.textContent = language.ready.replace('{rows}', String(result.rows)).replace('{columns}', String(result.columns));
  status.dataset.state = 'valid';
  summary.textContent = `${result.rows} × ${result.columns}`;
  if (!copyPending) {
    copyResult.textContent = language.copyHint;
  }
}

input.addEventListener('input', updateOutput);
selectButton.addEventListener('click', () => {
  output.focus();
  output.select();
  copyResult.textContent = language.selected;
});
copyButton.addEventListener('click', async () => {
  const result = formatPipeTable(input.value, { alignments: currentAlignments });
  if (!result.ok || copyPending) {
    return;
  }

  copyPending = true;
  copyButton.disabled = true;
  copyResult.textContent = '';
  try {
    await window.itTools.capabilities.clipboard.writeText(result.output);
    copyResult.textContent = language.copied;
  }
  catch (reason) {
    copyResult.textContent = reason instanceof window.itTools.PluginApiError && reason.code === 'permission-denied'
      ? language.denied
      : language.failed;
  }
  finally {
    copyPending = false;
    copyButton.disabled = !formatPipeTable(input.value, { alignments: currentAlignments }).ok;
    if (copyResult.textContent === '') {
      copyResult.textContent = language.copyHint;
    }
  }
});

updateOutput();
