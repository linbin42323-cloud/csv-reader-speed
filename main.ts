// The harness driver: read every case from /input/cases.json, answer each with
// run() from solve.js, and write the answers array to /output/answers.json.
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in outside a container.
//
// Answers are serialized and written one case at a time, then dropped before the
// next case is parsed. The bytes are exactly JSON.stringify(answers), but the
// heap does not have to hold every answer (nor one giant output string) at once.

import { closeSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Match the house baseline's V8 setting, before solve.js is imported.
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: { text: unknown; header?: unknown }) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

type Case = { id: string; input: { text: unknown; header?: unknown } };

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as Case[];
const slots: (Case | null)[] = cases;

const fd = openSync(join(outputDir, 'answers.json'), 'w');
try {
  writeSync(fd, '[');
  let first = true;
  for (let i = 0; i < slots.length; i++) {
    const c = slots[i];
    if (c === null) continue;
    slots[i] = null; // let the input text be collected once this case is done
    const answer = run(c.input);
    if (!first) writeSync(fd, ',');
    first = false;
    writeSync(fd, JSON.stringify(answer));
  }
  writeSync(fd, ']');
} finally {
  closeSync(fd);
}
