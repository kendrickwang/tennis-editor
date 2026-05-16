'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Detection ──────────────────────────────────────────────────────────────
  isElectron: true,

  // ── File dialogs ───────────────────────────────────────────────────────────
  openVideoFile:  ()             => ipcRenderer.invoke('dialog:openFile'),
  saveOutputFile: (defaultName) => ipcRenderer.invoke('dialog:saveFile', { defaultName }),

  // ── FFmpeg ─────────────────────────────────────────────────────────────────
  checkFfmpeg: ()              => ipcRenderer.invoke('ffmpeg:check'),
  runFfmpeg:   (args, jobId)   => ipcRenderer.invoke('ffmpeg:run', { args, jobId }),

  /**
   * Register a progress listener. Returns an unsubscribe function.
   * callback receives { jobId, progress } objects.
   */
  onFfmpegProgress: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('ffmpeg:progress', handler);
    return () => ipcRenderer.removeListener('ffmpeg:progress', handler);
  },

  // ── Filesystem helpers ─────────────────────────────────────────────────────
  getTempDir:    ()                  => ipcRenderer.invoke('fs:getTempDir'),
  writeTempFile: (data, ext)         => ipcRenderer.invoke('fs:writeTempFile', { data, ext }),
  writeTextFile: (text, ext)         => ipcRenderer.invoke('fs:writeTextFile', { text, ext }),
  deleteFile:    (filePath)          => ipcRenderer.invoke('fs:deleteFile',    { filePath }),
});
