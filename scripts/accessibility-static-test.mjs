import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['app', 'components'];
const files = [];
for (const root of ROOTS) walk(path.resolve(root));

const issues = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.next', 'coverage'].includes(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.tsx$/.test(entry.name)) files.push(target);
  }
}

function tagName(node) {
  return node.tagName?.getText?.() ?? '';
}

function attributes(node) {
  return new Map((node.attributes?.properties ?? []).filter(ts.isJsxAttribute).map((attribute) => [attribute.name.getText().toLowerCase(), attribute]));
}

function hasAccessibleAttribute(node) {
  const attrs = attributes(node);
  return ['aria-label', 'aria-labelledby', 'title'].some((name) => attrs.has(name));
}

function expressionHasName(expression) {
  if (!expression) return false;
  if (ts.isParenthesizedExpression(expression) || ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) return expressionHasName(expression.expression);
  if (ts.isStringLiteralLike(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text.trim().length > 0;
  if (ts.isTemplateExpression(expression)) return true;
  if (ts.isIdentifier(expression)) return !/^icon$/i.test(expression.text);
  if (ts.isPropertyAccessExpression(expression)) return !/(icon)$/i.test(expression.name.text);
  if (ts.isElementAccessExpression(expression)) return true;
  if (ts.isConditionalExpression(expression)) return expressionHasName(expression.whenTrue) || expressionHasName(expression.whenFalse);
  if (ts.isBinaryExpression(expression)) return expressionHasName(expression.left) || expressionHasName(expression.right);
  if (ts.isCallExpression(expression)) return true;
  if (ts.isJsxElement(expression)) return childrenHaveName(expression.children);
  if (ts.isJsxFragment(expression)) return childrenHaveName(expression.children);
  return false;
}

function childrenHaveName(children = []) {
  for (const child of children) {
    if (ts.isJsxText(child) && child.getText().replace(/\s+/g, ' ').trim()) return true;
    if (ts.isJsxExpression(child) && expressionHasName(child.expression)) return true;
    if (ts.isJsxElement(child)) {
      const nestedTag = tagName(child.openingElement).toLowerCase();
      if (!['svg', 'path', 'span'].includes(nestedTag) && childrenHaveName(child.children)) return true;
      if (childrenHaveName(child.children)) return true;
    }
  }
  return false;
}

function report(source, node, message) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  issues.push(`${path.relative(process.cwd(), source.fileName)}:${position.line + 1}:${position.character + 1} ${message}`);
}

for (const file of files) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const tag = tagName(node.openingElement).toLowerCase();
      if ((tag === 'button' || tag === 'a') && !hasAccessibleAttribute(node.openingElement) && !childrenHaveName(node.children)) {
        report(source, node.openingElement, `${tag} has no accessible name`);
      }
      if (attributes(node.openingElement).has('role') && node.openingElement.getText().includes('dialog')) {
        const attrs = attributes(node.openingElement);
        if (!attrs.has('aria-label') && !attrs.has('aria-labelledby')) report(source, node.openingElement, 'dialog has no accessible label');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

console.log(`Accessibility static audit: ${files.length} TSX files checked`);
if (issues.length) {
  console.error(`Accessibility static audit: ${issues.length} issue(s)`);
  for (const issue of issues) console.error(`  - ${issue}`);
  process.exit(1);
}
console.log('Accessibility static audit: PASS');
