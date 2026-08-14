const { invoke } = window.__TAURI__.core;

const preferredPort = 3080;
const bootScreen = document.querySelector("#boot-screen");
const bootStatus = document.querySelector("#boot-status");
const progressBar = document.querySelector("#boot-progress-bar");
const retryButton = document.querySelector("#boot-retry");
const shell = document.querySelector("#native-shell");
const frame = document.querySelector("#dsh-frame");

function setStatus(message, progress) {
  bootStatus.textContent = message;
  progressBar.style.width = `${progress}%`;
}

async function start() {
  retryButton.classList.add("hidden");
  setStatus("正在启动本地 Agent…", 12);

  try {
    const url = await invoke("start_dsh", { port: preferredPort });
    const activePort = Number(new URL(url).port);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = await invoke("dsh_status", { port: activePort });
      if (status === "ready") {
        setStatus("正在打开工作台…", 92);
        frame.src = url;
        return;
      }
      setStatus(attempt > 10 ? "正在准备本地运行时…" : "正在启动本地 Agent…", Math.min(86, 12 + attempt / 3));
    }
    throw new Error("启动超时，请检查网络连接或重新打开 App");
  } catch (error) {
    setStatus(`连接失败：${String(error).replace(/^Error:\s*/, "")}`, 100);
    retryButton.classList.remove("hidden");
  }
}

frame.addEventListener("load", () => {
  shell.classList.remove("hidden");
  bootScreen.classList.add("hidden");
});

retryButton.addEventListener("click", start);
window.addEventListener("beforeunload", () => invoke("stop_dsh").catch(() => {}));

start();
