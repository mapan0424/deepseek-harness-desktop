const { invoke } = window.__TAURI__.core;

const preferredPort = 3080;
const bootStatus = document.querySelector("#boot-status");
const progressBar = document.querySelector("#boot-progress-bar");
const retryButton = document.querySelector("#boot-retry");

function setStatus(message, progress) {
  bootStatus.textContent = message;
  progressBar.style.width = `${progress}%`;
}

async function restart(confirmation) {
  retryButton.classList.add("hidden");
  setStatus("正在重新启动本地 Agent…", 12);

  try {
    const url = await invoke("restart_dsh", { port: preferredPort, confirmation });
    const activePort = Number(new URL(url).port);
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const status = await invoke("dsh_status", { port: activePort });
      if (status === "ready") {
        setStatus("正在恢复工作台…", 92);
        await invoke("open_workspace", { port: activePort });
        return;
      }
      setStatus("正在重新启动本地 Agent…", Math.min(86, 12 + attempt / 3));
    }
    throw new Error("恢复超时，请再次重试或退出 App");
  } catch (error) {
    setStatus(`恢复失败：${String(error).replace(/^Error:\s*/, "")}`, 100);
    retryButton.classList.remove("hidden");
  }
}

const enableAt = Date.now() + 2000;
let confirmation = "";
let requestingConfirmation = false;
window.setTimeout(() => {
  retryButton.disabled = false;
}, 2000);

retryButton.addEventListener("click", (event) => {
  const now = Date.now();
  if (!event.isTrusted || now < enableAt || retryButton.disabled) return;
  if (!confirmation) {
    if (requestingConfirmation) return;
    requestingConfirmation = true;
    retryButton.disabled = true;
    invoke("request_restart_confirmation")
      .then((token) => {
        confirmation = token;
        retryButton.textContent = "确认重新启动";
        setStatus("请等待 3 秒，然后再次点击确认重新启动。", 100);
        window.setTimeout(() => {
          retryButton.disabled = false;
        }, 3000);
      })
      .catch((error) => {
        setStatus(`无法确认恢复：${String(error).replace(/^Error:\s*/, "")}`, 100);
        retryButton.disabled = false;
      })
      .finally(() => {
        requestingConfirmation = false;
      });
    return;
  }
  restart(confirmation);
});
