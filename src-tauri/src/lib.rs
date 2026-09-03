use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use chrono::{Datelike, Local, NaiveDate};
use serde::Serialize;
use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, PhysicalPosition, Rect, Size};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

struct DshProcess {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    log: Arc<Mutex<String>>,
    quitting: AtomicBool,
    automatic_restart_used: AtomicBool,
    workspace_opened: AtomicBool,
    recovering: AtomicBool,
    recovery_required: AtomicBool,
    restart_confirmation: Mutex<Option<(String, Instant)>>,
    tray_summary: Mutex<Option<MenuItem<tauri::Wry>>>,
}

fn start_local_window_controller(app: tauri::AppHandle) {
    let listener = std::net::TcpListener::bind("127.0.0.1:27891")
        .or_else(|_| std::net::TcpListener::bind("127.0.0.1:0"));
    if let Ok(listener) = listener {
        std::thread::spawn(move || {
            for mut stream in listener.incoming().flatten() {
                use std::io::{Read, Write};
                let mut buffer = [0; 512];
                if let Ok(bytes_read) = stream.read(&mut buffer) {
                    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                    if request.contains("start-drag") {
                        if let Some(win) = app.get_webview_window("splash") {
                            let _ = win.start_dragging();
                        }
                    } else if request.contains("toggle-maximize") {
                        if let Some(win) = app.get_webview_window("splash") {
                            let _ = win.is_maximized().map(|is_max| {
                                if is_max {
                                    let _ = win.unmaximize();
                                } else {
                                    let _ = win.maximize();
                                }
                            });
                        }
                    }
                    let response = "HTTP/1.1 200 OK\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
                    let _ = stream.write_all(response.as_bytes());
                }
            }
        });
    }
}

#[cfg(target_os = "macos")]
const TITLEBAR_INJECT_SCRIPT: &str = r#"
(function() {
    if (window.__dsh_titlebar_injected) return;
    window.__dsh_titlebar_injected = true;
    var style = document.createElement('style');
    style.id = 'dsh-macos-titlebar-style';
    style.textContent = '[class*="_root"][class*="Sidebar"], [class*="sidebar"], aside, .hHd-Xa_root { padding-top: 10px !important; }';
    (document.head || document.documentElement).appendChild(style);

    document.addEventListener('mousedown', function(e) {
        if (e.button === 0 && e.clientY <= 38 && e.clientX >= 76) {
            var target = e.target;
            if (!target) return;
            if (target.closest("button, a, input, textarea, select, [role='button'], [tabindex], [contenteditable='true'], .hi-tab, [data-interactive]")) {
                return;
            }
            fetch('http://127.0.0.1:27891/start-drag', { mode: 'no-cors' }).catch(function(){});
        }
    }, { capture: true, passive: true });

    document.addEventListener('dblclick', function(e) {
        if (e.clientY <= 38 && e.clientX >= 76) {
            var target = e.target;
            if (!target) return;
            if (target.closest("button, a, input, textarea, select, [role='button'], [tabindex], [contenteditable='true'], .hi-tab, [data-interactive]")) {
                return;
            }
            fetch('http://127.0.0.1:27891/toggle-maximize', { mode: 'no-cors' }).catch(function(){});
        }
    }, { capture: true, passive: true });
})();
"#;

#[cfg(target_os = "macos")]
fn inject_titlebar_controls(window: tauri::WebviewWindow) {
    std::thread::spawn(move || {
        for _ in 0..15 {
            std::thread::sleep(std::time::Duration::from_millis(400));
            if window.eval(TITLEBAR_INJECT_SCRIPT).is_ok() {
                break;
            }
        }
    });
}

fn npx_path() -> String {
    if cfg!(windows) {
        return "npx.cmd".to_string();
    }
    [
        "/opt/homebrew/opt/node@22/bin/npx",
        "/opt/homebrew/opt/node/bin/npx",
        "/opt/homebrew/bin/npx",
        "/usr/local/bin/npx",
        "/usr/bin/npx",
    ]
    .iter()
    .find(|path| std::path::Path::new(path).exists())
    .map(|path| (*path).to_string())
    .unwrap_or_else(|| "npx".to_string())
}

fn node_search_path(runtime_root: Option<&std::path::Path>) -> std::ffi::OsString {
    let mut paths = Vec::new();
    if let Some(runtime_root) = runtime_root {
        paths.push(runtime_root.join("node_modules/.bin"));
        paths.push(runtime_root.to_path_buf());
    }
    if !cfg!(windows) {
        paths.extend([
            PathBuf::from("/opt/homebrew/opt/node@22/bin"),
            PathBuf::from("/opt/homebrew/opt/node/bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/usr/bin"),
            PathBuf::from("/bin"),
        ]);
    }
    paths.extend(std::env::split_paths(
        &std::env::var_os("PATH").unwrap_or_default(),
    ));
    std::env::join_paths(paths).unwrap_or_else(|_| std::env::var_os("PATH").unwrap_or_default())
}

fn port_is_ready(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };

    let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(250)));
    if stream
        .write_all(b"GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }

    let mut response = [0_u8; 256];
    let Ok(size) = stream.read(&mut response) else {
        return false;
    };
    let response = String::from_utf8_lossy(&response[..size]);
    response.starts_with("HTTP/") && !response.contains(" 5")
}

fn find_available_port(preferred: u16) -> Result<u16, String> {
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return Ok(preferred);
    }

    TcpListener::bind(("127.0.0.1", 0))
        .and_then(|listener| listener.local_addr())
        .map(|address| address.port())
        .map_err(|error| format!("无法找到可用端口：{error}"))
}

fn bundled_runtime(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf)> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources/dsh-runtime"));
        candidates.push(resource_dir.join("dsh-runtime"));
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/dsh-runtime"));

    let node_name = if cfg!(windows) { "node.exe" } else { "node" };
    if let Some(runtime) = candidates.iter().find(|runtime| {
        runtime.join(node_name).is_file()
            && runtime
                .join("node_modules/@deepseek-ai/dsh/lib/bin.js")
                .is_file()
    }) {
        // Releases before 0.1.2 unpacked a second runtime copy into the App
        // data directory. The runtime now executes directly from Resources,
        // so remove only that obsolete cache and preserve sessions/settings.
        if let Ok(app_data_dir) = app.path().app_data_dir() {
            let _ = std::fs::remove_dir_all(app_data_dir.join("runtime-cache"));
        }
        return Some((
            runtime.join(node_name),
            runtime.join("node_modules/@deepseek-ai/dsh/lib/bin.js"),
        ));
    }

    None
}

fn append_log(log: &Arc<Mutex<String>>, line: &str) {
    if let Ok(mut current) = log.lock() {
        current.push_str(line);
        if current.len() > 8_192 {
            let mut trim_at = current.len() - 8_192;
            while trim_at < current.len() && !current.is_char_boundary(trim_at) {
                trim_at += 1;
            }
            if trim_at < current.len() {
                current.drain(..trim_at);
            }
        }
    }
}

fn capture_output<R: Read + Send + 'static>(reader: R, log: Arc<Mutex<String>>) {
    let reader = BufReader::new(reader);
    for line in reader.lines() {
        match line {
            Ok(line) => append_log(&log, &format!("{line}\n")),
            Err(error) => append_log(&log, &format!("读取 dsh 日志失败：{error}\n")),
        }
    }
}

fn copy_directory(source: &std::path::Path, destination: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(destination).map_err(|error| format!("创建插件目录失败：{error}"))?;
    for entry in std::fs::read_dir(source).map_err(|error| format!("读取插件目录失败：{error}"))?
    {
        let entry = entry.map_err(|error| format!("读取插件文件失败：{error}"))?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry
            .file_type()
            .map_err(|error| format!("读取插件文件类型失败：{error}"))?
            .is_dir()
        {
            copy_directory(&source_path, &destination_path)?;
        } else {
            std::fs::copy(&source_path, &destination_path)
                .map_err(|error| format!("复制插件文件失败：{error}"))?;
        }
    }
    Ok(())
}

fn dsh_home() -> Result<PathBuf, String> {
    if let Some(path) = std::env::var_os("DSH_HOME").filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(path));
    }
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .ok_or_else(|| "无法定位用户目录".to_string())?;
    Ok(PathBuf::from(home).join(".dsh"))
}

fn configured_profile_bundles(profile_dir: &Path) -> std::collections::HashSet<String> {
    let manifest = profile_dir.join("package.json");
    let Ok(content) = std::fs::read_to_string(manifest) else {
        return std::collections::HashSet::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&content) else {
        return std::collections::HashSet::new();
    };
    value
        .get("dsh")
        .and_then(|dsh| dsh.get("profile"))
        .and_then(|profile| profile.get("bundles"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}

fn prepare_bundled_plugin_overlays(node: &Path) -> Result<Vec<PathBuf>, String> {
    let runtime = node
        .parent()
        .ok_or_else(|| "无法定位内置 runtime".to_string())?;
    let mut packages = vec![
        ("@anarkhgatsby/deepseek-harness-insights", true),
        ("@anarkhgatsby/deepseek-harness-channel-config", true),
        ("@anarkhgatsby/deepseek-harness-core", false),
        ("@anarkhgatsby/deepseek-harness-channel-feishu", true),
        ("@anarkhgatsby/deepseek-harness-channel-wecom", true),
        ("@anarkhgatsby/deepseek-harness-locale-pack", true),
    ];
    // iMessage relies on macOS Messages/chat.db and must not be shipped or
    // exposed by the Windows build.
    if !cfg!(windows) {
        packages.push(("@anarkhgatsby/deepseek-harness-channel-imessage", true));
    }

    let home = dsh_home()?;
    // dsh resolves out-of-tree bundle names from the profile directory. Its
    // maintained flat fallback is $DSH_HOME/profiles/node_modules, which also
    // contains the core runtime peers required by bundled channel plugins.
    let dsh_node_modules = home.join("profiles/node_modules");
    let configured_bundles = configured_profile_bundles(&home.join("profiles/web"));
    let mut patches = Vec::new();
    for (package_name, has_patch) in packages {
        let source = runtime.join("node_modules").join(package_name);
        if !source.join("package.json").is_file()
            || (has_patch && !source.join("cordis.patch.yml").is_file())
        {
            return Err(format!("内置插件文件不完整：{package_name}"));
        }

        // The Web profile resolves out-of-tree packages upward from
        // $DSH_HOME/profiles/web, making $DSH_HOME/profiles/node_modules its
        // stable package root. Keep the replaceable copy small and
        // deterministic.
        let destination = dsh_node_modules.join(package_name);
        let temporary = destination.with_extension(format!("tmp-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&temporary);
        copy_directory(&source, &temporary)?;
        let _ = std::fs::remove_dir_all(&destination);
        if let Some(parent) = destination.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|error| format!("创建 Harness 插件目录失败：{error}"))?;
        }
        std::fs::rename(&temporary, &destination)
            .map_err(|error| format!("启用内置插件失败 {package_name}：{error}"))?;
        // A user may already have installed the same package into the Web
        // profile. Its manifest bundle will load the package's patch itself;
        // passing that patch again through `--patch` would create duplicate
        // loader entry IDs. Keep the user's profile-owned copy authoritative.
        if has_patch && !configured_bundles.contains(package_name) {
            patches.push(source.join("cordis.patch.yml"));
        }
    }
    Ok(patches)
}

fn desktop_web_flags(port: u16) -> Vec<String> {
    vec![
        "--no-open".to_string(),
        "--port".to_string(),
        port.to_string(),
    ]
}

fn bundled_web_args(entry_arg: String, plugin_patches: &[PathBuf], port: u16) -> Vec<String> {
    let mut args = vec![
        "--expose-internals".to_string(),
        entry_arg,
        "web".to_string(),
    ];
    for plugin_patch in plugin_patches {
        // `--patch` belongs to the dsh launcher. It must precede the Web app
        // flags, which are forwarded verbatim to the web profile. dsh accepts
        // repeatable `--patch` values, one for each bundled plugin.
        args.push("--patch".to_string());
        args.push(plugin_patch.to_string_lossy().into_owned());
    }
    args.extend(desktop_web_flags(port));
    args
}

fn spawn_dsh(
    app: &tauri::AppHandle,
    state: &DshProcess,
    active_port: u16,
    clear_log: bool,
) -> Result<(), String> {
    if clear_log {
        if let Ok(mut log) = state.log.lock() {
            log.clear();
        }
    }

    let (program, args, using_bundled_runtime) = if let Some((node, entry)) = bundled_runtime(app) {
        // Passing a Windows drive-qualified script path through the installed
        // process chain can be reduced to `C:` by Node's entry-point parser.
        // Run from the embedded runtime and use a relative script path there.
        let entry_arg = if cfg!(windows) {
            "node_modules/@deepseek-ai/dsh/lib/bin.js".to_string()
        } else {
            entry.to_string_lossy().into_owned()
        };
        let plugin_patches = match prepare_bundled_plugin_overlays(&node) {
            Ok(plugin_patches) => plugin_patches,
            Err(error) => {
                append_log(
                    &state.log,
                    &format!("内置桌面插件不可用，继续启动核心工作台：{error}\n"),
                );
                Vec::new()
            }
        };
        let args = bundled_web_args(entry_arg, &plugin_patches, active_port);
        (node, args, true)
    } else if cfg!(debug_assertions) {
        (
            PathBuf::from(npx_path()),
            [
                vec![
                    "--yes".to_string(),
                    "@deepseek-ai/dsh".to_string(),
                    "web".to_string(),
                ],
                desktop_web_flags(active_port),
            ]
            .concat(),
            false,
        )
    } else {
        return Err("正式包缺少内置 dsh 运行时，请重新下载完整 App。".to_string());
    };

    let runtime_root = using_bundled_runtime.then(|| program.parent()).flatten();
    let mut command = Command::new(&program);
    command
        .env("PATH", node_search_path(runtime_root))
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "macos")]
    if using_bundled_runtime {
        if let Some(runtime_root) = runtime_root {
            command.env("DYLD_LIBRARY_PATH", runtime_root.join("lib"));
        }
    }

    if cfg!(windows) && using_bundled_runtime {
        if let Some(runtime_root) = runtime_root {
            command.current_dir(runtime_root);
        }
    } else if let Ok(app_data_dir) = app.path().app_data_dir() {
        let _ = std::fs::create_dir_all(&app_data_dir);
        command.current_dir(app_data_dir);
    }

    let mut child = command.spawn().map_err(|error| {
        if using_bundled_runtime {
            format!("启动内置 dsh 失败：{error}")
        } else {
            format!("启动 dsh 失败：{error}。请安装 Node.js，或重新下载完整 App。")
        }
    })?;

    if let Some(stdout) = child.stdout.take() {
        let log = Arc::clone(&state.log);
        std::thread::spawn(move || capture_output(stdout, log));
    }
    if let Some(stderr) = child.stderr.take() {
        let log = Arc::clone(&state.log);
        std::thread::spawn(move || capture_output(stderr, log));
    }

    *state
        .child
        .lock()
        .map_err(|_| "无法取得 dsh 进程锁".to_string())? = Some(child);
    *state
        .port
        .lock()
        .map_err(|_| "无法取得 dsh 端口锁".to_string())? = Some(active_port);
    Ok(())
}

#[tauri::command]
fn start_dsh(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, DshProcess>,
    port: u16,
) -> Result<String, String> {
    require_splash(&window)?;
    if !(1024..=65535).contains(&port) {
        return Err("端口必须在 1024 到 65535 之间".to_string());
    }
    if state.recovery_required.load(Ordering::SeqCst) {
        return Err("dsh 自动恢复已停止，请从恢复页面手动重新启动。".to_string());
    }
    if state.workspace_opened.load(Ordering::SeqCst) {
        return Err("工作台运行期间仅允许后台恢复 dsh。".to_string());
    }

    if state
        .child
        .lock()
        .map_err(|_| "无法取得 dsh 进程锁".to_string())?
        .is_some()
    {
        let active_port = state
            .port
            .lock()
            .map_err(|_| "无法取得 dsh 端口锁".to_string())?
            .unwrap_or(port);
        return Ok(format!("http://127.0.0.1:{active_port}"));
    }

    let active_port = find_available_port(port)?;
    spawn_dsh(&app, &state, active_port, true)?;
    Ok(format!("http://127.0.0.1:{active_port}"))
}

#[tauri::command]
fn request_restart_confirmation(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DshProcess>,
) -> Result<String, String> {
    require_recovery(&window)?;
    if !state.recovery_required.load(Ordering::SeqCst) {
        return Err("当前不需要恢复 dsh。".to_string());
    }
    let token = format!("{}-{}", std::process::id(), chrono_like_timestamp());
    *state
        .restart_confirmation
        .lock()
        .map_err(|_| "无法创建恢复确认".to_string())? = Some((token.clone(), Instant::now()));
    Ok(token)
}

#[tauri::command]
fn restart_dsh(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, DshProcess>,
    port: u16,
    confirmation: String,
) -> Result<String, String> {
    require_recovery(&window)?;
    let mut pending_confirmation = state
        .restart_confirmation
        .lock()
        .map_err(|_| "无法读取恢复确认".to_string())?;
    let confirmed = pending_confirmation
        .as_ref()
        .is_some_and(|(token, issued)| {
            token == &confirmation && issued.elapsed() >= Duration::from_secs(3)
        });
    if !confirmed {
        return Err("请等待确认倒计时结束后再次点击。".to_string());
    }
    *pending_confirmation = None;
    drop(pending_confirmation);
    state.recovery_required.store(false, Ordering::SeqCst);
    state.workspace_opened.store(false, Ordering::SeqCst);
    state.automatic_restart_used.store(false, Ordering::SeqCst);
    start_dsh(window, app, state, port)
}

#[tauri::command]
fn dsh_status(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DshProcess>,
    port: u16,
) -> Result<String, String> {
    require_splash(&window)?;
    let mut process = state
        .child
        .lock()
        .map_err(|_| "无法取得 dsh 进程锁".to_string())?;

    let Some(child) = process.as_mut() else {
        return Err("dsh 尚未启动".to_string());
    };

    if let Some(status) = child
        .try_wait()
        .map_err(|error| format!("读取 dsh 状态失败：{error}"))?
    {
        *process = None;
        let detail = state
            .log
            .lock()
            .ok()
            .map(|log| log.trim().to_string())
            .filter(|log| !log.is_empty())
            .map(|log| format!("\n{log}"))
            .unwrap_or_default();
        if let Ok(mut active_port) = state.port.lock() {
            *active_port = None;
        }
        return Err(format!("dsh 已退出：{status}{detail}"));
    }

    Ok(if port_is_ready(port) {
        "ready".to_string()
    } else {
        "starting".to_string()
    })
}

#[tauri::command]
fn open_workspace(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DshProcess>,
    port: u16,
) -> Result<(), String> {
    require_splash(&window)?;
    let active_port = state
        .port
        .lock()
        .map_err(|_| "无法取得 dsh 端口锁".to_string())?
        .ok_or_else(|| "dsh 尚未启动".to_string())?;
    if port != active_port || !port_is_ready(active_port) {
        return Err("dsh 尚未准备完成".to_string());
    }

    let url = format!("http://127.0.0.1:{active_port}")
        .parse()
        .map_err(|error| format!("生成本地工作台地址失败：{error}"))?;
    let workspace_window = if window.label() == "recovery" {
        window
            .app_handle()
            .get_webview_window("splash")
            .unwrap_or_else(|| window.clone())
    } else {
        window.clone()
    };
    workspace_window
        .set_title("DeepSeek Harness — 非官方客户端")
        .map_err(|error| format!("更新窗口标题失败：{error}"))?;
    workspace_window
        .set_resizable(true)
        .map_err(|error| format!("启用窗口缩放失败：{error}"))?;
    workspace_window
        .set_min_size(Some(Size::Logical(LogicalSize::new(960.0, 640.0))))
        .map_err(|error| format!("设置窗口最小尺寸失败：{error}"))?;
    const WORKSPACE_WIDTH: f64 = 1240.0;
    const WORKSPACE_HEIGHT: f64 = 820.0;
    workspace_window
        .set_size(Size::Logical(LogicalSize::new(
            WORKSPACE_WIDTH,
            WORKSPACE_HEIGHT,
        )))
        .map_err(|error| format!("调整工作台窗口失败：{error}"))?;
    if let Some(monitor) = workspace_window
        .current_monitor()
        .map_err(|error| format!("读取当前显示器失败：{error}"))?
    {
        let work_area = monitor.work_area();
        let scale = monitor.scale_factor();
        let target_width = (WORKSPACE_WIDTH * scale).round() as i32;
        let target_height = (WORKSPACE_HEIGHT * scale).round() as i32;
        let x = work_area.position.x + ((work_area.size.width as i32 - target_width).max(0) / 2);
        let y = work_area.position.y + ((work_area.size.height as i32 - target_height).max(0) / 2);
        workspace_window
            .set_position(PhysicalPosition::new(x, y))
            .map_err(|error| format!("居中工作台窗口失败：{error}"))?;
    }
    workspace_window
        .navigate(url)
        .map_err(|error| format!("打开工作台失败：{error}"))?;
    #[cfg(target_os = "macos")]
    inject_titlebar_controls(workspace_window.clone());
    if window.label() == "recovery" && workspace_window.label() != "recovery" {
        let _ = window.hide();
        let _ = window.eval("window.location.reload()");
        let _ = workspace_window.show();
    }
    state.workspace_opened.store(true, Ordering::SeqCst);
    workspace_window
        .set_focus()
        .map_err(|error| format!("聚焦工作台失败：{error}"))?;
    Ok(())
}

fn require_splash(window: &tauri::WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|error| format!("读取窗口地址失败：{error}"))?;
    let is_app_origin = url.scheme() == "tauri"
        || ((url.scheme() == "http" || url.scheme() == "https")
            && url.host_str() == Some("tauri.localhost"));
    if matches!(window.label(), "splash" | "recovery") && is_app_origin {
        Ok(())
    } else {
        Err("该命令仅允许启动页面调用".to_string())
    }
}

fn require_panel(window: &tauri::WebviewWindow) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|error| format!("读取 Insights 浮层地址失败：{error}"))?;
    let is_app_origin = url.scheme() == "tauri"
        || ((url.scheme() == "http" || url.scheme() == "https")
            && url.host_str() == Some("tauri.localhost"));
    if window.label() == "insights-panel" && is_app_origin && url.path() == "/tray-insights.html" {
        Ok(())
    } else {
        Err("该命令仅允许 Insights 浮层调用".to_string())
    }
}

fn require_recovery(window: &tauri::WebviewWindow) -> Result<(), String> {
    require_splash(window)?;
    let url = window
        .url()
        .map_err(|error| format!("读取恢复页面地址失败：{error}"))?;
    if window.label() == "recovery" && url.path() == "/recovery.html" {
        Ok(())
    } else {
        Err("该命令仅允许恢复页面调用".to_string())
    }
}

fn call_dsh_api(
    port: u16,
    method: &str,
    payload: Value,
    timeout_seconds: u64,
) -> Result<Value, String> {
    let rpc_id = format!("native-{}-{}", std::process::id(), chrono_like_timestamp());
    let body = json!({
        "type": "client-request",
        "rpcId": rpc_id,
        "method": method,
        "payload": payload,
    })
    .to_string();
    let url = format!("http://127.0.0.1:{port}/api/{method}");
    let curl = if cfg!(windows) {
        "curl.exe"
    } else {
        "/usr/bin/curl"
    };
    let output = Command::new(curl)
        .args([
            "-sS",
            "--fail-with-body",
            "--max-time",
            &timeout_seconds.to_string(),
            "-X",
            "POST",
            &url,
            "-H",
            "content-type: application/json",
            "-d",
            &body,
        ])
        .output()
        .map_err(|error| format!("调用 dsh 失败：{error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let response: Value = serde_json::from_slice(&output.stdout)
        .map_err(|error| format!("dsh 返回了无效响应：{error}"))?;
    match response.get("result") {
        Some(result) if result.get("ok") == Some(&Value::Bool(true)) => {
            Ok(result.get("value").cloned().unwrap_or(Value::Null))
        }
        Some(result) => Err(result
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .unwrap_or("dsh 请求失败")
            .to_string()),
        None => Err("dsh 返回缺少 result 字段".to_string()),
    }
}

#[tauri::command]
fn dsh_api_request(
    window: tauri::WebviewWindow,
    port: u16,
    method: String,
    payload: Value,
) -> Result<Value, String> {
    require_splash(&window)?;
    const ALLOWED_METHODS: &[&str] = &[
        "host.describe",
        "session.list",
        "session.create",
        "session.history",
        "session.models",
        "session.selectModel",
        "session.rename",
        "session.prompt",
        "session.cancel",
        "workspace.list",
        "workspace.create",
        "credentials.describe",
        "credentials.set",
        "credentials.unset",
        "llm.providers",
        "llm.models",
    ];

    if !ALLOWED_METHODS.contains(&method.as_str()) {
        return Err(format!("不允许调用 dsh 接口：{method}"));
    }

    call_dsh_api(port, &method, payload, 60)
}

#[tauri::command]
fn tray_insights_snapshot(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DshProcess>,
) -> Result<Value, String> {
    require_panel(&window)?;
    if state.recovering.load(Ordering::SeqCst) {
        return Ok(json!({ "status": "recovering" }));
    }
    let port = state
        .port
        .lock()
        .map_err(|_| "无法取得 dsh 端口锁".to_string())?
        .filter(|port| port_is_ready(*port));
    let Some(port) = port else {
        return Ok(json!({ "status": "unavailable" }));
    };
    let value = call_dsh_api(port, "session.list", json!({}), 30)?;
    Ok(json!({
        "status": "ready",
        "usage": weekly_usage(&value, Local::now().date_naive())
    }))
}

#[tauri::command]
fn tray_insights_open_main(window: tauri::WebviewWindow) -> Result<(), String> {
    require_panel(&window)?;
    let app = window.app_handle();
    show_main_window(app);
    window
        .hide()
        .map_err(|error| format!("隐藏 Insights 浮层失败：{error}"))
}

fn chrono_like_timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

fn show_main_window(app: &tauri::AppHandle) {
    let state = app.state::<DshProcess>();
    let window = if state.recovery_required.load(Ordering::SeqCst) {
        app.get_webview_window("recovery")
    } else {
        app.get_webview_window("splash")
            .or_else(|| app.get_webview_window("recovery"))
    };
    if let Some(window) = window {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_recovery_page(app: &tauri::AppHandle, detail: &str) {
    app.state::<DshProcess>()
        .recovery_required
        .store(true, Ordering::SeqCst);
    append_log(
        &app.state::<DshProcess>().log,
        &format!("dsh 自动恢复失败：{detail}\n"),
    );
    if let Some(window) = app.get_webview_window("splash") {
        let _ = window.hide();
    }
    if let Some(window) = app.get_webview_window("recovery") {
        let _ = window.set_decorations(true);
        let _ = window.set_shadow(true);
        let _ = window.set_size(Size::Logical(LogicalSize::new(560.0, 420.0)));
        let _ = window.eval("document.body.classList.add('recovery-visible')");
        let _ = window.center();
        let _ = window.unminimize();
        let _ = window.show();
        return;
    }
    match tauri::WebviewWindowBuilder::new(
        app,
        "recovery",
        tauri::WebviewUrl::App("recovery.html".into()),
    )
    .title("DeepSeek Harness — 恢复工作台")
    .inner_size(560.0, 420.0)
    .resizable(false)
    .center()
    .disable_drag_drop_handler()
    .on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = window.eval("document.body.classList.add('recovery-visible')");
        }
    })
    .build()
    {
        Ok(_) => {
            // Do not steal focus while the user may still be typing in the failed
            // workspace. Recovery requires an explicit interaction with this window.
        }
        Err(error) => append_log(
            &app.state::<DshProcess>().log,
            &format!("创建恢复窗口失败：{error}\n"),
        ),
    }
}

fn setup_recovery_window(app: &tauri::AppHandle) -> Result<(), String> {
    tauri::WebviewWindowBuilder::new(
        app,
        "recovery",
        tauri::WebviewUrl::App("recovery.html".into()),
    )
    .title("DeepSeek Harness — 恢复工作台")
    .inner_size(1.0, 1.0)
    .resizable(false)
    .disable_drag_drop_handler()
    .decorations(false)
    .shadow(false)
    .position(-10_000.0, -10_000.0)
    .visible(true)
    .on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = window.hide();
        }
    })
    .build()
    .map(|_| ())
    .map_err(|error| format!("预加载恢复窗口失败：{error}"))
}

fn start_dsh_supervisor(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(500));
        let state = app.state::<DshProcess>();
        if state.quitting.load(Ordering::SeqCst)
            || !state.workspace_opened.load(Ordering::SeqCst)
            || state.recovering.load(Ordering::SeqCst)
        {
            continue;
        }

        let exited = {
            let Ok(mut process) = state.child.lock() else {
                continue;
            };
            let Some(child) = process.as_mut() else {
                continue;
            };
            match child.try_wait() {
                Ok(Some(status)) => {
                    *process = None;
                    Some(status.to_string())
                }
                Ok(None) => None,
                Err(error) => Some(format!("无法读取退出状态：{error}")),
            }
        };
        let Some(exit_detail) = exited else {
            continue;
        };

        append_log(&state.log, &format!("dsh 意外退出：{exit_detail}\n"));
        set_tray_summary(&app, "Harness 正在恢复…");
        let restart_was_used = state.automatic_restart_used.swap(true, Ordering::SeqCst);
        if restart_was_used {
            state.recovery_required.store(true, Ordering::SeqCst);
            state.workspace_opened.store(false, Ordering::SeqCst);
            set_tray_summary(&app, "用量暂不可用");
            show_recovery_page(&app, &format!("dsh 再次退出：{exit_detail}"));
            continue;
        }

        state.recovering.store(true, Ordering::SeqCst);
        let active_port = state.port.lock().ok().and_then(|port| *port);
        std::thread::sleep(Duration::from_secs(2));
        if state.quitting.load(Ordering::SeqCst) {
            state.recovering.store(false, Ordering::SeqCst);
            continue;
        }
        let Some(active_port) = active_port else {
            state.recovering.store(false, Ordering::SeqCst);
            state.workspace_opened.store(false, Ordering::SeqCst);
            show_recovery_page(&app, "无法取得原工作台端口");
            continue;
        };
        if let Err(error) = spawn_dsh(&app, &state, active_port, false) {
            state.recovering.store(false, Ordering::SeqCst);
            set_tray_summary(&app, "用量暂不可用");
            state.workspace_opened.store(false, Ordering::SeqCst);
            show_recovery_page(&app, &error);
            continue;
        }

        let mut recovered = false;
        let mut failure = None;
        for _ in 0..120 {
            if state.quitting.load(Ordering::SeqCst) {
                break;
            }
            std::thread::sleep(Duration::from_millis(500));
            let exited_again = {
                let Ok(mut process) = state.child.lock() else {
                    failure = Some("无法取得 dsh 进程锁".to_string());
                    break;
                };
                match process.as_mut() {
                    Some(child) => match child.try_wait() {
                        Ok(Some(status)) => {
                            *process = None;
                            Some(format!("dsh 恢复后再次退出：{status}"))
                        }
                        Ok(None) => None,
                        Err(error) => Some(format!("读取恢复进程状态失败：{error}")),
                    },
                    None => Some("dsh 恢复进程不存在".to_string()),
                }
            };
            if let Some(error) = exited_again {
                failure = Some(error);
                break;
            }
            if port_is_ready(active_port) {
                recovered = true;
                break;
            }
        }

        state.recovering.store(false, Ordering::SeqCst);
        if recovered {
            refresh_tray_summary_async(app.clone());
            let window = app
                .get_webview_window("splash")
                .or_else(|| app.get_webview_window("recovery"));
            if let Some(window) = window {
                if let Ok(url) = format!("http://127.0.0.1:{active_port}").parse() {
                    let _ = window.navigate(url);
                    #[cfg(target_os = "macos")]
                    inject_titlebar_controls(window.clone());
                }
            }
        } else if !state.quitting.load(Ordering::SeqCst) {
            state.workspace_opened.store(false, Ordering::SeqCst);
            set_tray_summary(&app, "用量暂不可用");
            show_recovery_page(&app, failure.as_deref().unwrap_or("dsh 自动恢复启动超时"));
        }
    });
}

#[tauri::command]
fn stop_dsh(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, DshProcess>,
) -> Result<(), String> {
    require_splash(&window)?;
    let mut process = state
        .child
        .lock()
        .map_err(|_| "无法取得 dsh 进程锁".to_string())?;

    if let Some(mut child) = process.take() {
        terminate_child(&mut child)?;
    }
    if let Ok(mut active_port) = state.port.lock() {
        *active_port = None;
    }
    state.workspace_opened.store(false, Ordering::SeqCst);
    state.recovering.store(false, Ordering::SeqCst);

    Ok(())
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageTotals {
    tokens: u64,
    calls: u64,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
    reasoning_tokens: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct DailyUsage {
    date: String,
    weekday: u32,
    totals: UsageTotals,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct WeeklyUsage {
    week_start: String,
    week_end: String,
    totals: UsageTotals,
    days: Vec<DailyUsage>,
}

fn projection_number(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

fn add_projection_totals(target: &mut UsageTotals, totals: &Value) {
    let input = projection_number(totals.get("inputTokens"));
    let output = projection_number(totals.get("outputTokens"));
    let cache_read = projection_number(totals.get("cacheReadTokens"));
    let cache_write = projection_number(totals.get("cacheWriteTokens"));
    target.input_tokens = target.input_tokens.saturating_add(input);
    target.output_tokens = target.output_tokens.saturating_add(output);
    target.cache_read_tokens = target.cache_read_tokens.saturating_add(cache_read);
    target.cache_write_tokens = target.cache_write_tokens.saturating_add(cache_write);
    target.reasoning_tokens = target
        .reasoning_tokens
        .saturating_add(projection_number(totals.get("reasoningTokens")));
    target.calls = target
        .calls
        .saturating_add(projection_number(totals.get("calls")));
    target.tokens = target
        .tokens
        .saturating_add(input)
        .saturating_add(output)
        .saturating_add(cache_read)
        .saturating_add(cache_write);
}

fn weekly_usage(session_list: &Value, today: NaiveDate) -> WeeklyUsage {
    let week_start = today - chrono::Duration::days(today.weekday().num_days_from_monday().into());
    let mut days = (0..7)
        .map(|offset| {
            let date = week_start + chrono::Duration::days(offset);
            DailyUsage {
                date: date.format("%Y-%m-%d").to_string(),
                weekday: offset as u32,
                totals: UsageTotals::default(),
            }
        })
        .collect::<Vec<_>>();
    let Some(items) = session_list.get("items").and_then(Value::as_array) else {
        return WeeklyUsage {
            week_start: week_start.format("%Y-%m-%d").to_string(),
            week_end: today.format("%Y-%m-%d").to_string(),
            totals: UsageTotals::default(),
            days,
        };
    };
    for item in items {
        let Some(day_map) = item
            .pointer("/projections/values/harnessDesktopInsights/byDay")
            .and_then(Value::as_object)
        else {
            continue;
        };
        for (day, totals) in day_map {
            let Ok(date) = NaiveDate::parse_from_str(day, "%Y-%m-%d") else {
                continue;
            };
            if date < week_start || date > today {
                continue;
            }
            let index = date.signed_duration_since(week_start).num_days() as usize;
            add_projection_totals(&mut days[index].totals, totals);
        }
    }
    let mut totals = UsageTotals::default();
    for day in &days {
        totals.tokens = totals.tokens.saturating_add(day.totals.tokens);
        totals.calls = totals.calls.saturating_add(day.totals.calls);
        totals.input_tokens = totals.input_tokens.saturating_add(day.totals.input_tokens);
        totals.output_tokens = totals
            .output_tokens
            .saturating_add(day.totals.output_tokens);
        totals.cache_read_tokens = totals
            .cache_read_tokens
            .saturating_add(day.totals.cache_read_tokens);
        totals.cache_write_tokens = totals
            .cache_write_tokens
            .saturating_add(day.totals.cache_write_tokens);
        totals.reasoning_tokens = totals
            .reasoning_tokens
            .saturating_add(day.totals.reasoning_tokens);
    }
    WeeklyUsage {
        week_start: week_start.format("%Y-%m-%d").to_string(),
        week_end: today.format("%Y-%m-%d").to_string(),
        totals,
        days,
    }
}

fn compact_count(value: u64) -> String {
    if value < 1_000 {
        return value.to_string();
    }
    let (scaled, suffix) = if value < 1_000_000 {
        (value as f64 / 1_000.0, "K")
    } else if value < 1_000_000_000 {
        (value as f64 / 1_000_000.0, "M")
    } else {
        (value as f64 / 1_000_000_000.0, "B")
    };
    if scaled >= 100.0 || scaled.fract() < 0.05 {
        format!("{scaled:.0}{suffix}")
    } else {
        format!("{scaled:.1}{suffix}")
    }
}

fn weekly_usage_label(usage: &WeeklyUsage) -> String {
    if usage.totals.calls == 0 {
        "本周 · 暂无调用".to_string()
    } else {
        format!(
            "本周 · {} Token · {} 次调用",
            compact_count(usage.totals.tokens),
            compact_count(usage.totals.calls)
        )
    }
}

fn set_tray_summary(app: &tauri::AppHandle, text: &str) {
    if let Ok(summary) = app.state::<DshProcess>().tray_summary.lock() {
        if let Some(item) = summary.as_ref() {
            let _ = item.set_text(text);
        }
    }
}

fn refresh_tray_summary(app: &tauri::AppHandle) {
    let state = app.state::<DshProcess>();
    if state.recovering.load(Ordering::SeqCst) {
        set_tray_summary(app, "Harness 正在恢复…");
        return;
    }
    let port = state.port.lock().ok().and_then(|port| *port);
    let Some(port) = port.filter(|port| port_is_ready(*port)) else {
        set_tray_summary(app, "用量暂不可用");
        return;
    };
    match call_dsh_api(port, "session.list", json!({}), 30) {
        Ok(value) => {
            let usage = weekly_usage(&value, Local::now().date_naive());
            set_tray_summary(app, &weekly_usage_label(&usage));
        }
        Err(_) => set_tray_summary(app, "用量暂不可用"),
    }
}

fn refresh_tray_summary_async(app: tauri::AppHandle) {
    std::thread::spawn(move || refresh_tray_summary(&app));
}

fn start_tray_summary_worker(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let delays = [Duration::from_secs(8), Duration::from_secs(22)];
        for delay in delays {
            std::thread::sleep(delay);
            if app.state::<DshProcess>().quitting.load(Ordering::SeqCst) {
                return;
            }
            refresh_tray_summary(&app);
        }
        loop {
            std::thread::sleep(Duration::from_secs(300));
            if app.state::<DshProcess>().quitting.load(Ordering::SeqCst) {
                return;
            }
            refresh_tray_summary(&app);
        }
    });
}

fn panel_position(
    app: &tauri::AppHandle,
    click: PhysicalPosition<f64>,
    rect: Rect,
) -> PhysicalPosition<i32> {
    const PANEL_WIDTH: i32 = 360;
    const PANEL_HEIGHT: i32 = 460;
    let monitor = app
        .monitor_from_point(click.x, click.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return PhysicalPosition::new(click.x.round() as i32, click.y.round() as i32);
    };
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let tray_position = rect.position.to_physical::<i32>(scale);
    let tray_size = rect.size.to_physical::<u32>(scale);
    let center_x = tray_position.x + tray_size.width as i32 / 2;
    let panel_width = (PANEL_WIDTH as f64 * scale).round() as i32;
    let panel_height = (PANEL_HEIGHT as f64 * scale).round() as i32;
    let mut x = center_x - panel_width / 2;
    let mut y = if cfg!(target_os = "macos") {
        tray_position.y + tray_size.height as i32 + (6.0 * scale).round() as i32
    } else {
        tray_position.y - panel_height - (8.0 * scale).round() as i32
    };
    let min_x = area.position.x;
    let max_x = area.position.x + area.size.width as i32 - panel_width;
    let min_y = area.position.y;
    let max_y = area.position.y + area.size.height as i32 - panel_height;
    x = x.clamp(min_x, max_x.max(min_x));
    y = y.clamp(min_y, max_y.max(min_y));
    PhysicalPosition::new(x, y)
}

fn toggle_insights_panel(app: &tauri::AppHandle, click: PhysicalPosition<f64>, rect: Rect) {
    let position = panel_position(app, click, rect);
    if let Some(panel) = app.get_webview_window("insights-panel") {
        if panel.is_visible().unwrap_or(false) {
            let _ = panel.hide();
            return;
        }
        let _ = panel.set_size(Size::Logical(LogicalSize::new(360.0, 460.0)));
        let _ = panel.set_shadow(false);
        let _ = panel.set_position(position);
        let _ = panel.eval("document.body.classList.add('panel-visible')");
        let _ = panel.show();
        let _ = panel.set_focus();
        let _ = panel.eval("window.dispatchEvent(new Event('tray-panel-open'))");
        return;
    }
    match tauri::WebviewWindowBuilder::new(
        app,
        "insights-panel",
        tauri::WebviewUrl::App("tray-insights.html".into()),
    )
    .title("Harness Insights")
    .inner_size(360.0, 460.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = window.eval("document.body.classList.add('panel-visible')");
        }
    })
    .build()
    {
        Ok(panel) => {
            let _ = panel.set_position(position);
            let _ = panel.set_focus();
        }
        Err(error) => append_log(
            &app.state::<DshProcess>().log,
            &format!("创建 Insights 浮层失败：{error}\n"),
        ),
    }
}

fn setup_insights_panel(app: &tauri::AppHandle) -> Result<(), String> {
    tauri::WebviewWindowBuilder::new(
        app,
        "insights-panel",
        tauri::WebviewUrl::App("tray-insights.html".into()),
    )
    .title("Harness Insights")
    .inner_size(1.0, 1.0)
    .resizable(false)
    .decorations(false)
    .shadow(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .position(-10_000.0, -10_000.0)
    .visible(true)
    .on_page_load(|window, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = window.hide();
        }
    })
    .build()
    .map(|_| ())
    .map_err(|error| format!("预加载 Insights 浮层失败：{error}"))
}

fn tray_icon(_app: &tauri::AppHandle) -> Result<Image<'static>, String> {
    #[cfg(target_os = "macos")]
    {
        const TRAY_TEMPLATE: &[u8] = include_bytes!("../icons/tray-template.rgba");
        if TRAY_TEMPLATE.len() != 44 * 44 * 4 {
            return Err("macOS 托盘模板图标尺寸无效".to_string());
        }
        Ok(Image::new(TRAY_TEMPLATE, 44, 44))
    }

    #[cfg(not(target_os = "macos"))]
    _app.default_window_icon()
        .map(|icon| icon.clone().to_owned())
        .ok_or_else(|| "缺少托盘图标".to_string())
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), String> {
    let summary = MenuItem::with_id(
        app,
        "tray-summary",
        "正在统计本周用量…",
        false,
        None::<&str>,
    )
    .map_err(|error| format!("创建托盘摘要菜单失败：{error}"))?;
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|error| format!("创建托盘分隔线失败：{error}"))?;
    let open = MenuItem::with_id(
        app,
        "tray-open",
        "打开 DeepSeek Harness",
        true,
        None::<&str>,
    )
    .map_err(|error| format!("创建托盘打开菜单失败：{error}"))?;
    let quit = MenuItem::with_id(
        app,
        "tray-quit",
        "退出 DeepSeek Harness",
        true,
        None::<&str>,
    )
    .map_err(|error| format!("创建托盘退出菜单失败：{error}"))?;
    let menu = Menu::with_items(app, &[&summary, &separator, &open, &quit])
        .map_err(|error| format!("创建托盘菜单失败：{error}"))?;
    let icon = tray_icon(app)?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("DeepSeek Harness")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "tray-open" => show_main_window(app),
            "tray-quit" => {
                app.state::<DshProcess>()
                    .quitting
                    .store(true, Ordering::SeqCst);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                position,
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_insights_panel(tray.app_handle(), position, rect);
            }
        })
        .build(app)
        .map_err(|error| format!("创建托盘图标失败：{error}"))?;
    *app.state::<DshProcess>()
        .tray_summary
        .lock()
        .map_err(|_| "无法保存托盘摘要菜单".to_string())? = Some(summary);
    start_tray_summary_worker(app.clone());
    Ok(())
}

fn terminate_child(child: &mut Child) -> Result<(), String> {
    if child
        .try_wait()
        .map_err(|error| format!("读取 dsh 状态失败：{error}"))?
        .is_some()
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    if child.try_wait().ok().flatten().is_none() {
        child
            .kill()
            .map_err(|error| format!("停止 dsh 失败：{error}"))?;
    }
    let _ = child.wait();
    Ok(())
}

fn stop_dsh_for_update(state: &DshProcess) {
    if let Ok(mut process) = state.child.lock() {
        if let Some(mut child) = process.take() {
            let _ = terminate_child(&mut child);
        }
    }
    if let Ok(mut port) = state.port.lock() {
        *port = None;
    }
    state.workspace_opened.store(false, Ordering::SeqCst);
}

fn update_notes(body: Option<&String>) -> String {
    let Some(body) = body
        .map(String::as_str)
        .map(str::trim)
        .filter(|body| !body.is_empty())
    else {
        return "包含最新功能、兼容性改进和问题修复。".to_string();
    };

    let mut notes = body.chars().take(800).collect::<String>();
    if body.chars().count() > 800 {
        notes.push('…');
    }
    notes
}

fn show_update_error(
    app: &tauri::AppHandle,
    detail: impl Into<String>,
    restart_current_version: bool,
) {
    let recovery = if restart_current_version {
        "\n\nApp 将重启当前版本以恢复工作台。"
    } else {
        ""
    };
    let message = format!(
        "自动更新失败。你可以继续使用当前版本，或从 GitHub Releases 手动下载。\n\n{}{}",
        detail.into(),
        recovery,
    );
    app.dialog()
        .message(message)
        .title("DeepSeek Harness 更新")
        .kind(MessageDialogKind::Error)
        .buttons(MessageDialogButtons::OkCustom("知道了".to_string()))
        .blocking_show();
}

fn start_update_checker(app: tauri::AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }

    std::thread::spawn(move || {
        // Let the workspace and local dsh service finish starting before using a
        // native dialog or making a network request.
        std::thread::sleep(Duration::from_secs(8));
        if app.state::<DshProcess>().quitting.load(Ordering::SeqCst) {
            return;
        }

        let check_result: Result<Option<tauri_plugin_updater::Update>, String> =
            tauri::async_runtime::block_on(async {
                let updater = app.updater().map_err(|error| error.to_string())?;
                updater.check().await.map_err(|error| error.to_string())
            });
        let update = match check_result {
            Ok(Some(update)) => update,
            Ok(None) => return,
            Err(error) => {
                append_log(
                    &app.state::<DshProcess>().log,
                    &format!("自动检查更新失败：{error}\n"),
                );
                return;
            }
        };

        let prompt = format!(
            "新版本 v{} 可用。\n\n{}\n\n现在下载并安装，完成后 App 会自动重启？",
            update.version,
            update_notes(update.body.as_ref()),
        );
        if !app
            .dialog()
            .message(prompt)
            .title("DeepSeek Harness 有新版本")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "更新".to_string(),
                "稍后".to_string(),
            ))
            .blocking_show()
        {
            return;
        }

        set_tray_summary(&app, &format!("正在下载 v{} 更新…", update.version));
        let mut downloaded = 0_u64;
        let download_result = tauri::async_runtime::block_on(update.download(
            {
                let app = app.clone();
                move |chunk_length, content_length| {
                    downloaded += chunk_length as u64;
                    if let Some(total) = content_length.filter(|total| *total > 0) {
                        let percent = ((downloaded * 100) / total).min(100);
                        set_tray_summary(&app, &format!("正在下载更新… {percent}%"));
                    } else {
                        set_tray_summary(&app, "正在下载更新…");
                    }
                }
            },
            {
                let app = app.clone();
                move || set_tray_summary(&app, "正在准备安装更新…")
            },
        ));
        let bytes = match download_result {
            Ok(bytes) => bytes,
            Err(error) => {
                set_tray_summary(&app, "更新检查完成");
                show_update_error(&app, error.to_string(), false);
                return;
            }
        };

        stop_dsh_for_update(&app.state::<DshProcess>());
        if let Err(error) = update.install(bytes) {
            set_tray_summary(&app, "更新检查完成");
            show_update_error(&app, error.to_string(), true);
            app.restart();
        }

        set_tray_summary(&app, "正在重启到新版本…");
        app.restart();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(days: Value) -> Value {
        json!({
            "projections": {
                "values": {
                    "harnessDesktopInsights": { "byDay": days }
                }
            }
        })
    }

    #[test]
    fn bundled_runtime_tools_precede_system_path() {
        let runtime = std::path::Path::new("/tmp/dsh-runtime");
        let paths = std::env::split_paths(&node_search_path(Some(runtime))).collect::<Vec<_>>();
        assert_eq!(paths[0], runtime.join("node_modules/.bin"));
        assert_eq!(paths[1], runtime);
    }

    #[test]
    fn desktop_web_flags_disable_default_browser_opening() {
        assert_eq!(
            desktop_web_flags(3080),
            vec![
                "--no-open".to_string(),
                "--port".to_string(),
                "3080".to_string(),
            ]
        );
    }

    #[test]
    fn configured_profile_bundles_are_read_from_manifest() {
        let profile = std::env::temp_dir().join(format!(
            "deepseek-harness-profile-test-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&profile).unwrap();
        std::fs::write(
            profile.join("package.json"),
            r#"{"dsh":{"profile":{"bundles":["@anarkhgatsby/deepseek-harness-channel-config","@deepseek-ai/dsh-web-app"]}}}"#,
        )
        .unwrap();

        let bundles = configured_profile_bundles(&profile);
        assert!(bundles.contains("@anarkhgatsby/deepseek-harness-channel-config"));
        assert!(bundles.contains("@deepseek-ai/dsh-web-app"));
        assert!(!bundles.contains("@anarkhgatsby/deepseek-harness-channel-feishu"));

        std::fs::remove_dir_all(profile).unwrap();
    }

    #[test]
    fn bundled_web_args_keep_launcher_patch_before_web_flags() {
        assert_eq!(
            bundled_web_args(
                "lib/bin.js".to_string(),
                &[
                    PathBuf::from("insights.patch.yml"),
                    PathBuf::from("channels.patch.yml"),
                ],
                3080,
            ),
            vec![
                "--expose-internals".to_string(),
                "lib/bin.js".to_string(),
                "web".to_string(),
                "--patch".to_string(),
                "insights.patch.yml".to_string(),
                "--patch".to_string(),
                "channels.patch.yml".to_string(),
                "--no-open".to_string(),
                "--port".to_string(),
                "3080".to_string(),
            ]
        );
    }

    #[test]
    fn aggregates_current_local_week_across_sessions() {
        let list = json!({ "items": [
            session(json!({
                "2026-08-16": { "inputTokens": 99, "calls": 9 },
                "2026-08-17": { "inputTokens": 1000, "outputTokens": 200, "cacheReadTokens": 300, "cacheWriteTokens": 40, "reasoningTokens": 500, "calls": 2 },
                "2026-08-18": { "inputTokens": 60, "outputTokens": 10, "cacheReadTokens": 20, "cacheWriteTokens": 5, "calls": 1 },
                "2026-08-20": { "inputTokens": 9999, "calls": 10 },
                "unknown": { "inputTokens": 9999, "calls": 10 }
            })),
            session(json!({
                "2026-08-17": { "inputTokens": 50, "outputTokens": 5, "cacheReadTokens": 0, "cacheWriteTokens": 0, "calls": 1 }
            })),
            json!({})
        ]});
        let usage = weekly_usage(&list, NaiveDate::from_ymd_opt(2026, 8, 18).unwrap());
        assert_eq!(usage.week_start, "2026-08-17");
        assert_eq!(usage.week_end, "2026-08-18");
        assert_eq!(usage.totals.tokens, 1_690);
        assert_eq!(usage.totals.calls, 4);
        assert_eq!(usage.totals.reasoning_tokens, 500);
        assert_eq!(usage.days[0].totals.tokens, 1_595);
        assert_eq!(usage.days[1].totals.tokens, 95);
        assert_eq!(usage.days.len(), 7);
    }

    #[test]
    fn week_start_crosses_month_boundary() {
        let list = json!({ "items": [session(json!({
            "2026-03-29": { "inputTokens": 100, "calls": 1 },
            "2026-03-30": { "inputTokens": 200, "calls": 2 },
            "2026-04-01": { "outputTokens": 300, "calls": 3 }
        }))]});
        let usage = weekly_usage(&list, NaiveDate::from_ymd_opt(2026, 4, 1).unwrap());
        assert_eq!(usage.week_start, "2026-03-30");
        assert_eq!(usage.totals.tokens, 500);
        assert_eq!(usage.totals.calls, 5);
        assert_eq!(usage.days[0].totals.tokens, 200);
        assert_eq!(usage.days[2].totals.tokens, 300);
    }

    #[test]
    fn formats_compact_tray_values() {
        assert_eq!(compact_count(999), "999");
        assert_eq!(compact_count(1_000), "1K");
        assert_eq!(compact_count(12_400), "12.4K");
        assert_eq!(compact_count(1_250_000), "1.2M");
        let empty = weekly_usage(
            &json!({ "items": [] }),
            NaiveDate::from_ymd_opt(2026, 8, 18).unwrap(),
        );
        assert_eq!(weekly_usage_label(&empty), "本周 · 暂无调用");
        let mut populated = empty;
        populated.totals.tokens = 12_400;
        populated.totals.calls = 34;
        assert_eq!(
            weekly_usage_label(&populated),
            "本周 · 12.4K Token · 34 次调用"
        );
    }

    #[test]
    fn formats_and_limits_update_notes() {
        assert_eq!(update_notes(None), "包含最新功能、兼容性改进和问题修复。");
        assert_eq!(
            update_notes(Some(&"  修复更新流程  ".to_string())),
            "修复更新流程"
        );

        let long_notes = "更".repeat(801);
        let formatted = update_notes(Some(&long_notes));
        assert_eq!(formatted.chars().count(), 801);
        assert!(formatted.ends_with('…'));
    }
}

const ABORT_SIGNAL_POLYFILL: &str = include_str!("../resources/abort-signal-polyfill.js");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry, ()>::new("webkit-compat")
                .js_init_script_on_all_frames(ABORT_SIGNAL_POLYFILL)
                .build(),
        )
        .manage(DshProcess {
            child: Mutex::new(None),
            port: Mutex::new(None),
            log: Arc::new(Mutex::new(String::new())),
            quitting: AtomicBool::new(false),
            automatic_restart_used: AtomicBool::new(false),
            workspace_opened: AtomicBool::new(false),
            recovering: AtomicBool::new(false),
            recovery_required: AtomicBool::new(false),
            restart_confirmation: Mutex::new(None),
            tray_summary: Mutex::new(None),
        })
        .setup(|app| {
            setup_tray(app.handle())?;
            setup_recovery_window(app.handle())?;
            setup_insights_panel(app.handle())?;
            start_local_window_controller(app.handle().clone());
            start_dsh_supervisor(app.handle().clone());
            start_update_checker(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_dsh,
            request_restart_confirmation,
            restart_dsh,
            tray_insights_snapshot,
            tray_insights_open_main,
            dsh_status,
            open_workspace,
            dsh_api_request,
            stop_dsh
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::CloseRequested { api, .. },
                ..
            } if matches!(label.as_str(), "splash" | "recovery" | "insights-panel") => {
                let state = app_handle.state::<DshProcess>();
                if !state.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window(&label) {
                        let _ = window.hide();
                    }
                }
            }
            tauri::RunEvent::WindowEvent {
                label,
                event: tauri::WindowEvent::Focused(false),
                ..
            } if label == "insights-panel" => {
                if let Some(panel) = app_handle.get_webview_window("insights-panel") {
                    let _ = panel.hide();
                }
            }
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => show_main_window(app_handle),
            tauri::RunEvent::ExitRequested { .. } => {
                app_handle
                    .state::<DshProcess>()
                    .quitting
                    .store(true, Ordering::SeqCst);
            }
            tauri::RunEvent::Exit => {
                let state = app_handle.state::<DshProcess>();
                state.quitting.store(true, Ordering::SeqCst);
                let _ = state.child.lock().map(|mut process| {
                    if let Some(mut child) = process.take() {
                        let _ = terminate_child(&mut child);
                    }
                });
            }
            _ => {}
        });
}
