use std::io::{BufRead, BufReader, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::webview::PageLoadEvent;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

struct DshProcess {
    child: Mutex<Option<Child>>,
    port: Mutex<Option<u16>>,
    log: Arc<Mutex<String>>,
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

    let mut process = state
        .child
        .lock()
        .map_err(|_| "无法取得 dsh 进程锁".to_string())?;

    if process.is_some() {
        let active_port = state
            .port
            .lock()
            .map_err(|_| "无法取得 dsh 端口锁".to_string())?
            .unwrap_or(port);
        return Ok(format!("http://127.0.0.1:{active_port}"));
    }

    let active_port = find_available_port(port)?;
    if let Ok(mut log) = state.log.lock() {
        log.clear();
    }

    let (program, args, using_bundled_runtime) = if let Some((node, entry)) = bundled_runtime(&app)
    {
        // Passing a Windows drive-qualified script path through the installed
        // process chain can be reduced to `C:` by Node's entry-point parser.
        // Run from the embedded runtime and use a relative script path there.
        let entry_arg = if cfg!(windows) {
            "node_modules/@deepseek-ai/dsh/lib/bin.js".to_string()
        } else {
            entry.to_string_lossy().into_owned()
        };
        (
            node,
            vec![
                "--expose-internals".to_string(),
                entry_arg,
                "web".to_string(),
                "--port".to_string(),
                active_port.to_string(),
            ],
            true,
        )
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

    *process = Some(child);
    *state
        .port
        .lock()
        .map_err(|_| "无法取得 dsh 端口锁".to_string())? = Some(active_port);
    Ok(format!("http://127.0.0.1:{active_port}"))
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
fn open_main_window(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
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

    if let Some(window) = app.get_webview_window("main") {
        window
            .show()
            .map_err(|error| format!("显示主窗口失败：{error}"))?;
        window
            .set_focus()
            .map_err(|error| format!("聚焦主窗口失败：{error}"))?;
        return Ok(());
    }

    let url = format!("http://127.0.0.1:{active_port}")
        .parse()
        .map_err(|error| format!("生成本地工作台地址失败：{error}"))?;
    WebviewWindowBuilder::new(&app, "main", WebviewUrl::External(url))
        .title("DeepSeek Harness — 非官方客户端")
        .inner_size(1240.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .visible(false)
        .on_page_load(|window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let _ = window.show();
            let _ = window.set_focus();
            if let Some(splash) = window.app_handle().get_webview_window("splash") {
                let _ = splash.close();
            }
        })
        .build()
        .map_err(|error| format!("打开工作台失败：{error}"))?;
    Ok(())
}

fn require_splash(window: &tauri::WebviewWindow) -> Result<(), String> {
    if window.label() == "splash" {
        Ok(())
    } else {
        Err("该命令仅允许启动窗口调用".to_string())
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
        })
        .invoke_handler(tauri::generate_handler![
            start_dsh,
            dsh_status,
            open_main_window,
            dsh_api_request,
            stop_dsh
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                let state = app_handle.state::<DshProcess>();
                let _ = state.child.lock().map(|mut process| {
                    if let Some(mut child) = process.take() {
                        let _ = terminate_child(&mut child);
                    }
                });
            }
        });
}
