import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../lib/security/csv.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const compiledModule = { exports: {} };
vm.runInNewContext(compiled, { module: compiledModule, exports: compiledModule.exports });
const { escapeCsvCell, createCsv } = compiledModule.exports;

assert.equal(escapeCsvCell('Sakura Sushi'), '"Sakura Sushi"');
assert.equal(escapeCsvCell('A "quoted" name'), '"A ""quoted"" name"');
assert.equal(escapeCsvCell('=HYPERLINK("https://evil.example")'), '"\'=HYPERLINK(""https://evil.example"")"');
assert.equal(escapeCsvCell('  +cmd'), '"\'  +cmd"');
assert.equal(escapeCsvCell('\t@SUM(1,1)'), '"\'\t@SUM(1,1)"');
assert.match(createCsv([['Order', 'Restaurant'], ['1', '-2+3']]), /^\uFEFF/);
assert.match(createCsv([['Order'], ['=1+1']]), /"'=1\+1"/);

console.log('CSV security: PASS (7/7)');
