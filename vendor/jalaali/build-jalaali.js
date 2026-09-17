#!/usr/bin/env node
/* build-jalaali.js
   jalaali-js (نسخه‌ی ESM از npm) را به یک IIFE مرورگری تبدیل می‌کند تا
   بتوان آن را با تگ <script> معمولی بارگذاری کرد — بدون bundler و بدون
   نیاز به اینترنت.

   پیش‌نیاز:  npm install jalaali-js@2.0.1
   اجرا:      node vendor/jalaali/build-jalaali.js
*/
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PKG_DIR = path.join(HERE, 'node_modules', 'jalaali-js');

// اگر پکیج محلی نبود، از مسیر پیش‌فرض پروژه‌ی راستی‌آزمایی بخوان
const candidates = [
  PKG_DIR,
  path.join(HERE, '..', '..', '..', '.verify', 'node_modules', 'jalaali-js'),
];
let pkg = null;
for (const c of candidates) if (fs.existsSync(path.join(c, 'dist', 'index.js'))) { pkg = c; break; }
if (!pkg) { console.error('✗ پکیج jalaali-js پیدا نشد. ابتدا: npm install jalaali-js@2.0.1'); process.exit(1); }

const pkgJson = JSON.parse(fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'));
const src = fs.readFileSync(path.join(pkg, 'dist', 'index.js'), 'utf8');

// استخراج نام‌های export‌شده
const m = src.match(/^export\s*\{([^}]+)\};?\s*$/m);
if (!m) { console.error('✗ عبارت export پیدا نشد — ساختار پکیج عوض شده؟'); process.exit(1); }
const names = m[1].split(',').map(s => s.trim()).filter(Boolean);

let body = src
  .replace(/^export\s*\{[^}]+\};?\s*$/m, '')          // حذف export
  .replace(/\/\/#\s*sourceMappingURL=.*$/m, '')        // حذف ارجاع sourcemap
  .trimEnd();

const out = `/*! jalaali-js v${pkgJson.version} — ${pkgJson.license} License
 *  https://github.com/jalaali/jalaali-js
 *  تبدیل‌شده به IIFE برای بارگذاری با تگ <script> (بدون bundler).
 *  بازتولید: node vendor/jalaali/build-jalaali.js
 *  این فایل دست‌نویس نیست؛ لطفاً مستقیماً ویرایشش نکنید. */
(function (global) {
'use strict';
${body}
global.jalaali = { ${names.join(', ')} };
})(typeof window !== 'undefined' ? window : globalThis);
`;

const dest = path.join(HERE, 'jalaali.js');
fs.writeFileSync(dest, out);

// کپی LICENSE برای رعایت مجوز MIT
const lic = path.join(pkg, 'LICENSE');
if (fs.existsSync(lic)) fs.copyFileSync(lic, path.join(HERE, 'LICENSE'));

console.log(`✓ jalaali.js ساخته شد (v${pkgJson.version})`);
console.log(`  exportها: ${names.join(', ')}`);
console.log(`  اندازه:   ${(fs.statSync(dest).size / 1024).toFixed(1)} KB`);
