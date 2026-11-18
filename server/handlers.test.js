// The context contract of server/handlers.js, checked without running a game.
//
// Splitting handle() into modules moved the bodies but left every name they use to a destructuring
// line and a hand-written object in index.js. Nothing in the build or in the other tests evaluates
// those bodies, so a name that is missing (or a value the body assigns to, which a destructured
// `const` cannot take) is silent until a player happens to send that message. Both of those shipped
// once; this suite is what makes the next one a failing test instead.
//
// TypeScript's parser does the work: the file is parsed, identifiers are collected, and a name that
// is neither declared in the file nor a JavaScript global is reported with its line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const read = (name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const handlersSrc = read('./handlers.js');
const indexSrc = read('./index.js');
const handlersFile = ts.createSourceFile('handlers.js', handlersSrc, ts.ScriptTarget.ESNext, true);
const indexFile = ts.createSourceFile('index.js', indexSrc, ts.ScriptTarget.ESNext, true);

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

// Every exported domain object (`export const focus = { … }`).
function domains(sf) {
  const out = new Map();
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      if (!ts.isObjectLiteralExpression(declaration.initializer)) continue;
      const methods = declaration.initializer.properties.filter((p) => ts.isMethodDeclaration(p));
      if (methods.length) out.set(declaration.name.text, methods);
    }
  }
  return out;
}

// `export const ctxKeys = [ … ]`.
function ctxKeys(sf) {
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === 'ctxKeys' && declaration.initializer
        && ts.isArrayLiteralExpression(declaration.initializer)) {
        return declaration.initializer.elements.filter(ts.isStringLiteral).map((e) => e.text);
      }
    }
  }
  return null;
}

// Names the destructuring at the top of a method binds.
function boundNames(method) {
  const first = method.body?.statements?.[0];
  if (!first || !ts.isVariableStatement(first)) return null;
  const declaration = first.declarationList.declarations[0];
  if (!declaration || !ts.isObjectBindingPattern(declaration.name)) return null;
  return declaration.name.elements.map((e) => (e.propertyName ?? e.name).getText());
}

// Every name declared anywhere in the file (const/let/var, params, functions, classes, binding
// patterns). A method using a name bound in another method would slip through, which is harmless:
// the checks below are about names the module does not declare at all.
function declared(sf) {
  const names = new Set();
  const addBinding = (name) => {
    if (!name) return;
    if (ts.isIdentifier(name)) { names.add(name.text); return; }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      for (const element of name.elements) if (ts.isBindingElement(element)) addBinding(element.name);
    }
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) addBinding(node.name);
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return names;
}

// Identifier references: not member names (`a.b`), object keys (`{ b: 1 }`), declaration names,
// or the property half of a destructuring (`{ a: b } = c`).
function references(sf) {
  const out = [];
  const visit = (node) => {
    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isName = (parent && (
        (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isPropertySignature(parent) && parent.name === node)
        || (ts.isMethodDeclaration(parent) && parent.name === node)
        || (ts.isFunctionDeclaration(parent) && parent.name === node)
        || (ts.isVariableDeclaration(parent) && parent.name === node)
        || (ts.isParameter(parent) && parent.name === node)
        || (ts.isBindingElement(parent) && (parent.propertyName === node || parent.name === node))
        || (ts.isImportSpecifier(parent) && parent.name === node)
        || (ts.isLabeledStatement(parent) && parent.label === node)
      ));
      if (!isName) out.push(node);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

// Assignments: `x = …`, `x += …`, `x++`, `--x`.
function assignments(sf) {
  const out = [];
  const visit = (node) => {
    if (ts.isBinaryExpression(node) && ts.isIdentifier(node.left)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) out.push(node.left);
    if ((ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) && ts.isIdentifier(node.operand)
      && (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) out.push(node.operand);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

// The object literal index.js hands each handler (`const ctx = { … }`).
function ctxLiteral(sf) {
  let found = null;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ctx'
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) found = node.initializer;
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

const keys = ctxKeys(handlersFile);
const byDomain = domains(handlersFile);

test('the context contract exists and every handler binds all of it', () => {
  assert.ok(keys?.length, 'ctxKeys is exported as an array of names');
  assert.ok(byDomain.size >= 2, 'focus and chat are exported as objects of handlers');
  for (const [domain, methods] of byDomain) {
    for (const method of methods) {
      const bound = boundNames(method);
      assert.ok(bound, `${domain}.${method.name.getText()} starts by destructuring its context`);
      assert.deepEqual(bound, keys, `${domain}.${method.name.getText()} binds exactly ctxKeys`);
    }
  }
});

test('no handler mentions a name the module does not declare', () => {
  const known = declared(handlersFile);
  const globals = new Set([...Object.getOwnPropertyNames(globalThis), 'undefined', 'NaN', 'Infinity']);
  const missing = [...new Set(references(handlersFile)
    .filter((node) => !known.has(node.text) && !globals.has(node.text))
    .map((node) => `${node.text} (line ${lineOf(handlersFile, node)})`))];
  assert.deepEqual(missing, [], 'every name a handler uses comes from the context or is a global');
});

test('no handler assigns to a context name', () => {
  // A destructured context value is a `const`: `nextId++` throws at runtime. A value a body has to
  // change arrives as a function instead (see `newId` in index.js).
  const written = [...new Set(assignments(handlersFile)
    .filter((node) => keys.includes(node.text))
    .map((node) => `${node.text} (line ${lineOf(handlersFile, node)})`))];
  assert.deepEqual(written, [], 'a handler never writes to the context it is given');
});

test('index.js provides every name the handlers bind', () => {
  const literal = ctxLiteral(indexFile);
  assert.ok(literal, 'handle() builds its context in an object literal');
  const provided = new Set(literal.properties.map((p) => (p.name ?? p).getText()));
  const absent = keys.filter((name) => !provided.has(name));
  assert.deepEqual(absent, [], 'the dispatcher passes every name ctxKeys promises');
});
