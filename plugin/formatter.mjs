const maximumInputCharacters = 100_000;
const maximumRows = 5_000;
const maximumColumns = 100;

export const formatterErrors = Object.freeze({
  inputTooLong: 'input-too-long',
  missingHeader: 'missing-header',
  tooManyRows: 'too-many-rows',
  blankLine: 'blank-line',
  invalidOuterPipes: 'invalid-outer-pipes',
  invalidColumnCount: 'invalid-column-count',
  separatorColumnCount: 'separator-column-count',
  invalidSeparator: 'invalid-separator',
  invalidAlignment: 'invalid-alignment',
  invalidRow: 'invalid-row',
  rowColumnCount: 'row-column-count',
});

/**
 * Format a bounded pipe table without decoding or rewriting Markdown cell text.
 * Supports only required outer pipes, one separator row, and the alignment
 * markers defined below. It is not a general Markdown or GFM parser.
 * @param {string} input
 * @param {{alignments?: readonly ('left' | 'center' | 'right' | 'default')[]}} options
 * @returns {{ok: true, output: string, rows: number, columns: number, alignments: ('left' | 'center' | 'right' | 'default')[]} | {ok: false, error: string, errorCode: string, errorParameters?: Record<string, number>}}
 */
export function formatPipeTable(input, options = {}) {
  if (input.length > maximumInputCharacters) {
    return failure(formatterErrors.inputTooLong);
  }

  const lines = input.replace(/\r\n?/g, '\n').split('\n').map(line => line.trim());
  while (lines[0] === '') {
    lines.shift();
  }
  while (lines.at(-1) === '') {
    lines.pop();
  }

  if (lines.length < 2) {
    return failure(formatterErrors.missingHeader);
  }
  if (lines.length > maximumRows + 2) {
    return failure(formatterErrors.tooManyRows);
  }
  if (lines.some(line => line === '')) {
    return failure(formatterErrors.blankLine);
  }

  const header = parsePipeRow(lines[0]);
  const separator = parsePipeRow(lines[1]);
  if (!header || !separator) {
    return failure(formatterErrors.invalidOuterPipes);
  }
  if (header.length === 0 || header.length > maximumColumns) {
    return failure(formatterErrors.invalidColumnCount);
  }
  if (separator.length !== header.length) {
    return failure(formatterErrors.separatorColumnCount);
  }

  const sourceAlignments = separator.map(parseAlignment);
  if (sourceAlignments.some(alignment => alignment === null)) {
    return failure(formatterErrors.invalidSeparator);
  }
  const alignments = /** @type {('left' | 'center' | 'right' | 'default')[]} */ (sourceAlignments);
  const selectedAlignments = options.alignments === undefined ? alignments : options.alignments;
  if (
    !Array.isArray(selectedAlignments)
    || selectedAlignments.length !== header.length
    || selectedAlignments.some(alignment => !['left', 'center', 'right', 'default'].includes(alignment))
  ) {
    return failure(formatterErrors.invalidAlignment);
  }

  const dataRows = [];
  for (let index = 2; index < lines.length; index += 1) {
    const row = parsePipeRow(lines[index]);
    if (!row) {
      return failure(formatterErrors.invalidRow, { row: index + 1 });
    }
    if (row.length !== header.length) {
      return failure(formatterErrors.rowColumnCount, {
        row: index + 1,
        actual: row.length,
        expected: header.length,
      });
    }
    dataRows.push(row);
  }

  return {
    ok: true,
    output: [
      renderRow(header),
      renderRow(selectedAlignments.map(renderAlignment)),
      ...dataRows.map(renderRow),
    ].join('\n'),
    rows: dataRows.length,
    columns: header.length,
    alignments: [...selectedAlignments],
  };
}

/**
 * Split rows using odd/even backslash parity. Cell text remains byte-for-byte
 * unchanged except for trimming whitespace at each cell edge.
 * @param {string} line
 * @returns {string[] | null}
 */
function parsePipeRow(line) {
  if (!line.startsWith('|') || !line.endsWith('|') || isEscapedAt(line, line.length - 1)) {
    return null;
  }

  const cells = [];
  let cell = '';
  for (let index = 1; index < line.length - 1; index += 1) {
    if (line[index] === '|' && !isEscapedAt(line, index)) {
      cells.push(cell.trim());
      cell = '';
    }
    else {
      cell += line[index];
    }
  }
  cells.push(cell.trim());
  return cells;
}

/**
 * @param {string} line
 * @param {number} index
 */
function isEscapedAt(line, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

/**
 * @param {string} cell
 * @returns {'left' | 'center' | 'right' | 'default' | null}
 */
function parseAlignment(cell) {
  const match = /^(:)?-{3,}(:)?$/.exec(cell);
  if (!match) {
    return null;
  }
  if (match[1] && match[2]) {
    return 'center';
  }
  if (match[1]) {
    return 'left';
  }
  if (match[2]) {
    return 'right';
  }
  return 'default';
}

/**
 * @param {'left' | 'center' | 'right' | 'default'} alignment
 */
function renderAlignment(alignment) {
  if (alignment === 'default') {
    return '---';
  }
  if (alignment === 'center') {
    return ':---:';
  }
  if (alignment === 'right') {
    return '---:';
  }
  return ':---';
}

/** @param {readonly string[]} cells */
function renderRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

/**
 * @param {string} errorCode
 * @param {Record<string, number>} [errorParameters]
 * @returns {{ok: false, error: string, errorCode: string, errorParameters?: Record<string, number>}}
 */
function failure(errorCode, errorParameters) {
  return {
    ok: false,
    error: errorCode,
    errorCode,
    ...(errorParameters === undefined ? {} : { errorParameters }),
  };
}
