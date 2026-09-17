#!/usr/bin/env node
/* build-inline-wasm.js
   sql-wasm.wasm را به یک فایل JS base64 تبدیل می‌کند.

   چرا؟ چون Electron صفحه را با loadFile() یعنی از origin «file://» باز می‌کند و
   Emscripten نمی‌تواند در آن حالت فایل .wasm را با fetch/XHR بخواند
   («both async and sync fetching of the wasm failed»). تگ <script> اما از
   file:// کار می‌کند، پس بایت‌ها را درون یک اسکریپت جاسازی می‌کنیم و مستقیماً
   به‌صورت wasmBinary به initSqlJs می‌دهیم — بدون هیچ درخواست شبکه‌ای.

   اجرا:  node vendor/sql.js/build-inline-wasm.js
*/
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const SRC = path.join(HERE, 'sql-wasm.wasm');
const OUT = path.join(HERE, 'sql-wasm.wasm.js');
const CHUNK = 4096;

const buf = fs.readFileSync(SRC);
const b64 = buf.toString('base64');
const parts = [];
for (let i = 0; i < b64.length; i += CHUNK) parts.push('"' + b64.slice(i, i + CHUNK) + '"');

const header = [
  '/* تولید خودکار — دستی ویرایش نکنید.',
  '   منبع: sql-wasm.wasm (sql.js 1.13.0) → base64',
  '   بازتولید: node vendor/sql.js/build-inline-wasm.js',
  '   علت وجود این فایل: Electron صفحه را از file:// بارگذاری می‌کند و',
  '   Emscripten در آن حالت نمی‌تواند .wasm را با fetch بخواند. */',
  'window.SQL_WASM_BASE64=[',
].join('\n');

fs.writeFileSync(OUT, header + '\n' + parts.join(',\n') + '\n].join("");\n');

const size = fs.statSync(OUT).size;
console.log(`✓ ${path.basename(OUT)} ساخته شد`);
console.log(`  wasm:     ${(buf.length / 1024).toFixed(1)} KB`);
console.log(`  base64:   ${(b64.length / 1024).toFixed(1)} KB`);
console.log(`  فایل JS:  ${(size / 1024).toFixed(1)} KB در ${parts.length} خط`);
console.log(`  sha256(wasm) = ${require('crypto').createHash('sha256').update(buf).digest('hex').slice(0, 16)}`);
