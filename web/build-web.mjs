// Turns the published web page (web/calypso-asset.html) into the offline page the
// Android app loads: adds the document skeleton, swaps Google Fonts and the cdnjs
// Excel library for bundled copies, and injects the phone-storage shim.
// Run: node web/build-web.mjs   (needs `npm install` in web/ once)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'app', 'src', 'main', 'assets', 'www');
const nm = path.join(here, 'node_modules');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });

const fonts = [
  ['Figtree', '@fontsource/figtree/files/figtree-latin-400-normal.woff2', 400],
  ['Figtree', '@fontsource/figtree/files/figtree-latin-500-normal.woff2', 500],
  ['Figtree', '@fontsource/figtree/files/figtree-latin-600-normal.woff2', 600],
  ['Bricolage Grotesque', '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-600-normal.woff2', 600],
  ['Bricolage Grotesque', '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-700-normal.woff2', 700],
  ['IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 400],
  ['IBM Plex Mono', '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 500],
];
const faces = fonts.map(([family, file, weight]) => {
  const name = path.basename(file);
  fs.copyFileSync(path.join(nm, file), path.join(out, 'fonts', name));
  return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;font-display:swap;src:url(fonts/${name}) format("woff2")}`;
}).join('\n');
fs.copyFileSync(path.join(nm, 'xlsx/dist/xlsx.full.min.js'), path.join(out, 'xlsx.full.min.js'));
fs.copyFileSync(path.join(here, 'android-shim.js'), path.join(out, 'android-shim.js'));

let html = fs.readFileSync(path.join(here, 'calypso-asset.html'), 'utf8');
const swap = (re, to, what) => { if (!re.test(html)) throw new Error('Could not find ' + what); html = html.replace(re, to); };
swap(/<link rel="preconnect"[^>]*>\s*/, '', 'font preconnect');
swap(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, `<style>\n${faces}\n</style>`, 'Google Fonts link');
swap(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/xlsx\/[^"]+"><\/script>/,
  '<script src="android-shim.js"></script>\n<script src="xlsx.full.min.js"></script>', 'xlsx script');

// The same skeleton claude.ai wraps published pages in.
const head = '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}' +
  'body{margin:0;font:14px/1.4 system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>';
fs.writeFileSync(path.join(out, 'index.html'), head + html + '</body></html>');
console.log('Wrote', path.join(out, 'index.html'));
