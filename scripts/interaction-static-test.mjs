import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['app', 'components'];
const files = [];
const issues = [];

for (const root of ROOTS) walk(path.resolve(root));

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', 'coverage'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.tsx$/.test(entry.name)) files.push(target);
  }
}

function tagName(node) {
  return node.tagName?.getText?.().toLowerCase() ?? '';
}

function props(node) {
  return node.attributes?.properties ?? [];
}

function attrs(node) {
  return new Map(props(node).filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText().toLowerCase(), attribute]));
}

function hasSpread(node) {
  return props(node).some(ts.isJsxSpreadAttribute);
}

function literalValue(attribute) {
  if (!attribute?.initializer) return true;
  if (ts.isStringLiteral(attribute.initializer)) return attribute.initializer.text.trim();
  if (ts.isJsxExpression(attribute.initializer)) {
    const expression = attribute.initializer.expression;
    if (expression && ts.isStringLiteralLike(expression)) return expression.text.trim();
  }
  return undefined;
}

function isInsideForm(node) {
  let current = node.parent;
  while (current) {
    if ((ts.isJsxElement(current) && tagName(current.openingElement) === 'form') || (ts.isJsxSelfClosingElement(current) && tagName(current) === 'form')) return true;
    current = current.parent;
  }
  return false;
}

function emptyHandler(attribute) {
  if (!attribute?.initializer || !ts.isJsxExpression(attribute.initializer)) return false;
  const expression = attribute.initializer.expression;
  if (!expression || (!ts.isArrowFunction(expression) && !ts.isFunctionExpression(expression))) return false;
  return ts.isBlock(expression.body) && expression.body.statements.length === 0;
}

function propertyName(node) {
  if (!ts.isPropertyAssignment(node)) return '';
  return node.name.getText().replace(/^['"]|['"]$/g, '').toLowerCase();
}

function report(source, node, message) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  issues.push(`${path.relative(process.cwd(), source.fileName)}:${position.line + 1}:${position.character + 1} ${message}`);
}

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = tagName(node);
      const attributes = attrs(node);
      if (tag === 'button' && literalValue(attributes.get('type')) === 'button' && !hasSpread(node)) {
        const functional = attributes.has('onclick') || attributes.has('disabled') || attributes.has('formaction');
        if (!functional) report(source, node, 'button type="button" has no onClick, formAction, spread props, or explicit disabled state');
      }
      if (tag === 'button' && !attributes.has('type') && !hasSpread(node) && !isInsideForm(node)) {
        const functional = attributes.has('onclick') || attributes.has('disabled') || attributes.has('formaction');
        if (!functional) report(source, node, 'button has no type or handler and is outside a form');
      }
      const click = attributes.get('onclick');
      if (click && emptyHandler(click)) report(source, node, 'button/link has an empty onClick handler');
      if ((tag === 'a' || tag === 'link') && !hasSpread(node)) {
        const href = literalValue(attributes.get('href'));
        if (href === undefined && !attributes.has('href')) report(source, node, `${tag} has no href`);
        if (typeof href === 'string' && (!href || href === '#' || /^javascript:/i.test(href))) {
          report(source, node, `${tag} uses a placeholder href (${JSON.stringify(href)})`);
        }
      }
    }
    if (ts.isPropertyAssignment(node) && /^(action|onclick|on[a-z]+)$/.test(propertyName(node))) {
      const initializer = node.initializer;
      if ((ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) && ts.isBlock(initializer.body) && initializer.body.statements.length === 0) {
        report(source, node, `${node.name.getText()} is assigned an empty handler`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

console.log(`Interaction static audit: ${files.length} TSX files checked`);
if (issues.length) {
  console.error(`Interaction static audit: ${issues.length} issue(s)`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log('Interaction static audit: PASS');
