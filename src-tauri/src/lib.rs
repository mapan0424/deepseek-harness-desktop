use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{LogicalSize, Manager, PhysicalPosition, Size};

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
            let trim_at = current.len() - 8_192;
            current.drain(..trim_at);
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

fn prepare_insights_overlay(node: &std::path::Path) -> Result<PathBuf, String> {
    let runtime = node
        .parent()
        .ok_or_else(|| "无法定位内置 runtime".to_string())?;
    let source = runtime.join("node_modules/@anarkhgatsby/deepseek-harness-insights");
    let overlay = source.join("cordis.patch.yml");
    if !overlay.is_file()
        || !source.join("lib/index.js").is_file()
        || !source.join("lib/client.js").is_file()
    {
        return Err("内置 Harness Insights 插件文件不完整".to_string());
    }

    // The Web profile resolves out-of-tree packages upward from
    // $DSH_HOME/profiles/web, so $DSH_HOME/node_modules is its stable package
    // root. Deploy a tiny pure-JS copy; usage data remains in Harness-owned
    // projections and never lives inside this replaceable package directory.
    let destination = dsh_home()?.join("node_modules/@anarkhgatsby/deepseek-harness-insights");
    let temporary = destination.with_extension(format!("tmp-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&temporary);
    copy_directory(&source, &temporary)?;
    let _ = std::fs::remove_dir_all(&destination);
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("创建 Harness 插件根目录失败：{error}"))?;
    }
    std::fs::rename(&temporary, &destination)
        .map_err(|error| format!("启用内置 Insights 插件失败：{error}"))?;
    Ok(overlay)
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
        let mut args = vec![
            "--expose-internals".to_string(),
            entry_arg,
            "web".to_string(),
        ];
        match prepare_insights_overlay(&node) {
            Ok(plugin_patch) => {
                args.push("--patch".to_string());
                args.push(plugin_patch.to_string_lossy().into_owned());
            }
            Err(error) => append_log(
                &state.log,
                &format!("内置 Harness Insights 插件不可用，继续启动核心工作台：{error}\n"),
            ),
        }
        args.push("--port".to_string());
        args.push(active_port.to_string());
        (node, args, true)
    } else if cfg!(debug_assertions) {
        (
            PathBuf::from(npx_path()),
            vec![
                "--yes".to_string(),
                "@deepseek-ai/dsh".to_string(),
                "web".to_string(),
                "--port".to_string(),
                active_port.to_string(),
            ],
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

    let rpc_id = format!("native-{}-{}", std::process::id(), chrono_like_timestamp());
    let body = json!({
        "type": "client-request",
        "rpcId": rpc_id,
        "method": method,
        "payload": payload,
    })
    .to_string();
    let url = format!("http://127.0.0.1:{port}/api/{}", body_method(&body)?);

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
            "60",
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

fn body_method(body: &str) -> Result<String, String> {
    serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("method")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .ok_or_else(|| "无法生成 dsh 请求路径".to_string())
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
        let _ = window.center();
        let _ = window.unminimize();
        let _ = window.show();
        // Do not steal focus while the user may still be typing in the failed
        // workspace. Recovery requires an explicit interaction with this window.
    } else {
        append_log(&app.state::<DshProcess>().log, "预加载的恢复窗口不可用\n");
    }
}

fn setup_recovery_window(app: &tauri::AppHandle) -> Result<(), String> {
    tauri::WebviewWindowBuilder::new(
        app,
        "recovery",
        tauri::WebviewUrl::App("recovery.html".into()),
    )
    .title("DeepSeek Harness — 恢复工作台")
    .inner_size(560.0, 420.0)
    .resizable(false)
    .position(-10_000.0, -10_000.0)
    .visible(true)
    .build()
    .map(|window| {
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(2));
            let _ = window.hide();
        });
    })
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
        let restart_was_used = state.automatic_restart_used.swap(true, Ordering::SeqCst);
        if restart_was_used {
            state.recovery_required.store(true, Ordering::SeqCst);
            state.workspace_opened.store(false, Ordering::SeqCst);
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
            let window = app
                .get_webview_window("splash")
                .or_else(|| app.get_webview_window("recovery"));
            if let Some(window) = window {
                if let Ok(url) = format!("http://127.0.0.1:{active_port}").parse() {
                    let _ = window.navigate(url);
                }
            }
        } else if !state.quitting.load(Ordering::SeqCst) {
            state.workspace_opened.store(false, Ordering::SeqCst);
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
        .cloned()
        .ok_or_else(|| "缺少托盘图标".to_string())
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), String> {
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
    let menu = Menu::with_items(app, &[&open, &quit])
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
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)
        .map_err(|error| format!("创建托盘图标失败：{error}"))?;
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

const ABORT_SIGNAL_POLYFILL: &str = include_str!("../resources/abort-signal-polyfill.js");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
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
        })
        .setup(|app| {
            setup_tray(app.handle())?;
            setup_recovery_window(app.handle())?;
            start_dsh_supervisor(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_dsh,
            request_restart_confirmation,
            restart_dsh,
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
            } if matches!(label.as_str(), "splash" | "recovery") => {
                let state = app_handle.state::<DshProcess>();
                if !state.quitting.load(Ordering::SeqCst) {
                    api.prevent_close();
                    if let Some(window) = app_handle.get_webview_window(&label) {
                        let _ = window.hide();
                    }
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
