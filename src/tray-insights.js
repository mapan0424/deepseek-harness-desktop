const { invoke } = window.__TAURI__.core;

const ids = ["tokens", "calls", "input", "output", "cache-read", "cache-write", "reasoning"];
const elements = Object.fromEntries(ids.map((id) => [id, document.querySelector(`#${id}`)]));
const chart = document.querySelector("#chart");
const range = document.querySelector("#range");
const status = document.querySelector("#status");
const openButton = document.querySelector("#open-insights");
const activityTotal = document.querySelector("#activity-total");
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];

function compact(value) {
  const number = Number.isFinite(value) && value >= 0 ? value : 0;
  if (number < 1000) return String(Math.round(number));
  if (number < 1e6) return `${trim(number / 1e3)}K`;
  if (number < 1e9) return `${trim(number / 1e6)}M`;
  return `${trim(number / 1e9)}B`;
}

function trim(value) {
  return value >= 100 || Math.abs(value - Math.round(value)) < .05
    ? String(Math.round(value))
    : value.toFixed(1);
}

function showStatus(message) {
  status.textContent = message;
  status.classList.remove("hidden");
}

function hideStatus() {
  status.classList.add("hidden");
}

function renderChart(days, today) {
  const max = Math.max(1, ...days.map((day) => day.totals.tokens));
  chart.replaceChildren(...days.map((day, index) => {
    const value = day.totals.tokens;
    const height = value === 0 ? 3 : Math.max(8, Math.round(value / max * 61));
    const node = document.createElement("div");
    node.className = "day";
    node.dataset.today = String(day.date === today);
    node.title = `${day.date}\n${compact(value)} Token · ${compact(day.totals.calls)} 次调用`;
    node.innerHTML = `<div class="bar-track"><i class="bar" data-empty="${value === 0}" style="height:${height}px"></i></div><label>${weekdays[index]}</label>`;
    return node;
  }));
}

function render(snapshot) {
  if (snapshot.status !== "ready") {
    const message = snapshot.status === "recovering" ? "Harness 正在恢复…" : "用量暂不可用";
    showStatus(message);
    return;
  }
  hideStatus();
  const usage = snapshot.usage;
  const totals = usage.totals;
  elements.tokens.textContent = compact(totals.tokens);
  elements.calls.textContent = compact(totals.calls);
  elements.input.textContent = compact(totals.inputTokens);
  elements.output.textContent = compact(totals.outputTokens);
  elements["cache-read"].textContent = compact(totals.cacheReadTokens);
  elements["cache-write"].textContent = compact(totals.cacheWriteTokens);
  elements.reasoning.textContent = compact(totals.reasoningTokens);
  range.textContent = `${usage.weekStart.slice(5).replace("-", ".")} — ${usage.weekEnd.slice(5).replace("-", ".")}`;
  activityTotal.textContent = totals.calls === 0 ? "本周暂无调用" : `${compact(totals.calls)} 次模型调用`;
  renderChart(usage.days, usage.weekEnd);
}

async function load() {
  showStatus("正在读取本周用量…");
  try {
    render(await invoke("tray_insights_snapshot"));
  } catch (error) {
    showStatus(`暂时无法读取用量：${String(error).replace(/^Error:\s*/, "")}`);
  }
}

openButton.addEventListener("click", () => invoke("tray_insights_open_main"));
window.addEventListener("tray-panel-open", load);
load();
