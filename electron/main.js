'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, protocol, net } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { spawn, execSync } = require('child_process');
const { getFfmpegPath } = require('./ffmpeg');

const isDev = !app.isPackaged;

// ── Helpers ───────────────────────────────────────────────────────────────────

function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.mp4': 'video/mp4', '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.mts': 'video/mp2t', '.m2ts': 'video/mp2t', '.ts': 'video/mp2t',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
  })[ext] || 'video/mp4';
}

// Convert a Node.js Readable stream to a Web ReadableStream for Response body.
function nodeReadableToWeb(nodeStream) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data',  chunk => controller.enqueue(chunk instanceof Buffer ? chunk : Buffer.from(chunk)));
      nodeStream.on('end',   ()    => controller.close());
      nodeStream.on('error', err   => controller.error(err));
    },
    cancel() { nodeStream.destroy(); },
  });
}

// Must be called before app is ready — marks 'media' as a secure, streamable
// scheme so <video> and fetch() in the renderer can use it with range requests.
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
]);

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:    1400,
    height:   900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../build/index.html'));
  }
}

// ── Custom media:// protocol ──────────────────────────────────────────────────
// The renderer may be loaded from http://localhost:3000 (dev) which blocks
// file:// access via the browser security model.  We register a privileged
// 'media' protocol that proxies to file:// so <video> can stream local files
// including range requests (needed for seeking).
app.whenReady().then(() => {
  // Serve local video files with proper byte-range support so <video> can seek.
  // net.fetch(file://) doesn't honour Range headers, so we implement it manually.
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(new URL(request.url).pathname);

    let stat;
    try { stat = fs.statSync(filePath); }
    catch { return new Response('Not found', { status: 404 }); }

    const fileSize = stat.size;
    const mimeType = mimeForPath(filePath);
    const rangeHeader = request.headers.get('Range');

    if (rangeHeader) {
      // Parse "bytes=start-end"
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      const nodeStream = fs.createReadStream(filePath, { start, end });
      const body = nodeReadableToWeb(nodeStream);

      return new Response(body, {
        status:  206,
        headers: {
          'Content-Type':   mimeType,
          'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
          'Accept-Ranges':  'bytes',
        },
      });
    }

    // Full file
    const nodeStream = fs.createReadStream(filePath);
    const body = nodeReadableToWeb(nodeStream);
    return new Response(body, {
      status:  200,
      headers: {
        'Content-Type':   mimeType,
        'Content-Length': String(fileSize),
        'Accept-Ranges':  'bytes',
      },
    });
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: File dialogs ─────────────────────────────────────────────────────────

ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'Videos', extensions: ['mp4','mov','avi','mkv','webm','hevc','m4v','mts','m2ts','ts','flv','wmv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  return canceled ? null : filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_, { defaultName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName,
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  return canceled ? null : filePath;
});

// ── IPC: FFmpeg ───────────────────────────────────────────────────────────────

ipcMain.handle('ffmpeg:check', async () => {
  const bin = getFfmpegPath();
  try {
    execSync(`"${bin}" -version`, { stdio: 'ignore' });
    return true;
  } catch {
    // fallback: try bare 'ffmpeg' in PATH
    try { execSync('ffmpeg -version', { stdio: 'ignore' }); return true; }
    catch { return false; }
  }
});

/**
 * Run a single ffmpeg command. Streams progress events back to the renderer.
 * args: string[]  — full argument list (no 'ffmpeg' prefix)
 * jobId: string   — echoed in every progress event so the renderer can correlate
 */
ipcMain.handle('ffmpeg:run', async (event, { args, jobId }) => {
  const bin = getFfmpegPath();
  return new Promise((resolve) => {
    const proc = spawn(bin, args);
    let stderr = '';
    let duration = null;

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;

      // Parse total duration once from the first stream info line
      if (!duration) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
        if (m) duration = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
      }

      // Parse current time for progress
      const tm = text.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (tm && duration) {
        const current = (+tm[1]) * 3600 + (+tm[2]) * 60 + (+tm[3]);
        const progress = Math.min(current / duration, 1);
        try {
          event.sender.send('ffmpeg:progress', { jobId, progress });
        } catch (_) {}
      }
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `ffmpeg exited with code ${code}\n${stderr.slice(-2000)}` });
      }
    });

    proc.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
});

// ── IPC: Filesystem helpers ───────────────────────────────────────────────────

ipcMain.handle('fs:getTempDir', () => os.tmpdir());

ipcMain.handle('fs:writeTempFile', (_, { data, ext }) => {
  const tmpPath = path.join(os.tmpdir(), `courtclipper-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmpPath, Buffer.from(data));
  return tmpPath;
});

ipcMain.handle('fs:writeTextFile', (_, { text, ext }) => {
  const tmpPath = path.join(os.tmpdir(), `courtclipper-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
  fs.writeFileSync(tmpPath, text, 'utf8');
  return tmpPath;
});

ipcMain.handle('fs:deleteFile', (_, { filePath }) => {
  try { fs.unlinkSync(filePath); } catch (_) {}
});
