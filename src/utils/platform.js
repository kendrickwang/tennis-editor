/**
 * Platform detection — are we running inside the Tauri desktop app?
 * Tauri injects window.__TAURI__ at runtime. Undefined in the browser.
 */
export const isTauri    = typeof window !== 'undefined' && !!window.__TAURI__;

/**
 * Are we running inside the Electron desktop app?
 * preload.js sets window.electronAPI.isElectron = true via contextBridge.
 */
export const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;

/** True in either native desktop runtime. */
export const isDesktop  = isTauri || isElectron;

/**
 * Invoke a Tauri backend command from the React frontend.
 * No-ops gracefully if called from the web version.
 *
 * Usage:
 *   const result = await invokeNative('export_clip', { args: { ... } });
 */
export async function invokeNative(command, args = {}) {
  if (!isDesktop) {
    console.warn(`invokeNative('${command}') called in web mode — ignored`);
    return null;
  }
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
}

/**
 * Check whether the user has native FFmpeg installed.
 * Returns false in web mode (FFmpeg.wasm is used instead).
 */
export async function checkNativeFFmpeg() {
  if (!isDesktop) return false;
  return invokeNative('check_ffmpeg');
}
