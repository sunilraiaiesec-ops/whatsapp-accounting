"use strict";

/**
 * Hand-rolled parser for the tutorials/*.md frontmatter format.
 *
 * WHY NOT A REAL YAML LIBRARY: there is no package.json at the repo root,
 * and the only YAML parser available (`js-yaml`) lives inside
 * `ledger/node_modules` as someone else's transitive dependency — reaching
 * into it would be fragile (removed by `npm prune`, moved by a lockfile
 * change, etc.) and adding a new root-level dependency just for this script
 * felt heavier than necessary. Every tutorials/*.md file is written by hand
 * to a small, consistent subset of YAML (see tutorials/schema.json), so a
 * ~150-line dedicated parser for exactly that subset is simpler and more
 * transparent than pulling in a general-purpose YAML engine. If the
 * frontmatter grammar grows beyond what's handled here, switch to `js-yaml`
 * (`npm install js-yaml` in a new root package.json) rather than extending
 * this parser further.
 *
 * Supported grammar (exactly what every tutorials/*.md file uses):
 *   key: value                — bare scalar (tutorial_id)
 *   key: "quoted value"        — double-quoted scalar
 *   key: |                     — literal block scalar (multi-paragraph text)
 *     ...indented lines...
 *   key:                       — one of the three nested forms below
 *     - "value"                 (a) array of quoted strings   (prerequisites)
 *     childKey: "value"         (b) flat map of quoted strings (test_data)
 *     - step: 1                 (c) array of {step, <field>} objects
 *       action: '...'               (step_by_step_actions / screen_to_show /
 *                                     voiceover_script / on_screen_highlights)
 *
 * Single-quoted scalars use the YAML convention of doubling the quote
 * character to escape it (e.g. `'today''s date'` -> `today's date`) — this
 * repo only ever needed that for apostrophes inside single-quoted strings,
 * so that's the only escape this parser handles.
 */

const OBJECT_ARRAY_KEYS = new Set([
  "step_by_step_actions",
  "screen_to_show",
  "voiceover_script",
  "on_screen_highlights",
]);

/** Splits `---\n<frontmatter>\n---\n<body>` into { data, body }. */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("No YAML frontmatter block found (expected leading `---` ... `---`).");
  }
  const [, fmText, body] = match;
  const lines = fmText.split(/\r?\n/);
  const data = {};
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === "") {
      i++;
      continue;
    }
    const keyMatch = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!keyMatch) {
      throw new Error(`Unrecognized frontmatter line ${i + 1}: ${JSON.stringify(lines[i])}`);
    }
    const key = keyMatch[1];
    const rest = keyMatch[2];
    i++;

    if (rest === "|") {
      const { value, next } = readBlockScalar(lines, i);
      data[key] = value;
      i = next;
    } else if (rest === "") {
      const { value, next } = readNested(lines, i, key);
      data[key] = value;
      i = next;
    } else {
      data[key] = unquote(rest.trim());
    }
  }

  return { data, body: body.trim() };
}

/** Reads a `key: |` literal block scalar starting at `lines[start]`. */
function readBlockScalar(lines, start) {
  const collected = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() !== "" && !/^\s/.test(line)) break; // dedent -> new top-level key
    collected.push(line.startsWith("  ") ? line.slice(2) : line.trimEnd());
    i++;
  }
  while (collected.length > 0 && collected[collected.length - 1] === "") collected.pop();
  return { value: collected.join("\n"), next: i };
}

/** Reads the nested block that follows a bare `key:` line. */
function readNested(lines, start, key) {
  let i = start;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length || !/^\s/.test(lines[i])) {
    return { value: OBJECT_ARRAY_KEYS.has(key) ? [] : {}, next: i };
  }

  if (/^\s*-\s+step:\s*\d+/.test(lines[i])) {
    return readObjectArray(lines, i);
  }
  if (/^\s*-\s+/.test(lines[i])) {
    return readScalarArray(lines, i);
  }
  return readFlatMap(lines, i);
}

/** `  - "value"` repeated — used for `prerequisites`. */
function readScalarArray(lines, start) {
  const arr = [];
  let i = start;
  while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
    const content = lines[i].replace(/^\s*-\s+/, "");
    arr.push(unquote(content.trim()));
    i++;
  }
  return { value: arr, next: i };
}

/** `  key: "value"` repeated — used for `test_data`. */
function readFlatMap(lines, start) {
  const obj = {};
  let i = start;
  while (i < lines.length && /^\s{2,}[a-zA-Z_][a-zA-Z0-9_]*:\s*/.test(lines[i]) && !/^\s*-/.test(lines[i])) {
    const m = lines[i].match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    obj[m[1]] = unquote(m[2].trim());
    i++;
  }
  return { value: obj, next: i };
}

/**
 * `  - step: N` followed by `    <field>: '...'` repeated — used for
 * step_by_step_actions / screen_to_show / voiceover_script / on_screen_highlights.
 */
function readObjectArray(lines, start) {
  const arr = [];
  let i = start;
  while (i < lines.length && /^\s*-\s+step:\s*\d+/.test(lines[i])) {
    const stepMatch = lines[i].match(/step:\s*(\d+)/);
    const item = { step: Number(stepMatch[1]) };
    i++;
    if (i < lines.length) {
      const fieldMatch = lines[i].match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (fieldMatch) {
        item[fieldMatch[1]] = unquote(fieldMatch[2].trim());
        i++;
      }
    }
    arr.push(item);
  }
  return { value: arr, next: i };
}

/** Strips a quoted scalar's delimiters and un-escapes doubled delimiters. */
function unquote(text) {
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      const inner = text.slice(1, -1);
      return inner.split(first + first).join(first);
    }
  }
  return text;
}

module.exports = { parseFrontmatter };
