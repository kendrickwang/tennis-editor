use std::path::PathBuf;
use tauri::Manager;

/// Detect the best available hardware video encoder on this machine.
/// Falls back to software x264 if nothing is available.
fn detect_encoder() -> &'static str {
    // On Mac, VideoToolbox is always available for H.264
    #[cfg(target_os = "macos")]
    return "h264_videotoolbox";

    // On Windows, prefer NVENC (Nvidia), then QuickSync (Intel), then software
    #[cfg(target_os = "windows")]
    return "libx264"; // TODO: probe NVENC/QuickSync availability at runtime

    // Linux fallback
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    return "libx264";
}

/// Arguments passed from the React frontend for a single clip export.
#[derive(serde::Deserialize)]
pub struct ClipArgs {
    pub input_path: String,      // absolute path to source video
    pub output_path: String,     // absolute path for output clip
    pub start_time: f64,         // seconds
    pub duration: f64,           // seconds
    pub scoreboard_path: Option<String>, // absolute path to PNG overlay (if any)
    pub resolution: String,      // "source" | "1080p" | "720p" | "480p"
}

/// Result returned to the frontend.
#[derive(serde::Serialize)]
pub struct ClipResult {
    pub output_path: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Tauri IPC command — encodes a single clip using native FFmpeg.
/// Called from JS: await invoke('export_clip', { args: { ... } })
#[tauri::command]
async fn export_clip(args: ClipArgs) -> ClipResult {
    let encoder = detect_encoder();

    // Build scale filter for target resolution
    let scale_filter = match args.resolution.as_str() {
        "1080p" => Some("scale=1920:1080:force_original_aspect_ratio=decrease"),
        "720p"  => Some("scale=1280:720:force_original_aspect_ratio=decrease"),
        "480p"  => Some("scale=854:480:force_original_aspect_ratio=decrease"),
        _       => None, // "source" — no scaling
    };

    // Build FFmpeg filter_complex
    let filter = match (&args.scoreboard_path, scale_filter) {
        (Some(_), Some(sf)) => format!(
            "[1:v]scale=iw/2:ih/2[sb];[0:v][sb]overlay=14:14[ov];[ov]{}[vout]", sf
        ),
        (Some(_), None) => String::from(
            "[1:v]scale=iw/2:ih/2[sb];[0:v][sb]overlay=14:14[vout]"
        ),
        (None, Some(sf)) => format!("[0:v]{}[vout]", sf),
        (None, None) => String::new(),
    };

    // Assemble FFmpeg arguments
    let mut cmd_args: Vec<String> = vec![
        "-y".into(),
        "-ss".into(), args.start_time.to_string(),
        "-i".into(), args.input_path.clone(),
    ];

    // Add scoreboard PNG input if provided
    if let Some(ref sb) = args.scoreboard_path {
        cmd_args.extend(["-i".into(), sb.clone()]);
    }

    cmd_args.extend([
        "-t".into(), args.duration.to_string(),
    ]);

    if !filter.is_empty() {
        cmd_args.extend([
            "-filter_complex".into(), filter,
            "-map".into(), "[vout]".into(),
        ]);
    }

    cmd_args.extend([
        "-map".into(), "0:a?".into(),
        "-c:v".into(), encoder.into(),
        "-c:a".into(), "copy".into(), // never re-encode audio
        "-preset".into(), "fast".into(),
        args.output_path.clone(),
    ]);

    // Run FFmpeg
    let output = std::process::Command::new("ffmpeg")
        .args(&cmd_args)
        .output();

    match output {
        Ok(out) if out.status.success() => ClipResult {
            output_path: args.output_path,
            success: true,
            error: None,
        },
        Ok(out) => ClipResult {
            output_path: args.output_path,
            success: false,
            error: Some(String::from_utf8_lossy(&out.stderr).into_owned()),
        },
        Err(e) => ClipResult {
            output_path: args.output_path,
            success: false,
            error: Some(format!("Failed to run ffmpeg: {}", e)),
        },
    }
}

/// Check whether native FFmpeg is available on this machine.
#[tauri::command]
fn check_ffmpeg() -> bool {
    std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![export_clip, check_ffmpeg])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
