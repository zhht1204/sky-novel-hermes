export type DiffSegment = { type: 'equal' | 'insert' | 'delete'; value: string };

// Guard against the O(n*m) cost of character-level diffing very large replaced blocks.
const MAX_CHAR_DIFF = 8000;

/**
 * Builds an inline "track changes" diff between the original and corrected chapter text.
 * Unchanged text is returned as `equal`, removed text as `delete`, and added text as `insert`.
 * Line-level alignment runs first; changed blocks are then refined at the character level so
 * typo- and punctuation-level fixes are highlighted in place.
 */
export function buildInlineDiff(original: string, corrected: string): DiffSegment[] {
  const lineOps = lcsDiff(splitKeepNewline(original), splitKeepNewline(corrected));
  const segments: DiffSegment[] = [];
  let delBuf: string[] = [];
  let insBuf: string[] = [];

  const flush = () => {
    if (delBuf.length === 0 && insBuf.length === 0) return;
    const delText = delBuf.join('');
    const insText = insBuf.join('');
    if (delText && insText) {
      if (delText.length + insText.length <= MAX_CHAR_DIFF) {
        for (const seg of lcsDiff(Array.from(delText), Array.from(insText))) segments.push(seg);
      } else {
        segments.push({ type: 'delete', value: delText });
        segments.push({ type: 'insert', value: insText });
      }
    } else if (delText) {
      segments.push({ type: 'delete', value: delText });
    } else if (insText) {
      segments.push({ type: 'insert', value: insText });
    }
    delBuf = [];
    insBuf = [];
  };

  for (const op of lineOps) {
    if (op.type === 'equal') {
      flush();
      segments.push({ type: 'equal', value: op.value });
    } else if (op.type === 'delete') {
      delBuf.push(op.value);
    } else {
      insBuf.push(op.value);
    }
  }
  flush();
  return coalesce(segments);
}

export function diffStats(segments: DiffSegment[]): { changes: number; added: number; removed: number } {
  let changes = 0;
  let added = 0;
  let removed = 0;
  let inChange = false;
  for (const seg of segments) {
    if (seg.type === 'equal') {
      inChange = false;
      continue;
    }
    if (!inChange) changes += 1;
    inChange = true;
    if (seg.type === 'insert') added += seg.value.length;
    else removed += seg.value.length;
  }
  return { changes, added, removed };
}

function splitKeepNewline(text: string): string[] {
  const lines: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') {
      lines.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) lines.push(text.slice(start));
  return lines;
}

function lcsDiff(a: string[], b: string[]): DiffSegment[] {
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = [];
  for (let i = 0; i <= n; i += 1) dp.push(new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    const ai = a[i]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = ai === b[j]! ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const result: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i]! === b[j]!) {
      result.push({ type: 'equal', value: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      result.push({ type: 'delete', value: a[i]! });
      i += 1;
    } else {
      result.push({ type: 'insert', value: b[j]! });
      j += 1;
    }
  }
  while (i < n) result.push({ type: 'delete', value: a[i++]! });
  while (j < m) result.push({ type: 'insert', value: b[j++]! });
  return result;
}

function coalesce(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    if (!seg.value) continue;
    const last = out[out.length - 1];
    if (last && last.type === seg.type) last.value += seg.value;
    else out.push({ type: seg.type, value: seg.value });
  }
  return out;
}
