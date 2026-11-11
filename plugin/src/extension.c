#include <stdint.h>

#define REQUEST_CAPACITY (16u * 1024u)
#define INPUT_CAPACITY (12u * 1024u)
#define RESULT_CAPACITY (16u * 1024u)
#define MAX_COLUMNS 16u
#define MAX_ROWS 64u
#define MAX_CELL_BYTES 256u

typedef struct {
  uint32_t start;
  uint32_t end;
} CellSpan;

static uint8_t request_buffer[REQUEST_CAPACITY];
static uint8_t input_buffer[INPUT_CAPACITY];
static uint8_t result_buffer[RESULT_CAPACITY];

static int is_json_space(uint8_t value);
static int read_table_input(const uint8_t *request, uint32_t length, uint32_t *output_length);
static int decode_json_string(const uint8_t *source, uint32_t length, uint32_t *cursor, uint8_t *target, uint32_t *target_length);
static int parse_row(const uint8_t *text, uint32_t length, uint32_t *cursor, CellSpan *cells, uint32_t *cell_count);
static void trim_span(const uint8_t *text, CellSpan *span);
static int is_escaped(const uint8_t *text, uint32_t position);
static int validate_separator(const uint8_t *text, CellSpan span);
static uint64_t format_table(const uint8_t *text, uint32_t length);
static uint64_t make_table_error(const char *message);
static int append_literal(uint32_t *offset, const char *literal, uint32_t length);
static int append_json_string_span(uint32_t *offset, const uint8_t *text, CellSpan span);
static int append_json_string_literal(uint32_t *offset, const char *text);
static int append_column_id(uint32_t *offset, uint32_t index);
static uint64_t pack_result(uint32_t pointer, uint32_t length);

// 宿主每次执行都会新建模块实例，因此固定缓冲区足以承载一次命令调用。
uint32_t alloc(uint32_t size) {
  if (size == 0u || size > REQUEST_CAPACITY) {
    return UINT32_MAX;
  }
  return (uint32_t)(uintptr_t)request_buffer;
}

// 固定缓冲区不需要回收；保留该导出以满足公开 ABI。
void free(uint32_t pointer, uint32_t length) {
  (void)pointer;
  (void)length;
}

// 读取 Markdown 管道表格，并返回宿主统一渲染的 table 结果。
uint64_t execute(uint32_t pointer, uint32_t length) {
  if (pointer != (uint32_t)(uintptr_t)request_buffer || length > REQUEST_CAPACITY) {
    return make_table_error("Invalid request buffer.");
  }

  uint32_t input_length = 0u;
  if (!read_table_input(request_buffer, length, &input_length)) {
    return make_table_error("The request must contain a table string.");
  }
  return format_table(input_buffer, input_length);
}

static int read_table_input(const uint8_t *request, uint32_t length, uint32_t *output_length) {
  static const uint8_t key[] = "\"table\"";
  const uint32_t key_length = (uint32_t)(sizeof(key) - 1u);
  for (uint32_t start = 0u; start + key_length < length; start += 1u) {
    uint32_t matched = 0u;
    while (matched < key_length && request[start + matched] == key[matched]) {
      matched += 1u;
    }
    if (matched != key_length) {
      continue;
    }
    uint32_t cursor = start + key_length;
    while (cursor < length && is_json_space(request[cursor])) {
      cursor += 1u;
    }
    if (cursor >= length || request[cursor] != ':') {
      continue;
    }
    cursor += 1u;
    return decode_json_string(request, length, &cursor, input_buffer, output_length);
  }
  return 0;
}

static int decode_json_string(const uint8_t *source, uint32_t length, uint32_t *cursor, uint8_t *target, uint32_t *target_length) {
  while (*cursor < length && is_json_space(source[*cursor])) {
    *cursor += 1u;
  }
  if (*cursor >= length || source[*cursor] != '"') {
    return 0;
  }
  *cursor += 1u;
  uint32_t output = 0u;
  while (*cursor < length) {
    const uint8_t value = source[*cursor];
    *cursor += 1u;
    if (value == '"') {
      *target_length = output;
      return 1;
    }
    if (value < 0x20u || output >= INPUT_CAPACITY) {
      return 0;
    }
    if (value != '\\') {
      target[output++] = value;
      continue;
    }
    if (*cursor >= length) {
      return 0;
    }
    const uint8_t escape = source[*cursor];
    *cursor += 1u;
    if (escape == '"' || escape == '\\' || escape == '/') {
      target[output++] = escape;
    }
    else if (escape == 'n') {
      target[output++] = '\n';
    }
    else if (escape == 'r') {
      target[output++] = '\r';
    }
    else if (escape == 't') {
      target[output++] = '\t';
    }
    else if (escape == 'b') {
      target[output++] = '\b';
    }
    else if (escape == 'f') {
      target[output++] = '\f';
    }
    else {
      return 0;
    }
  }
  return 0;
}

static int parse_row(const uint8_t *text, uint32_t length, uint32_t *cursor, CellSpan *cells, uint32_t *cell_count) {
  if (*cursor >= length) {
    return 0;
  }
  const uint32_t line_start = *cursor;
  uint32_t line_end = line_start;
  while (line_end < length && text[line_end] != '\n') {
    line_end += 1u;
  }
  uint32_t first = line_start;
  uint32_t last = line_end;
  while (first < last && (text[first] == ' ' || text[first] == '\t' || text[first] == '\r')) {
    first += 1u;
  }
  while (last > first && (text[last - 1u] == ' ' || text[last - 1u] == '\t' || text[last - 1u] == '\r')) {
    last -= 1u;
  }
  if (first >= last || text[first] != '|' || text[last - 1u] != '|' || is_escaped(text, last - 1u)) {
    return 0;
  }

  uint32_t count = 0u;
  uint32_t cell_start = first + 1u;
  for (uint32_t position = cell_start; position < last - 1u; position += 1u) {
    if (text[position] == '|' && !is_escaped(text, position)) {
      if (count >= MAX_COLUMNS) {
        return 0;
      }
      cells[count++] = (CellSpan){ cell_start, position };
      trim_span(text, &cells[count - 1u]);
      cell_start = position + 1u;
    }
  }
  if (count >= MAX_COLUMNS) {
    return 0;
  }
  cells[count++] = (CellSpan){ cell_start, last - 1u };
  trim_span(text, &cells[count - 1u]);
  *cell_count = count;
  *cursor = line_end < length ? line_end + 1u : length;
  return count > 0u;
}

static void trim_span(const uint8_t *text, CellSpan *span) {
  while (span->start < span->end && (text[span->start] == ' ' || text[span->start] == '\t' || text[span->start] == '\r')) {
    span->start += 1u;
  }
  while (span->end > span->start && (text[span->end - 1u] == ' ' || text[span->end - 1u] == '\t' || text[span->end - 1u] == '\r')) {
    span->end -= 1u;
  }
}

static int is_escaped(const uint8_t *text, uint32_t position) {
  uint32_t backslashes = 0u;
  while (position > 0u && text[position - 1u] == '\\') {
    position -= 1u;
    backslashes += 1u;
  }
  return (backslashes % 2u) != 0u;
}

static int validate_separator(const uint8_t *text, CellSpan span) {
  if (span.end - span.start > MAX_CELL_BYTES) {
    return 0;
  }
  uint32_t cursor = span.start;
  uint32_t end = span.end;
  if (cursor < end && text[cursor] == ':') {
    cursor += 1u;
  }
  if (end > cursor && text[end - 1u] == ':') {
    end -= 1u;
  }
  uint32_t hyphens = 0u;
  while (cursor < end) {
    if (text[cursor] != '-') {
      return 0;
    }
    hyphens += 1u;
    cursor += 1u;
  }
  return hyphens >= 3u;
}

static uint64_t format_table(const uint8_t *text, uint32_t length) {
  CellSpan headers[MAX_COLUMNS];
  CellSpan separator[MAX_COLUMNS];
  CellSpan rows[MAX_ROWS][MAX_COLUMNS];
  uint32_t header_count = 0u;
  uint32_t separator_count = 0u;
  uint32_t cursor = 0u;
  if (!parse_row(text, length, &cursor, headers, &header_count)) {
    return make_table_error("Add a header row and a separator row.");
  }
  if (!parse_row(text, length, &cursor, separator, &separator_count)
    || separator_count != header_count) {
    return make_table_error("The separator row must match the header.");
  }
  for (uint32_t index = 0u; index < separator_count; index += 1u) {
    if (!validate_separator(text, separator[index])) {
      return make_table_error("Each separator cell needs at least three hyphens.");
    }
  }

  uint32_t row_count = 0u;
  while (cursor < length) {
    if (row_count >= MAX_ROWS || !parse_row(text, length, &cursor, rows[row_count], &separator_count)
      || separator_count != header_count) {
      return make_table_error("The table exceeds the supported row or column shape.");
    }
    for (uint32_t index = 0u; index < header_count; index += 1u) {
      if (rows[row_count][index].end - rows[row_count][index].start > MAX_CELL_BYTES) {
        return make_table_error("A table cell exceeds the supported size.");
      }
    }
    row_count += 1u;
  }

  uint32_t offset = 0u;
  if (!append_literal(&offset, "{\"kind\":\"table\",\"value\":{\"columns\":[", (uint32_t)(sizeof("{\"kind\":\"table\",\"value\":{\"columns\":[") - 1u))) {
    return make_table_error("The formatted table is too large.");
  }
  for (uint32_t index = 0u; index < header_count; index += 1u) {
    if (index > 0u && !append_literal(&offset, ",", 1u)) {
      return make_table_error("The formatted table is too large.");
    }
    if (!append_literal(&offset, "{\"id\":\"column", (uint32_t)(sizeof("{\"id\":\"column") - 1u))
      || !append_column_id(&offset, index + 1u)
      || !append_literal(&offset, "\",\"label\":", (uint32_t)(sizeof("\",\"label\":") - 1u))) {
      return make_table_error("The formatted table is too large.");
    }
    if (headers[index].start == headers[index].end) {
      if (!append_json_string_literal(&offset, "Column")) {
        return make_table_error("The formatted table is too large.");
      }
    }
    else if (!append_json_string_span(&offset, text, headers[index])) {
      return make_table_error("The formatted table is too large.");
    }
    if (!append_literal(&offset, "}", 1u)) {
      return make_table_error("The formatted table is too large.");
    }
  }
  if (!append_literal(&offset, "],\"rows\":[", (uint32_t)(sizeof("],\"rows\":[") - 1u))) {
    return make_table_error("The formatted table is too large.");
  }
  for (uint32_t row = 0u; row < row_count; row += 1u) {
    if (row > 0u && !append_literal(&offset, ",", 1u)) {
      return make_table_error("The formatted table is too large.");
    }
    if (!append_literal(&offset, "[", 1u)) {
      return make_table_error("The formatted table is too large.");
    }
    for (uint32_t column = 0u; column < header_count; column += 1u) {
      if (column > 0u && !append_literal(&offset, ",", 1u)) {
        return make_table_error("The formatted table is too large.");
      }
      if (!append_json_string_span(&offset, text, rows[row][column])) {
        return make_table_error("The formatted table is too large.");
      }
    }
    if (!append_literal(&offset, "]", 1u)) {
      return make_table_error("The formatted table is too large.");
    }
  }
  if (!append_literal(&offset, "]}}", 3u)) {
    return make_table_error("The formatted table is too large.");
  }
  return pack_result((uint32_t)(uintptr_t)result_buffer, offset);
}

static uint64_t make_table_error(const char *message) {
  uint32_t offset = 0u;
  if (!append_literal(&offset, "{\"kind\":\"table\",\"value\":{\"columns\":[{\"id\":\"error\",\"label\":\"Error\"}],\"rows\":[[", (uint32_t)(sizeof("{\"kind\":\"table\",\"value\":{\"columns\":[{\"id\":\"error\",\"label\":\"Error\"}],\"rows\":[[") - 1u))
    || !append_json_string_literal(&offset, message)
    || !append_literal(&offset, "]]}}", 4u)) {
    offset = 0u;
    append_literal(&offset, "{\"kind\":\"table\",\"value\":{\"columns\":[],\"rows\":[]}}", (uint32_t)(sizeof("{\"kind\":\"table\",\"value\":{\"columns\":[],\"rows\":[]}}") - 1u));
  }
  return pack_result((uint32_t)(uintptr_t)result_buffer, offset);
}

static int append_literal(uint32_t *offset, const char *literal, uint32_t length) {
  if (*offset + length > RESULT_CAPACITY) {
    return 0;
  }
  for (uint32_t index = 0u; index < length; index += 1u) {
    result_buffer[*offset + index] = (uint8_t)literal[index];
  }
  *offset += length;
  return 1;
}

static int append_json_string_span(uint32_t *offset, const uint8_t *text, CellSpan span) {
  if (!append_literal(offset, "\"", 1u)) {
    return 0;
  }
  for (uint32_t index = span.start; index < span.end; index += 1u) {
    const uint8_t value = text[index];
    if (value == '"' || value == '\\') {
      if (!append_literal(offset, "\\", 1u) || !append_literal(offset, (const char *)&value, 1u)) {
        return 0;
      }
    }
    else if (value == '\n' || value == '\r' || value == '\t') {
      const char *escape = value == '\n' ? "n" : value == '\r' ? "r" : "t";
      if (!append_literal(offset, "\\", 1u) || !append_literal(offset, escape, 1u)) {
        return 0;
      }
    }
    else if (value < 0x20u) {
      return 0;
    }
    else if (!append_literal(offset, (const char *)&value, 1u)) {
      return 0;
    }
  }
  return append_literal(offset, "\"", 1u);
}

static int append_json_string_literal(uint32_t *offset, const char *text) {
  CellSpan span = { 0u, 0u };
  while (text[span.end] != '\0') {
    span.end += 1u;
  }
  return append_json_string_span(offset, (const uint8_t *)text, span);
}

static int append_column_id(uint32_t *offset, uint32_t index) {
  char digits[3];
  uint32_t count = 0u;
  do {
    digits[count++] = (char)('0' + index % 10u);
    index /= 10u;
  } while (index > 0u && count < sizeof(digits));
  while (count > 0u) {
    count -= 1u;
    if (!append_literal(offset, &digits[count], 1u)) {
      return 0;
    }
  }
  return 1;
}

static int is_json_space(uint8_t value) {
  return value == ' ' || value == '\n' || value == '\r' || value == '\t';
}

// ABI 将结果指针放入高 32 位，将 UTF-8 JSON 字节数放入低 32 位。
static uint64_t pack_result(uint32_t pointer, uint32_t length) {
  return ((uint64_t)pointer << 32u) | (uint64_t)length;
}
