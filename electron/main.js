'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');
const { spawn, execSync } = require('child_process');
const { getFfmpegPath } = require('./ffmpeg');

const isDev = !app.isPackaged;

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

app.whenReady().then(() => {
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
