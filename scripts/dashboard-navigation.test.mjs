import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
let pathname = '/home/';
const linkProps = [];
const mocks = {
  'next/navigation': {
    usePathname: () => pathname,
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({}),
  },
  'next/dynamic': () => () => null,
  'next/link': ({ children, prefetch, ...props }) => {
    linkProps.push({ prefetch, ...props });
    return React.createElement('a', props, children);
  },
  '@/lib/next-path': { sanitizeNextPath: (path) => path },
};
function load(name) {
  const module = { exports: {} };
  const source = readFileSync(resolve(root, `components/dashboard/${name}.tsx`), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  runInNewContext(code, {
    module, exports: module.exports,
    require: (name) => mocks[name] ?? require(name),
    URLSearchParams,
  });
  return module.exports[name];
}
const DashboardNav = load('DashboardNav');
const DashboardFrame = load('DashboardFrame');
const items = [
  { key: 'home', label: 'Home', href: '/home/' },
  { key: 'teams', label: 'Teams', href: '/teams/' },
  { key: 'admin', label: 'Admin', children: [
    { key: 'teams', label: 'All Teams', href: '/admin/teams/' },
    { key: 'tickets', label: 'Support', href: '/admin/tickets/' },
  ] },
];

test('shared navigation follows each URL, including nested pages and browser history destinations', () => {
  for (const [path, expected] of [
    ['/home/', '/home/'], ['/teams/abc/', '/teams/'],
    ['/admin/teams/abc/', '/admin/teams/'], ['/admin/tickets/123/', '/admin/tickets/'],
    ['/home/', '/home/'], ['/teams-extra/', null],
  ]) {
    pathname = path;
    linkProps.length = 0;
    const html = renderToStaticMarkup(React.createElement(DashboardNav, { items }));
    assert.deepEqual(linkProps.filter((link) => link['aria-current'] === 'page').map((link) => link.href), expected ? [expected] : []);
    assert.ok(linkProps.every((link) => link.prefetch !== false), 'route skeleton prefetch is enabled');
    if (path.startsWith('/admin/')) assert.match(html, /aria-expanded="true"/);
  }
});

test('persistent frame applies technical styling only to admin destinations', () => {
  for (const [path, technical] of [['/admin/teams/', true], ['/home/', false], ['/admin', true], ['/administrator/', false]]) {
    pathname = path;
    const html = renderToStaticMarkup(React.createElement(DashboardFrame, { density: 'cozy' }, 'Content'));
    assert.equal(html.includes('data-surface="technical"'), technical);
    assert.match(html, /data-density="cozy"/);
  }
});
