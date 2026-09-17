const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

/* مسیر userData را صریحاً قفل می‌کنیم.
   Electron به‌صورت پیش‌فرض از app.getName() استفاده می‌کند که productName را
   به name ترجیح می‌دهد. پس اگر فقط یک productName اضافه می‌کردیم، مسیر
   config.json عوض می‌شد و پوشه‌ی دیتابیسی که کاربر پیش‌تر انتخاب کرده از
   یاد می‌رفت (فایل داده سالم می‌ماند، ولی کاربر مجبور به انتخاب دوباره
   می‌شد). با pin کردن مسیر، نام نمایشی برنامه بدون اثر جانبی قابل تغییر است.
   باید پیش از هر فراخوانی app.getPath('userData') اجرا شود. */
const USER_DATA_DIR_NAME = 'shima-academy-panel';
app.setPath('userData', path.join(app.getPath('appData'), USER_DATA_DIR_NAME));

let mainWindow;
let dbFolder = null;
let lastLoadSource = null;   // 'file' | 'backup' | null

const configFile = () => path.join(app.getPath('userData'), 'config.json');
const dbFile     = () => dbFolder ? path.join(dbFolder, 'shima-academy.sqlite') : null;
const bakFile    = () => dbFile() ? dbFile() + '.bak' : null;
const tmpFile    = () => dbFile() ? dbFile() + '.tmp' : null;

/* هدر معتبر SQLite: «SQLite format 3\0» در ۱۶ بایت اول */
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'latin1');
function isValidSqlite(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 100 && buf.subarray(0, 16).equals(SQLITE_MAGIC);
}

function readConfig() {
  try {
    const c = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
    if (c.dbFolder && fs.existsSync(c.dbFolder)) dbFolder = c.dbFolder;
  } catch {}
}

function writeConfig() {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(configFile(), JSON.stringify({ dbFolder }, null, 2), 'utf8');
}

/* نوشتن اتمیک: اول در فایل موقت + fsync، بعد rename.
   اگر وسط کار کرش یا قطعی برق رخ دهد، فایل اصلی دست‌نخورده می‌ماند.
   پیش از جایگزینی، نسخه‌ی فعلی به .bak منتقل می‌شود. */
function atomicWrite(file, buf) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + '.tmp';

  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, buf);
    fs.fsyncSync(fd);           // اطمینان از رسیدن داده به دیسک
  } finally {
    fs.closeSync(fd);
  }

  if (fs.existsSync(file)) {
    try { fs.copyFileSync(file, file + '.bak'); } catch {}
  }

  fs.renameSync(tmp, file);     // اتمیک روی همان فایل‌سیستم
  return file;
}

function readDbBuffer() {
  const main = dbFile(), bak = bakFile();
  if (main && fs.existsSync(main)) {
    try {
      const buf = fs.readFileSync(main);
      if (isValidSqlite(buf)) { lastLoadSource = 'file'; return buf; }
      console.warn('[db] فایل اصلی هدر معتبر SQLite ندارد — تلاش روی نسخه‌ی پشتیبان');
    } catch (e) {
      console.warn('[db] خواندن فایل اصلی ناموفق بود:', e.message);
    }
  }
  if (bak && fs.existsSync(bak)) {
    try {
      const buf = fs.readFileSync(bak);
      if (isValidSqlite(buf)) { lastLoadSource = 'backup'; return buf; }
      console.warn('[db] نسخه‌ی پشتیبان هم معتبر نیست');
    } catch (e) {
      console.warn('[db] خواندن نسخه‌ی پشتیبان ناموفق بود:', e.message);
    }
  }
  lastLoadSource = null;
  return null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1050, minHeight: 700,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('db:get', async () => {
  const buf = readDbBuffer();
  return buf ? buf.toString('base64') : null;
});

ipcMain.handle('db:save', async (_e, base64) => {
  if (!dbFolder) return { ok: false, reason: 'NO_FOLDER' };
  try {
    const buf = Buffer.from(base64, 'base64');
    if (!isValidSqlite(buf)) return { ok: false, reason: 'INVALID_PAYLOAD' };
    atomicWrite(dbFile(), buf);
    return { ok: true, file: dbFile() };
  } catch (e) {
    console.error('[db] ذخیره‌سازی ناموفق بود:', e);
    return { ok: false, reason: 'WRITE_FAILED', message: e.message };
  }
});

ipcMain.handle('db:choose-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'انتخاب پوشه ذخیره‌سازی دیتابیس',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  dbFolder = result.filePaths[0];
  writeConfig();
  const buf = readDbBuffer();
  return { cancelled: false, folder: dbFolder, data: buf ? buf.toString('base64') : null };
});

ipcMain.handle('db:info', async () => {
  const main = dbFile(), bak = bakFile();
  let size = null, backupExists = false;
  if (main && fs.existsSync(main)) { try { size = fs.statSync(main).size; } catch {} }
  if (bak && fs.existsSync(bak)) backupExists = true;
  return { folder: dbFolder, file: main, size, backupExists, source: lastLoadSource };
});

ipcMain.handle('app:choose-initial-folder', async () => {
  if (dbFolder) return { folder: dbFolder };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'پوشه دیتابیس آکادمی را انتخاب کنید',
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  dbFolder = result.filePaths[0];
  writeConfig();
  return { folder: dbFolder };
});

app.whenReady().then(() => {
  readConfig();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
