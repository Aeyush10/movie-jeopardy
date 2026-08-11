#!/usr/bin/env node
// Regenerates data/questions.js from data/questions.json.
//
// Why this exists: browsers block fetch() of local .json files when you open
// index.html straight off the disk (file://). questions.js is the same content
// wrapped in a variable assignment so a plain <script> tag can load it.
//
// Edit data/questions.json, then run:  node sync.js

const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'data', 'questions.json');
const jsPath = path.join(__dirname, 'data', 'questions.js');

let raw;
try {
  raw = fs.readFileSync(jsonPath, 'utf8');
} catch (err) {
  console.error(`Could not read ${jsonPath}\n${err.message}`);
  process.exit(1);
}

try {
  JSON.parse(raw);
} catch (err) {
  console.error(`data/questions.json is not valid JSON:\n  ${err.message}`);
  process.exit(1);
}

const banner =
  '// AUTO-GENERATED from questions.json -- do not edit by hand.\n' +
  '// Edit data/questions.json, then run:  node sync.js\n';

fs.writeFileSync(jsPath, `${banner}window.JEOPARDY_BOARD = ${raw.trim()};\n`);
console.log('Wrote data/questions.js');
