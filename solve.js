// csv-reader-speed-01 entry: a fast, dependency-free reimplementation of
// csv-reader 1.0.0's readCsv. It makes one left-to-right pass over the text,
// finds the unquoted common path's delimiter with indexOf plus cached next CR
// and LF positions, never uses regular expressions, and slices fields out of
// the original text.
//
// The parsing state lives in module-level variables so the helper functions are
// ordinary top-level functions (V8 can optimize them once and reuse them across
// calls). run() resets every one of those variables before it starts, so no
// state survives from one call to the next.
//
// The semantics are csv-reader 1.0.0's, including its broken-row policy:
//   - a leading U+FEFF is dropped;
//   - records end at LF or CRLF, and a line with no characters is no record;
//   - outside quotes a lone CR is dropped (stray_cr);
//   - a quoted field keeps its commas and line breaks (CRLF and lone CR become
//     LF), doubled quotes become one quote, and text after the closing quote is
//     appended (quote_junk); a never-closing quote is a literal (unterminated_quote);
//   - quotes inside unquoted fields are literal, and fields are never trimmed;
//   - rows are padded (short_row) or cut (long_row) to the first record's width;
//   - each error carries {code, line, row}, with line counting LF, CRLF and lone
//     CR inside quoted fields.

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;
const BOM = 0xFEFF;

const END_COMMA = 0;
const END_LINE = 1;
const END_TEXT = 2;

// Parsing state, reset by run().
let text = '';
let len = 0;
let pos = 0; // the next character to read
let line = 1; // the line that character is on
let recordLine = 1; // the line the current record starts on
let recordRow = null; // the current record's index in rows, or null for the header
let endedCode = END_TEXT;
let addedCount = 0;
let errors = [];

// Cached next positions of CR and LF at or after pos. Each is found once with
// indexOf and only ever moves forward as pos does, so the total search cost is
// linear. -1 means no such character is left after the point it was searched
// from, so that cache never searches again. run() resets both; the one place
// pos moves backwards (the unterminated-quote fallback) resets them too.
let nextCR = -1;
let nextLF = -1;

// Advances a cache past pos after a scan that skipped over it.
function syncCrLf() {
  if (nextCR >= 0 && nextCR < pos) nextCR = text.indexOf('\r', pos);
  if (nextLF >= 0 && nextLF < pos) nextLF = text.indexOf('\n', pos);
}

// Finds both cache positions from pos; used on entry and after a rewind.
function resetCrLf() {
  nextCR = text.indexOf('\r', pos);
  nextLF = text.indexOf('\n', pos);
}

// Reads an unquoted field from pos. The common path finds the earliest of the
// next comma and the cached next CR/LF, slices the run out of the text, and
// dispatches on the delimiter; a lone CR takes the slow path.
function readField() {
  const start = pos;
  syncCrLf();
  const comma = text.indexOf(',', start);
  let end = comma;
  let atLineEnd = false;
  if (nextCR >= 0 && (end < 0 || nextCR < end)) end = nextCR;
  if (nextLF >= 0 && (end < 0 || nextLF < end)) {
    end = nextLF;
    atLineEnd = true;
  }
  if (end < 0) {
    pos = len;
    endedCode = END_TEXT;
    return text.slice(start, len);
  }
  if (atLineEnd) {
    const value = text.slice(start, end);
    pos = end + 1;
    line++;
    endedCode = END_LINE;
    return value;
  }
  if (end === comma) {
    const value = text.slice(start, end);
    pos = end + 1;
    endedCode = END_COMMA;
    return value;
  }
  // The earliest delimiter is a CR: CRLF ends the line, a lone CR is stray.
  if (end + 1 < len && text.charCodeAt(end + 1) === LF) {
    const value = text.slice(start, end);
    pos = end + 2;
    line++;
    endedCode = END_LINE;
    return value;
  }
  pos = end;
  return readFieldStray(start);
}

// The slow unquoted path: at least one lone CR is dropped as stray_cr.
function readFieldStray(start) {
  let value = text.slice(start, pos);
  while (true) {
    // pos is on a lone CR: drop it, record the error, then keep reading.
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    pos++;
    const segStart = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === COMMA) break;
      if (c < 14 && (c === LF || c === CR)) break;
      pos++;
    }
    value += text.slice(segStart, pos);
    if (pos >= len) {
      endedCode = END_TEXT;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === COMMA) {
      pos++;
      endedCode = END_COMMA;
      return value;
    }
    if (c === LF) {
      pos++;
      line++;
      endedCode = END_LINE;
      return value;
    }
    if (pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line++;
      endedCode = END_LINE;
      return value;
    }
    // Another lone CR: loop.
  }
}

// Appends an unquoted tail to prefix, dropping lone CRs as stray_cr. When track
// is set, records how many characters were kept (for quote_junk).
function readAppend(prefix, track) {
  let value = prefix;
  let added = 0;
  while (true) {
    const segStart = pos;
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === COMMA) break;
      if (c < 14 && (c === LF || c === CR)) break;
      pos++;
    }
    const segLen = pos - segStart;
    if (segLen > 0) {
      value += text.slice(segStart, pos);
      if (track) added += segLen;
    }
    if (pos >= len) {
      endedCode = END_TEXT;
      if (track) addedCount = added;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === COMMA) {
      pos++;
      endedCode = END_COMMA;
      if (track) addedCount = added;
      return value;
    }
    if (c === LF) {
      pos++;
      line++;
      endedCode = END_LINE;
      if (track) addedCount = added;
      return value;
    }
    if (pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line++;
      endedCode = END_LINE;
      if (track) addedCount = added;
      return value;
    }
    // Lone CR: dropped.
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
    pos++;
  }
}

// Reads a quoted field whose opening quote is at pos.
function readQuoted() {
  const open = pos;
  const openLine = line;
  pos++; // the opening quote
  const contentStart = pos;
  let runStart = pos;
  let value = null; // null until the first escape or inner line break
  let closed = false;

  // Fast path: the field's next quote is its closing quote, no CR or LF comes
  // before it, and it is not the first quote of a doubled quote. The whole
  // value is then one slice of the original text.
  syncCrLf();
  const close = text.indexOf('"', pos);
  if (
    close >= 0 &&
    (nextCR < 0 || nextCR >= close) &&
    (nextLF < 0 || nextLF >= close) &&
    !(close + 1 < len && text.charCodeAt(close + 1) === QUOTE)
  ) {
    value = text.slice(pos, close);
    pos = close + 1;
    closed = true;
  } else {
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === QUOTE) {
        if (pos + 1 < len && text.charCodeAt(pos + 1) === QUOTE) {
          if (value === null) value = text.slice(contentStart, pos) + '"';
          else value += text.slice(runStart, pos) + '"';
          pos += 2;
          runStart = pos;
          continue;
        }
        if (value === null) value = text.slice(contentStart, pos);
        else value += text.slice(runStart, pos);
        pos++;
        closed = true;
        break;
      }
      if (c === CR) {
        // CRLF and a lone CR inside quotes are each one LF.
        const seg = text.slice(runStart, pos);
        if (value === null) value = seg + '\n';
        else value += seg + '\n';
        line++;
        pos += pos + 1 < len && text.charCodeAt(pos + 1) === LF ? 2 : 1;
        runStart = pos;
        continue;
      }
      if (c === LF) {
        const seg = text.slice(runStart, pos);
        if (value === null) value = seg + '\n';
        else value += seg + '\n';
        line++;
        pos++;
        runStart = pos;
        continue;
      }
      pos++;
    }
  }
  if (!closed) {
    // The quote never closes: it is a literal character, and the text after it
    // is read again as unquoted, starting just after the opening quote.
    pos = open + 1;
    line = openLine;
    resetCrLf();
    errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
    return readAppend('"', false);
  }
  if (pos >= len) {
    endedCode = END_TEXT;
    return value;
  }
  const c = text.charCodeAt(pos);
  if (c === COMMA) {
    pos++;
    endedCode = END_COMMA;
    return value;
  }
  if (c === LF) {
    pos++;
    line++;
    endedCode = END_LINE;
    return value;
  }
  if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
    pos += 2;
    line++;
    endedCode = END_LINE;
    return value;
  }
  // What follows the closing quote is appended as it stands.
  const out = readAppend(value, true);
  if (addedCount > 0) {
    errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }
  return out;
}

/**
 * csv-reader 1.0.0's answer for one case's input: {columns, rows, errors}.
 * @param {{text: unknown, header?: unknown}} input
 */
export function run(input) {
  text = String(input.text);
  len = text.length;
  const header = input.header === true;
  errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  pos = 0;
  line = 1;
  if (len > 0 && text.charCodeAt(0) === BOM) pos = 1;
  resetCrLf();
  recordLine = 1;
  recordRow = null;
  endedCode = END_TEXT;
  addedCount = 0;

  while (true) {
    // A line left with no characters is no record.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos++;
        line++;
      } else if (c === CR && pos + 1 < len && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    const isHeader = header && columns === null;
    recordRow = isHeader ? null : rows.length;

    const fields = [];
    let lastQuoted = false;
    let more;
    do {
      if (text.charCodeAt(pos) === QUOTE) {
        lastQuoted = true;
        fields.push(readQuoted());
      } else {
        lastQuoted = false;
        fields.push(readField());
      }
      more = endedCode === END_COMMA;
    } while (more);

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (isHeader) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
