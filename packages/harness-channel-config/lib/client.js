/**
 * client.js — harness-channel-config web client（设置页「消息通道」分区）
 *
 * 现代化消息通道控制台：
 *   - 顶部统计指标：已连接通道数、活跃会话数、待接入通道
 *   - 分组标签切换：【已接入通道 (默认)】、【可添加通道】、【全部通道】
 *   - 严谨识别已配置凭证（仅真正配置的通道显示为已连接）
 *   - 现代化品牌卡片与状态流光指示灯
 *   - ⚡【可视化直接配置】：支持弹窗直接填写/修改各通道参数（AppID、Secret、Token、工作空间等），
 *     支持密码明文切换、表单校验并一键保存写回 settings.yaml 与热重载网关。
 */
window.__ModuleLoader__.load({
  id: "@anarkhgatsby/deepseek-harness-channel-config",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const { Button } = require("@deepseek-ai/dsh-client-ui-primitives");

    const STYLE_ID = "@anarkhgatsby/deepseek-harness-channel-config/main-v2";
    const NS = "harness-channel-config";

    const copy = {
      zh: {
        nav: "消息通道",
        title: "消息通道",
        sub: "管理接入 DeepSeek Harness 的消息服务。所有配置本地保存，数据点对点直连，隐私安全无泄漏。",
        refresh: "刷新",
        statConnected: "已接入",
        statSessions: "活跃会话",
        unitChannels: "个通道",
        unitSessions: "个外部会话",
        loading: "正在同步通道状态…",
        error: "读取失败",
        statusOnline: "已连接运行",
        statusInactive: "未接入",
        statusAuthorization: "需要授权",
        statusAuthorized: "已授权接收",
        sessionsCount: "个活跃会话",
        btnConfigure: "配置参数",
        btnQuickAdd: "+ 快速接入",
        noConnectedTitle: "暂无已接入通道",
        noConnectedSub: "未检测到已验证的消息通道。",
        modalTitle: "通道配置",
        save: "保存配置",
        saving: "正在保存…",
        saveSuccess: "配置已保存并生效！",
        cancel: "取消",
        searchPlaceholder: "搜索通道名称或功能…",
        showPassword: "显示密码",
        hidePassword: "隐藏密码",
        feishuLabel: "飞书",
        feishuDesc: "企业自建应用，支持富文本卡片交互、打字机流式输出与群聊/私聊回复。",
        feishuGuide: "登录飞书开放平台 (open.feishu.cn) 创建企业自建应用，开启机器人能力，获取 App ID 与 App Secret。",
        imessageLabel: "iMessage",
        imessageDesc: "macOS 原生 AppleScript + chat.db 监听，支持本地直连无中转收发 iMessage 短信。",
        imessageGuide: "利用 macOS 本地信息数据库与 AppleScript 直接与系统「信息」应用协同，数据完全保存在本机。",
        fieldAppId: "App ID (应用唯一标识)",
        fieldAppSecret: "App Secret (应用密钥)",
        fieldVerifyToken: "Verification Token (事件校验，选填)",
        fieldVerifyTokenPlaceholder: "可选事件校验 Token",
        fieldEncryptKey: "Encrypt Key (事件加密，选填)",
        fieldEncryptKeyPlaceholder: "可选事件加密 Key",
        fieldWorkspace: "默认工作空间路径",
        fieldAutoReply: "自动回复消息",
        fieldCardReplies: "富文本卡片格式回复",
        fieldStreamReplies: "打字机流式输出",
        fieldChatDb: "chat.db 数据库路径",
        summaryWorkspace: "工作空间",
        summaryNotConfigured: "未配置 App ID",
        summaryModeLocal: "本地原生直连 (chat.db)",
        imessageAuthTitle: "iMessage 需要 macOS 授权",
        imessageAuthDatabaseDenied: "未获得 chat.db 读取权限",
        imessageAuthDatabaseReady: "chat.db 读取权限已授予；自动化权限会在首次发送回复时验证",
        imessageAuthGuide: "请打开“系统设置 → 隐私与安全性”，为 DeepSeek Harness 开启“完全磁盘访问”和“自动化 → 信息”，然后重启应用。",
      },
      en: {
        nav: "Channels",
        title: "Message Channels",
        sub: "Manage messaging gateways connected to DeepSeek Harness. Configuration is stored locally with end-to-end privacy.",
        refresh: "Refresh",
        statConnected: "Connected",
        statSessions: "Active Sessions",
        unitChannels: " channels",
        unitSessions: " sessions",
        loading: "Syncing channel status…",
        error: "Failed to read",
        statusOnline: "Connected & Online",
        statusInactive: "Not Connected",
        statusAuthorization: "Authorization Required",
        statusAuthorized: "Receiving Authorized",
        sessionsCount: " active sessions",
        btnConfigure: "Configure",
        btnQuickAdd: "+ Connect",
        noConnectedTitle: "No Connected Channels",
        noConnectedSub: "No verified messaging channels detected.",
        modalTitle: "Configuration",
        save: "Save Changes",
        saving: "Saving…",
        saveSuccess: "Configuration saved and active!",
        cancel: "Cancel",
        searchPlaceholder: "Search channels…",
        showPassword: "Show",
        hidePassword: "Hide",
        feishuLabel: "Feishu / Lark",
        feishuDesc: "Enterprise custom bot with interactive rich cards, typewriter streaming, and group/direct chat replies.",
        feishuGuide: "Log in to Feishu Open Platform (open.feishu.cn), create an enterprise custom app, enable bot capabilities, and obtain your App ID and App Secret.",
        imessageLabel: "iMessage",
        imessageDesc: "Native macOS AppleScript + chat.db listener for direct, local message dispatch without third-party relays.",
        imessageGuide: "Integrates directly with macOS native Messages app via local database and AppleScript, ensuring complete privacy.",
        fieldAppId: "App ID",
        fieldAppSecret: "App Secret",
        fieldVerifyToken: "Verification Token (Optional)",
        fieldVerifyTokenPlaceholder: "Optional verification token",
        fieldEncryptKey: "Encrypt Key (Optional)",
        fieldEncryptKeyPlaceholder: "Optional encryption key",
        fieldWorkspace: "Default Workspace Path",
        fieldAutoReply: "Auto-reply to incoming messages",
        fieldCardReplies: "Rich card format replies",
        fieldStreamReplies: "Typewriter stream replies",
        fieldChatDb: "chat.db Database Path",
        summaryWorkspace: "Workspace",
        summaryNotConfigured: "App ID not configured",
        summaryModeLocal: "Local Native (chat.db)",
        imessageAuthTitle: "iMessage requires macOS authorization",
        imessageAuthDatabaseDenied: "chat.db read access is not granted",
        imessageAuthDatabaseReady: "chat.db read access is granted; automation access will be checked when sending a reply",
        imessageAuthGuide: "Open System Settings → Privacy & Security and allow DeepSeek Harness under Full Disk Access and Automation → Messages, then restart the app.",
      },
    };

    const translated = (t) => Object.fromEntries(Object.keys(copy.zh).map((key) => [key, t(key)]));

    function installStyle() {
      if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = `
        .cc-root {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 4px 0 32px;
          max-width: 820px;
          font-family: var(--dsw-font-family);
          color: var(--dsw-alias-label-primary);
        }

        /* 顶部 Header */
        .cc-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .cc-title-area { max-width: 680px; }
        .cc-main-title {
          font: var(--dsw-font-xl-24);
          color: var(--dsw-alias-label-primary);
          margin: 0 0 6px 0;
          letter-spacing: -0.01em;
        }
        .cc-main-sub {
          font: var(--dsw-font-xs-13);
          color: var(--dsw-alias-label-tertiary);
          margin: 0;
          line-height: 20px;
        }

        /* 统计与状态概览条（紧凑胶囊设计） */
        .cc-summary-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .cc-stat-pills {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cc-stat-pill-item {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 99px;
          background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l2);
          font: var(--dsw-font-xxs-12);
          color: var(--dsw-alias-label-secondary);
        }
        .cc-stat-pill-val {
          font-weight: 600;
          color: var(--dsw-alias-label-primary);
        }

        .cc-search-input {
          background: var(--dsw-alias-bg-layer-1);
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 8px;
          padding: 6px 12px;
          font-family: var(--dsw-font-family);
          font-size: 12px;
          color: var(--dsw-alias-label-primary);
          outline: none;
          min-width: 200px;
          transition: border-color var(--ds-transition-duration, 0.2s);
        }
        .cc-search-input:focus {
          border-color: var(--dsw-alias-state-business-primary);
          box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary);
        }
        .cc-search-input::placeholder { color: var(--dsw-alias-label-caption); }

        /* DSH 原生分组列表容器 */
        .cc-list-group {
          background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: var(--dsw-shadow-lv1-blur);
        }

        /* 列表单行 */
        .cc-list-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          gap: 16px;
          border-bottom: 1px solid var(--dsw-alias-border-l1);
          transition: background var(--ds-transition-duration, 0.15s);
        }
        .cc-list-row:last-child {
          border-bottom: none;
        }
        .cc-list-row:hover {
          background: var(--dsw-alias-interactive-bg-hover);
        }

        /* 行左侧 Brand 信息 */
        .cc-row-left {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          flex: 1;
        }
        .cc-row-icon-wrap {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          background: transparent;
        }
        .cc-row-info {
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .cc-row-title-line {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cc-row-name {
          font: var(--dsw-font-s-strong-14);
          color: var(--dsw-alias-label-primary);
          line-height: 1.2;
        }
        .cc-row-badge {
          font: var(--dsw-font-xxxs-11);
          color: var(--dsw-alias-label-caption);
          font-family: var(--ds-font-family-code);
          background: var(--dsw-alias-bg-layer-1);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--dsw-alias-border-l1);
        }
        .cc-row-meta {
          font: var(--dsw-font-xxs-12);
          color: var(--dsw-alias-label-tertiary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* 行右侧状态与操作 */
        .cc-row-right {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }
        .cc-row-status-box {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cc-row-sessions {
          font: var(--dsw-font-xxs-12);
          color: var(--dsw-alias-label-secondary);
          display: flex;
          align-items: center;
          gap: 4px;
        }

        /* 状态指示药丸 */
        .cc-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 99px;
          font: var(--dsw-font-xxxs-strong-11);
        }
        .cc-status-pill[data-status="online"] {
          background: var(--dsw-alias-state-success-tertiary);
          color: var(--dsw-alias-state-success-primary);
        }
        .cc-status-pill[data-status="offline"] {
          background: var(--dsw-alias-bg-skeleton, rgba(127, 127, 127, 0.1));
          color: var(--dsw-alias-label-tertiary);
        }
        .cc-status-pill[data-status="auth"] {
          background: rgba(245, 158, 11, 0.14);
          color: var(--dsw-alias-state-warning-primary, #b45309);
        }
        .cc-status-pill[data-status="authorized"] {
          background: var(--dsw-alias-state-success-tertiary);
          color: var(--dsw-alias-state-success-primary);
        }
        .cc-pulse-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .cc-auth-warning {
          margin: -1px 18px 14px;
          padding: 10px 12px;
          border: 1px solid rgba(245, 158, 11, 0.35);
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.09);
          color: var(--dsw-alias-label-secondary);
          font: var(--dsw-font-xxs-12);
          line-height: 18px;
        }
        .cc-status-pill[data-status="online"] .cc-pulse-dot {
          box-shadow: 0 0 0 2px var(--dsw-alias-state-success-tertiary);
          animation: cc-pulse 2s infinite;
        }
        @keyframes cc-pulse {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
          gap: 8px;
          cursor: pointer;
          padding: 20px;
          text-align: center;
          transition: all var(--ds-transition-duration, 0.2s);
        }
        .cc-add-card:hover {
          border-color: var(--dsw-alias-state-business-primary);
          background: var(--dsw-alias-interactive-bg-hover);
          transform: translateY(-1px);
        }
        .cc-add-icon {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--dsw-alias-interactive-bg-hover-solid, var(--dsw-alias-bg-layer-2));
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: var(--dsw-alias-label-secondary);
        }
        .cc-add-card:hover .cc-add-icon {
          background: var(--dsw-alias-brand-primary, var(--dsw-static-deepseek-500));
          color: var(--dsw-alias-label-primary-inverted, #ffffff);
        }
        .cc-add-text {
          font: var(--dsw-font-xs-strong-13);
          color: var(--dsw-alias-label-primary);
          margin: 0;
        }
        .cc-add-sub {
          font: var(--dsw-font-xxs-12);
          color: var(--dsw-alias-label-tertiary);
          margin: 0;
          max-width: 200px;
        }

        /* 模态配置弹窗 (Modal 对齐 DSH 弹窗规范) */
        .cc-modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--dsw-alias-bg-mask-1);
          backdrop-filter: var(--dsw-mask-blur, blur(4px));
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          padding: 20px;
          animation: cc-fadein 0.15s ease-out;
        }
        @keyframes cc-fadein { from { opacity: 0; } to { opacity: 1; } }

        .cc-modal {
          background: var(--dsw-alias-bg-base);
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 14px;
          width: 100%;
          max-width: 540px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: var(--dsw-shadow-lv3);
          overflow: hidden;
          animation: cc-popin 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes cc-popin {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }

        .cc-modal-head {
          padding: 16px 20px;
          border-bottom: 1px solid var(--dsw-alias-border-l2);
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: var(--dsw-alias-bg-layer-1);
        }
        .cc-modal-head-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .cc-modal-close-btn {
          background: transparent;
          border: none;
          font-size: 18px;
          color: var(--dsw-alias-label-tertiary);
          cursor: pointer;
          padding: 4px;
          line-height: 1;
          border-radius: 6px;
          transition: all 0.1s;
        }
        .cc-modal-close-btn:hover {
          color: var(--dsw-alias-label-primary);
          background: var(--dsw-alias-interactive-bg-hover);
        }

        .cc-modal-body {
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: var(--dsw-alias-bg-base);
        }
        .cc-modal-guide {
          background: var(--dsw-alias-bg-module-platform, var(--dsw-alias-bg-layer-2));
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 8px;
          padding: 10px 12px;
          font: var(--dsw-font-xxs-12);
          line-height: 18px;
          color: var(--dsw-alias-label-secondary);
        }

        .cc-form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cc-form-label {
          font: var(--dsw-font-xxs-strong-12);
          color: var(--dsw-alias-label-primary);
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .cc-form-req {
          color: var(--dsw-alias-state-error-primary);
          font-size: 11px;
        }

        .cc-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .cc-form-input {
          width: 100%;
          background: var(--dsw-alias-bg-layer-1);
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: var(--dsw-font-family);
          font-size: 13px;
          color: var(--dsw-alias-label-primary);
          outline: none;
          transition: border-color var(--ds-transition-duration, 0.2s);
        }
        .cc-form-input:focus {
          border-color: var(--dsw-alias-state-business-primary);
          box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary);
        }
        .cc-form-input[type="password"] { font-family: var(--ds-font-family-code); }

        .cc-pwd-toggle {
          position: absolute;
          right: 6px;
          background: transparent;
          border: none;
          font: var(--dsw-font-xxxs-11);
          color: var(--dsw-alias-label-tertiary);
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 4px;
        }
        .cc-pwd-toggle:hover { color: var(--dsw-alias-label-primary); }

        .cc-form-select {
          width: 100%;
          background: var(--dsw-alias-bg-layer-1);
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 8px;
          padding: 8px 12px;
          font-family: var(--dsw-font-family);
          font-size: 13px;
          color: var(--dsw-alias-label-primary);
          outline: none;
        }

        .cc-form-switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: var(--dsw-alias-bg-layer-1);
          border: 1px solid var(--dsw-alias-border-l2);
          border-radius: 8px;
          cursor: pointer;
        }
        .cc-form-switch-label {
          font: var(--dsw-font-xxs-strong-12);
          color: var(--dsw-alias-label-primary);
        }
        .cc-switch {
          position: relative;
          width: 34px;
          height: 18px;
          background: var(--dsw-alias-border-l4, rgba(127, 127, 127, 0.3));
          border-radius: 18px;
          transition: background var(--ds-transition-duration-fast, 0.1s);
        }
        .cc-switch[data-checked="true"] { background: var(--dsw-alias-brand-primary, var(--dsw-static-deepseek-500)); }
        .cc-switch-thumb {
          position: absolute;
          top: 2px;
          left: 2px;
          width: 14px;
          height: 14px;
          background: #ffffff;
          border-radius: 50%;
          transition: transform var(--ds-transition-duration-fast, 0.1s) cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .cc-switch[data-checked="true"] .cc-switch-thumb {
          transform: translateX(16px);
        }

        .cc-modal-footer {
          padding: 14px 20px;
          border-top: 1px solid var(--dsw-alias-border-l2);
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          background: var(--dsw-alias-bg-layer-1);
        }

        .cc-msg-banner {
          padding: 8px 12px;
          border-radius: 8px;
          font: var(--dsw-font-xxs-12);
          line-height: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cc-msg-success {
          background: var(--dsw-alias-state-success-tertiary);
          border: 1px solid var(--dsw-alias-state-success-primary);
          color: var(--dsw-alias-state-success-primary);
        }
        .cc-msg-err {
          background: var(--dsw-alias-interactive-bg-hover-danger);
          border: 1px solid var(--dsw-alias-state-error-primary);
          color: var(--dsw-alias-state-error-primary);
        }
      `;
      document.head.appendChild(style);
    }

    /** 平台 SVG 矢量图标渲染（官方原生品牌标准资产） */
    function ChannelIcon({ id, color, size = 22 }) {
      switch (id) {
        case "feishu":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            // 飞书官方飞鸟 Logo（青绿/天蓝/深蓝三色渐进羽翼）
            React.createElement("path", {
              d: "M12.9238 12.8029C12.9427 12.784 12.9616 12.7682 12.9806 12.7493C13.0184 12.7146 13.0563 12.6767 13.091 12.6389L13.1667 12.5631L13.397 12.336L14.7315 11.0173L15.0659 10.686C15.129 10.6229 15.1952 10.563 15.2615 10.5031C15.3845 10.3926 15.5076 10.2854 15.6369 10.1813C15.7536 10.0866 15.8767 9.99514 15.9997 9.9068C16.1732 9.78376 16.3499 9.67019 16.5329 9.55977C16.7127 9.45251 16.8957 9.35471 17.085 9.26322C17.2616 9.17804 17.4415 9.09917 17.6276 9.02661C17.7317 8.9856 17.8326 8.94774 17.9399 8.91304C17.9935 8.89411 18.044 8.87834 18.0977 8.86256C17.6276 7.00439 16.7632 5.3008 15.5991 3.84959C15.3719 3.56566 15.0249 3.40161 14.6589 3.40161H5.0084C4.83489 3.40161 4.76233 3.6256 4.90114 3.72656C8.18528 6.13997 10.9236 9.24114 12.9017 12.825C12.908 12.8187 12.9175 12.8124 12.9238 12.8029Z",
              fill: "#00D6B9",
            }),
            React.createElement("path", {
              d: "M9.09696 21.2986C14.0815 21.2986 18.4225 18.5476 20.6877 14.4843C20.7666 14.3423 20.8454 14.1972 20.918 14.052C20.8044 14.2729 20.6751 14.4811 20.5394 14.6767C20.4889 14.7461 20.4385 14.8155 20.388 14.8818C20.3217 14.9669 20.2555 15.049 20.1861 15.1278C20.1324 15.1909 20.0757 15.2509 20.0189 15.3108C19.9021 15.4307 19.7823 15.5474 19.6561 15.6547C19.5867 15.7146 19.5141 15.7714 19.4415 15.8282C19.3564 15.8944 19.268 15.9575 19.1797 16.0143C19.1229 16.0522 19.0661 16.09 19.0093 16.1247C18.9494 16.1626 18.8895 16.1973 18.8264 16.232C18.7002 16.3014 18.574 16.3645 18.4446 16.4245C18.3311 16.4749 18.2175 16.5223 18.1008 16.5633C17.9746 16.6106 17.8452 16.6516 17.7159 16.6863C17.5234 16.7399 17.3247 16.7809 17.1259 16.8125C16.9808 16.8346 16.8357 16.8504 16.6874 16.863C16.5328 16.8724 16.3751 16.8787 16.2173 16.8756C16.0438 16.8724 15.8703 16.863 15.6936 16.844C15.5643 16.8314 15.435 16.8125 15.3056 16.7873C15.192 16.7683 15.0785 16.7431 14.9649 16.7178C14.9049 16.7021 14.845 16.6895 14.7851 16.6737C14.6179 16.6295 14.4538 16.5822 14.2898 16.5349C14.2077 16.5096 14.1257 16.4875 14.0437 16.4623C13.9206 16.4245 13.7976 16.3897 13.6777 16.3519C13.5768 16.3203 13.479 16.2888 13.378 16.2572C13.2834 16.2257 13.1887 16.1942 13.0941 16.1626C13.031 16.1405 12.9647 16.1184 12.9016 16.0964C12.8228 16.0711 12.7471 16.0427 12.6682 16.0143C12.6114 15.9954 12.5578 15.9765 12.501 15.9544C12.3906 15.9134 12.2802 15.8755 12.1729 15.8345C12.1098 15.8093 12.0467 15.7872 11.9836 15.7619C11.8984 15.7304 11.8132 15.6957 11.7312 15.6641C11.6429 15.6294 11.5514 15.5947 11.4631 15.5569C11.4063 15.5348 11.3463 15.5096 11.2895 15.4875C11.217 15.4591 11.1476 15.4275 11.075 15.3991C11.0214 15.3771 10.9646 15.3518 10.911 15.3297C10.8542 15.3045 10.7974 15.2793 10.7406 15.254C10.6901 15.2319 10.6428 15.2099 10.5923 15.1878C10.5482 15.1688 10.5008 15.1468 10.4567 15.1278C10.4094 15.1057 10.3652 15.0868 10.3179 15.0647C10.2705 15.0427 10.2232 15.0206 10.1759 14.9985C10.116 14.9701 10.056 14.9417 9.99608 14.9165C9.93299 14.8881 9.87304 14.8565 9.80995 14.8281C9.7437 14.7966 9.67745 14.765 9.6112 14.7303C9.55441 14.7019 9.49762 14.6735 9.44084 14.6483C6.45324 13.1592 3.80321 11.1717 1.54438 8.76145C1.43081 8.64157 1.23206 8.72044 1.23206 8.88449L1.23836 18.0933C1.23836 18.494 1.43712 18.8726 1.77153 19.0934C3.86631 20.4878 6.38699 21.2986 9.09696 21.2986Z",
              fill: "#3370FF",
            }),
            React.createElement("path", {
              d: "M23.7322 9.29488C22.7226 8.79642 21.5838 8.5188 20.3818 8.5188C19.6688 8.5188 18.9747 8.6166 18.3217 8.80273C18.246 8.82481 18.1703 8.8469 18.0977 8.86898C18.0441 8.88476 17.9905 8.90368 17.94 8.91946C17.8359 8.95416 17.7318 8.99202 17.6276 9.03303C17.4447 9.10559 17.2617 9.18446 17.085 9.26964C16.8957 9.36113 16.7128 9.45893 16.5329 9.56619C16.35 9.67345 16.1701 9.79018 15.9998 9.91322C15.8767 10.0016 15.7569 10.093 15.637 10.1877C15.5076 10.2918 15.3846 10.3991 15.2616 10.5095C15.1953 10.5694 15.1322 10.6325 15.066 10.6925L14.7315 11.0206L13.3939 12.3424L13.1636 12.5696L13.0879 12.6453C13.05 12.6831 13.0122 12.7178 12.9775 12.7557C12.9586 12.7746 12.9396 12.7904 12.9207 12.8093C12.8923 12.8377 12.8639 12.863 12.8355 12.8882C12.804 12.9166 12.7724 12.9481 12.7409 12.9765C11.9143 13.7368 10.9931 14.3899 9.99304 14.923C10.053 14.9514 10.1129 14.9798 10.1729 15.0051C10.2202 15.0271 10.2675 15.0492 10.3148 15.0713C10.359 15.0934 10.4063 15.1123 10.4536 15.1344C10.4978 15.1533 10.5451 15.1754 10.5893 15.1943C10.6398 15.2164 10.6871 15.2385 10.7376 15.2606C10.7944 15.2858 10.8511 15.3111 10.9079 15.3363C10.9616 15.3584 11.0184 15.3836 11.072 15.4057C11.1445 15.4373 11.2139 15.4657 11.2865 15.4941C11.3433 15.5193 11.4032 15.5414 11.46 15.5635C11.5484 15.5982 11.6367 15.636 11.7282 15.6707C11.8134 15.7023 11.8954 15.737 11.9806 15.7685C12.0437 15.7938 12.1068 15.8158 12.1699 15.8411C12.2803 15.8821 12.3875 15.9231 12.498 15.961C12.5547 15.9799 12.6084 16.002 12.6652 16.0209C12.744 16.0493 12.8197 16.0745 12.8986 16.1029C12.9617 16.125 13.028 16.1471 13.0911 16.1692C13.1857 16.2007 13.2803 16.2323 13.375 16.2638C13.4728 16.2954 13.5737 16.3269 13.6747 16.3585C13.7977 16.3963 13.9176 16.4342 14.0406 16.4689C14.1227 16.4941 14.2047 16.5162 14.2867 16.5414C14.4508 16.5888 14.618 16.6361 14.782 16.6803C14.842 16.696 14.9019 16.7118 14.9618 16.7244C15.0754 16.7528 15.189 16.7749 15.3026 16.7938C15.4319 16.8159 15.5613 16.8348 15.6906 16.8506C15.8673 16.8695 16.0408 16.8822 16.2143 16.8822C16.372 16.8853 16.5298 16.879 16.6844 16.8695C16.8326 16.8601 16.9778 16.8412 17.1229 16.8191C17.3248 16.7875 17.5204 16.7465 17.7128 16.6929C17.8422 16.6582 17.9715 16.6172 18.0977 16.5698C18.2144 16.5257 18.328 16.4815 18.4416 16.4279C18.5709 16.3679 18.7003 16.3048 18.8233 16.2354C18.8833 16.2007 18.9464 16.166 19.0063 16.1282C19.0631 16.0935 19.1199 16.0556 19.1767 16.0178C19.265 15.9578 19.3533 15.8947 19.4385 15.8316C19.5111 15.7748 19.5836 15.718 19.653 15.6581C19.7792 15.5508 19.8991 15.4341 20.0158 15.3142C20.0726 15.2543 20.1294 15.1943 20.183 15.1313C20.2524 15.0524 20.3187 14.9704 20.3849 14.8852C20.4354 14.8189 20.4859 14.7495 20.5364 14.6801C20.672 14.4845 20.7982 14.2763 20.9118 14.0586L21.0411 13.7999L22.2084 11.4748L22.2053 11.4812C22.5807 10.6578 23.1012 9.91953 23.7322 9.29488Z",
              fill: "#133C9A",
            }),
          );
        case "imessage":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            // Apple Messages 官方圆角绿底与纯白对话气泡
            React.createElement("rect", { width: "24", height: "24", rx: "5.5", fill: "#34C759" }),
            React.createElement("path", {
              d: "M12 4.5C7.306 4.5 3.5 7.858 3.5 12C3.5 14.37 4.743 16.48 6.677 17.817C6.39 18.88 5.75 19.8 4.7 20.3C6.3 20.35 8.1 19.8 9.3 18.95C10.15 19.3 11.05 19.5 12 19.5C16.694 19.5 20.5 16.142 20.5 12C20.5 7.858 16.694 4.5 12 4.5Z",
              fill: "#FFFFFF",
            }),
          );
        case "telegram":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.64 8.8C16.49 10.37 15.84 14.21 15.51 15.98C15.37 16.73 15.1 16.98 14.83 17.01C14.25 17.06 13.81 16.63 13.25 16.26C12.37 15.68 11.87 15.32 11.02 14.76C10.03 14.11 10.67 13.75 11.23 13.17C11.38 13.02 13.92 10.71 13.97 10.5C13.98 10.47 13.98 10.38 13.93 10.33C13.87 10.28 13.79 10.3 13.73 10.31C13.65 10.33 12.35 11.19 9.83 12.89C9.46 13.15 9.12 13.27 8.82 13.26C8.48 13.25 7.84 13.07 7.36 12.91C6.77 12.72 6.3 12.61 6.34 12.28C6.36 12.11 6.6 11.93 7.05 11.75C9.84 10.54 11.7 9.74 12.63 9.35C15.29 8.24 15.84 8.05 16.2 8.05C16.28 8.05 16.46 8.07 16.57 8.16C16.66 8.24 16.69 8.35 16.7 8.43C16.69 8.49 16.65 8.68 16.64 8.8Z", fill: color || "#2AABEE" }),
          );
        case "discord":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.01.02.05.03.08.02 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z", fill: color || "#5865F2" }),
          );
        case "slack":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M5.04 14.7a2.27 2.27 0 1 1-2.27-2.27h2.27v2.27zm1.14 0a2.27 2.27 0 1 1 4.54 0v5.68a2.27 2.27 0 1 1-4.54 0V14.7z", fill: "#E01E5A" }),
            React.createElement("path", { d: "M9.3 5.04a2.27 2.27 0 1 1 2.27-2.27v2.27H9.3zm0 1.14a2.27 2.27 0 1 1 0 4.54H3.62a2.27 2.27 0 1 1 0-4.54H9.3z", fill: "#36C5F0" }),
            React.createElement("path", { d: "M18.96 9.3a2.27 2.27 0 1 1 2.27 2.27h-2.27V9.3zm-1.14 0a2.27 2.27 0 1 1-4.54 0V3.62a2.27 2.27 0 1 1 4.54 0V9.3z", fill: "#2EB67D" }),
            React.createElement("path", { d: "M14.7 18.96a2.27 2.27 0 1 1-2.27 2.27v-2.27h2.27zm0-1.14a2.27 2.27 0 1 1 0-4.54h5.68a2.27 2.27 0 1 1 0 4.54H14.7z", fill: "#ECB22E" }),
          );
        case "dingtalk":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M20 4L4 10.5L10 13L11.5 20L14.5 15.5L18.5 18.5L20 4Z", fill: color || "#007FFF" }),
          );
        case "wecom":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("circle", { cx: "9", cy: "10", r: "6", fill: color || "#0082EF", opacity: "0.85" }),
            React.createElement("circle", { cx: "15", cy: "14", r: "5", fill: color || "#0082EF" }),
          );
        case "whatsapp":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12C2 13.85 2.5 15.58 3.38 17.07L2.1 21.8L6.96 20.55C8.4 21.46 10.13 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16.63 15.71C16.44 16.25 15.68 16.69 15.08 16.82C14.67 16.91 14.13 16.97 12.32 16.22C10.01 15.26 8.52 12.92 8.4 12.77C8.29 12.62 7.48 11.54 7.48 10.42C7.48 9.3 8.05 8.75 8.28 8.51C8.47 8.31 8.78 8.23 9.07 8.23C9.17 8.23 9.25 8.23 9.33 8.24C9.56 8.25 9.68 8.26 9.83 8.62C10.02 9.08 10.48 10.2 10.53 10.32C10.59 10.44 10.65 10.59 10.57 10.74C10.49 10.9 10.43 10.98 10.31 11.12C10.19 11.26 10.09 11.36 9.96 11.52C9.82 11.67 9.68 11.83 9.84 12.1C10 12.37 10.56 13.28 11.38 14.01C12.44 14.95 13.3 15.25 13.61 15.38C13.84 15.48 14.11 15.45 14.28 15.27C14.5 15.03 14.77 14.64 15.05 14.25C15.25 13.97 15.5 13.93 15.77 14.03C16.04 14.13 17.49 14.85 17.79 15C18.09 15.15 18.29 15.22 18.36 15.35C18.43 15.48 18.43 16.03 16.63 15.71Z", fill: color || "#25D366" }),
          );
        case "signal":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12C2 14.07 2.63 15.99 3.71 17.58L2.24 21.76L6.59 20.45C8.13 21.43 9.99 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z", fill: color || "#3A76F0" }),
          );
        default:
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            React.createElement("circle", { cx: "12", cy: "12", r: "10", fill: color || "#3370ff" }),
            React.createElement("path", { d: "M8 12H16M12 8V16", stroke: "#ffffff", strokeWidth: "2", strokeLinecap: "round" }),
          );
      }
    }

    /** 判定通道是否真正配置了凭证 */
    function isChannelConfigured(ch) {
      if (ch.sessions > 0) return true;
      const cfg = { ...ch.namespace, ...ch.fileConfig };
      switch (ch.id) {
        case "feishu":
          return Boolean(cfg.appId && String(cfg.appId).trim() && cfg.appSecret && String(cfg.appSecret).trim());
        case "imessage":
          return Boolean((cfg.chatDb && String(cfg.chatDb).trim()) || (ch.sessions > 0));
        case "telegram":
          return Boolean(cfg.token && String(cfg.token).trim());
        case "discord":
          return Boolean(cfg.token && String(cfg.token).trim());
        case "slack":
          return Boolean((cfg.botToken && String(cfg.botToken).trim()) || (cfg.appToken && String(cfg.appToken).trim()));
        case "whatsapp":
          return Boolean(cfg.phoneNumberId && String(cfg.phoneNumberId).trim() && cfg.accessToken && String(cfg.accessToken).trim());
        case "signal":
          return Boolean(cfg.signalAccount && String(cfg.signalAccount).trim());
        case "dingtalk":
          return Boolean(cfg.appKey && String(cfg.appKey).trim() && cfg.appSecret && String(cfg.appSecret).trim());
        case "wecom":
          return Boolean(cfg.corpId && String(cfg.corpId).trim() && cfg.corpSecret && String(cfg.corpSecret).trim());
        case "qq":
          return Boolean((cfg.appId && String(cfg.appId).trim()) || (cfg.token && String(cfg.token).trim()));
        default:
          return Boolean(ch.configured);
      }
    }

    /** 动态获取平台专属多语言配置规范（飞书与 iMessage） */
    function getChannelSpec(id, t) {
      if (id === "feishu") {
        return {
          label: t.feishuLabel,
          desc: t.feishuDesc,
          guide: t.feishuGuide,
          color: "#3370FF",
          fields: [
            { key: "appId", label: t.fieldAppId, type: "text", required: true, placeholder: "cli_a93f155438dcba" },
            { key: "appSecret", label: t.fieldAppSecret, type: "password", required: true, placeholder: "iaESkQ8QfFoGLsdFa9rklh5yP00PqxNS" },
            { key: "verifyToken", label: t.fieldVerifyToken, type: "password", required: false, placeholder: t.fieldVerifyTokenPlaceholder },
            { key: "encryptKey", label: t.fieldEncryptKey, type: "password", required: false, placeholder: t.fieldEncryptKeyPlaceholder },
            { key: "defaultWorkspace", label: t.fieldWorkspace, type: "text", required: false, placeholder: "~/dsh/default" },
            { key: "autoReply", label: t.fieldAutoReply, type: "boolean", default: true },
            { key: "cardReplies", label: t.fieldCardReplies, type: "boolean", default: true },
            { key: "streamReplies", label: t.fieldStreamReplies, type: "boolean", default: true },
          ],
        };
      }
      if (id === "imessage") {
        return {
          label: t.imessageLabel,
          desc: t.imessageDesc,
          guide: t.imessageGuide,
          color: "#34C759",
          fields: [
            { key: "chatDb", label: t.fieldChatDb, type: "text", required: false, placeholder: "~/Library/Messages/chat.db" },
            { key: "defaultWorkspace", label: t.fieldWorkspace, type: "text", required: false, placeholder: "~/dsh/default" },
            { key: "autoReply", label: t.fieldAutoReply, type: "boolean", default: true },
            { key: "streamReplies", label: t.fieldStreamReplies, type: "boolean", default: true },
          ],
        };
      }
      return {};
    }

    /** 单个通道紧凑行条目组件（DSH 原生设计） */
    function ChannelRow({ ch, t, onConfigure }) {
      const spec = getChannelSpec(ch.id, t);
      const configured = isChannelConfigured(ch);
      const label = spec.label || ch.label;
      const color = spec.color || ch.color || "#3370ff";
      const merged = { ...ch.namespace, ...ch.fileConfig };
      const needsAuthorization = ch.id === "imessage" && ch.statusCode === "authorization-required";
      const databaseAuthorized = ch.id === "imessage" && ch.statusCode === "ready";

      let summaryText = "";
      if (ch.id === "feishu") {
        const appIdDisplay = merged.appId ? `App ID: ${String(merged.appId).slice(0, 10)}••••` : t.summaryNotConfigured;
        const ws = merged.defaultWorkspace ? `${t.summaryWorkspace}: ${merged.defaultWorkspace}` : "";
        summaryText = [appIdDisplay, ws].filter(Boolean).join("   •   ");
      } else if (ch.id === "imessage") {
        const ws = merged.defaultWorkspace ? `${t.summaryWorkspace}: ${merged.defaultWorkspace}` : "";
        summaryText = [t.summaryModeLocal, ws].filter(Boolean).join("   •   ");
      } else {
        summaryText = spec.desc || ch.desc;
      }

      return React.createElement(React.Fragment, null,
        React.createElement("div", {
          className: "cc-list-row",
          "data-configured": String(configured),
        },
        // 左侧：官方 Brand Logo + 通道名称 + 紧凑元数据
        React.createElement("div", { className: "cc-row-left" },
          React.createElement("div", { className: "cc-row-icon-wrap" },
            React.createElement(ChannelIcon, { id: ch.id, color, size: 30 }),
          ),
          React.createElement("div", { className: "cc-row-info" },
            React.createElement("div", { className: "cc-row-title-line" },
              React.createElement("span", { className: "cc-row-name" }, label),
              React.createElement("span", { className: "cc-row-badge" }, ch.id),
            ),
            React.createElement("div", { className: "cc-row-meta" }, summaryText),
          ),
        ),

        // 右侧：运行状态药丸 + 活跃会话数 + 配置操作按钮
        React.createElement("div", { className: "cc-row-right" },
          React.createElement("div", { className: "cc-row-status-box" },
            React.createElement("span", {
              className: "cc-status-pill",
              "data-status": needsAuthorization ? "auth" : databaseAuthorized ? "authorized" : configured ? "online" : "offline",
            },
              React.createElement("span", { className: "cc-pulse-dot" }),
              needsAuthorization ? t.statusAuthorization : databaseAuthorized ? t.statusAuthorized : configured ? t.statusOnline : t.statusInactive,
            ),
            configured && (ch.sessions || 0) > 0 && React.createElement("span", { className: "cc-row-sessions" },
              `💬 ${ch.sessions} ${t.sessionsCount}`,
            ),
          ),
          React.createElement(Button, {
            variant: "ghost",
            onClick: () => onConfigure(ch),
            style: { minWidth: 84 },
          }, `⚙️ ${t.btnConfigure}`),
        ),
        ),
        needsAuthorization && React.createElement("div", { className: "cc-auth-warning" },
          React.createElement("strong", null, `⚠️ ${t.imessageAuthTitle}`),
          React.createElement("div", null, ch.databaseReadable ? t.imessageAuthDatabaseReady : t.imessageAuthDatabaseDenied),
          React.createElement("div", null, t.imessageAuthGuide),
        ),
      );
    }

    /** 通道配置可视化模态弹窗 */
    function ConfigModal({ ch, t, connection, onClose, onSaved }) {
      if (!ch) return null;
      const spec = getChannelSpec(ch.id, t);
      const initialConfig = React.useMemo(() => ({ ...ch.namespace, ...ch.fileConfig }), [ch]);
      const [formData, setFormData] = React.useState(initialConfig);
      const [showSecrets, setShowSecrets] = React.useState({});
      const [saving, setSaving] = React.useState(false);
      const [statusMsg, setStatusMsg] = React.useState(null);

      const fields = spec.fields || ch.fields || [
        { key: "token", label: "Token / Key", type: "password", required: true },
        { key: "defaultWorkspace", label: t.fieldWorkspace, type: "text", required: false },
        { key: "autoReply", label: t.fieldAutoReply, type: "boolean", default: true },
        { key: "streamReplies", label: t.fieldStreamReplies, type: "boolean", default: true },
      ];
      const guide = spec.guide || ch.guide;
      const label = spec.label || ch.label;

      const handleChange = (key, value) => {
        setFormData((prev) => ({ ...prev, [key]: value }));
      };

      const handleSave = async () => {
        setSaving(true);
        setStatusMsg(null);
        try {
          const gatewayServiceName = (ch.section || ch.id) + "Gateway";
          let res;
          try {
            res = await connection.rpc.call("/api", `${gatewayServiceName}/setConfig`, {
              args: { payload: formData },
            });
          } catch (e) { /* fallback */ }

          if (!res?.ok) {
            res = await connection.rpc.call("/api", "channelConfig/save", {
              args: { payload: { section: ch.section || ch.id, config: formData } },
            });
          }
          if (!res?.ok) throw new Error(res?.error?.message ?? "保存失败");
          setStatusMsg({ type: "success", text: t.saveSuccess });
          setTimeout(() => {
            onSaved();
            onClose();
          }, 600);
        } catch (err) {
          setStatusMsg({ type: "error", text: err instanceof Error ? err.message : String(err) });
        } finally {
          setSaving(false);
        }
      };

      return React.createElement("div", { className: "cc-modal-backdrop", onClick: onClose },
        React.createElement("div", { className: "cc-modal", onClick: (e) => e.stopPropagation() },
          React.createElement("div", { className: "cc-modal-head" },
            React.createElement("div", { className: "cc-modal-head-title" },
              React.createElement(ChannelIcon, { id: ch.id, color: ch.color, size: 24 }),
              React.createElement("div", null,
                React.createElement("h3", { style: { margin: 0, font: "var(--dsw-font-s-strong-14)", color: "var(--dsw-alias-label-primary)" } }, `${label} ${t.modalTitle}`),
                React.createElement("span", { style: { font: "var(--dsw-font-xxxs-11)", color: "var(--dsw-alias-label-caption)", fontFamily: "var(--ds-font-family-code)" } }, `settings.yaml → [${ch.section || ch.id}]`),
              ),
            ),
            React.createElement("button", { className: "cc-modal-close-btn", onClick: onClose }, "✕"),
          ),

          React.createElement("div", { className: "cc-modal-body" },
            guide && React.createElement("div", { className: "cc-modal-guide" }, `💡 ${guide}`),

            ch.id === "imessage" && ch.statusCode === "authorization-required" && React.createElement("div", { className: "cc-auth-warning", style: { margin: 0 } },
              React.createElement("strong", null, `⚠️ ${t.imessageAuthTitle}`),
              React.createElement("div", null, t.imessageAuthGuide),
            ),

            statusMsg && React.createElement("div", {
              className: `cc-msg-banner ${statusMsg.type === "success" ? "cc-msg-success" : "cc-msg-err"}`,
            }, statusMsg.text),

            fields.map((f) => {
              const val = formData[f.key] ?? f.default ?? "";
              if (f.type === "boolean") {
                const checked = Boolean(val);
                return React.createElement("div", {
                  key: f.key,
                  className: "cc-form-switch-row",
                  onClick: () => handleChange(f.key, !checked),
                },
                  React.createElement("span", { className: "cc-form-switch-label" }, f.label),
                  React.createElement("div", { className: "cc-switch", "data-checked": String(checked) },
                    React.createElement("div", { className: "cc-switch-thumb" }),
                  ),
                );
              }

              if (f.type === "select") {
                return React.createElement("div", { key: f.key, className: "cc-form-group" },
                  React.createElement("label", { className: "cc-form-label" }, f.label),
                  React.createElement("select", {
                    className: "cc-form-select",
                    value: String(val),
                    onChange: (e) => handleChange(f.key, e.target.value),
                  },
                    (f.options || []).map((opt) => React.createElement("option", { key: opt.value, value: opt.value }, opt.label)),
                  ),
                );
              }

              const isPassword = f.type === "password";
              const isRevealed = showSecrets[f.key];
              return React.createElement("div", { key: f.key, className: "cc-form-group" },
                React.createElement("label", { className: "cc-form-label" },
                  f.label,
                  f.required && React.createElement("span", { className: "cc-form-req" }, "*"),
                ),
                React.createElement("div", { className: "cc-input-wrap" },
                  React.createElement("input", {
                    type: isPassword && !isRevealed ? "password" : "text",
                    className: "cc-form-input",
                    value: String(val),
                    placeholder: f.placeholder || "",
                    onChange: (e) => handleChange(f.key, e.target.value),
                  }),
                  isPassword && React.createElement("button", {
                    type: "button",
                    className: "cc-pwd-toggle",
                    onClick: () => setShowSecrets((s) => ({ ...s, [f.key]: !isRevealed })),
                  }, isRevealed ? "🙈 " + t.hidePassword : "👁️ " + t.showPassword),
                ),
              );
            }),
          ),

          React.createElement("div", { className: "cc-modal-footer" },
            React.createElement(Button, { variant: "ghost", onClick: onClose }, t.cancel),
            React.createElement(Button, {
              variant: "primary",
              onClick: handleSave,
              disabled: saving,
            }, saving ? t.saving : `💾 ${t.save}`),
          ),
        ),
      );
    }

    /** 主设置区域组件 */
    function ChannelsSection(props) {
      const { connection, t: translate, locale } = props;
      if (!translate || !locale) return null;

      React.useSyncExternalStore(
        (callback) => locale.subscribe(callback),
        () => locale.getSnapshot(),
      );
      const t = translated(translate);

      const [state, setState] = React.useState({ status: "loading", data: null, error: null });
      const [searchQuery, setSearchQuery] = React.useState("");
      const [editingChannel, setEditingChannel] = React.useState(null);

      const load = React.useCallback(async () => {
        setState((s) => ({ ...s, status: "loading", error: null }));
        try {
          if (!connection?.rpc) throw new Error("connection rpc is not available");
          const result = await connection.rpc.call("/api", "channelConfig/list", { args: {} });
          if (!result?.ok) throw new Error(result?.error?.message ?? "RPC failed");
          setState({ status: "ready", data: result.value, error: null });
        } catch (error) {
          setState({ status: "error", data: null, error: error instanceof Error ? error.message : String(error) });
        }
      }, [connection]);

      React.useEffect(() => { void load(); }, [load]);

      // 仅展示已验证通过的飞书与 iMessage 通道，其余未验证通道默认隐藏
      const items = (state.data?.items || []).filter((ch) => ch.id === "feishu" || ch.id === "imessage");
      const totalSessions = items.reduce((acc, ch) => acc + (ch.sessions || 0), 0);

      const displayedChannels = React.useMemo(() => {
        if (!searchQuery.trim()) return items;
        const q = searchQuery.toLowerCase().trim();
        return items.filter((ch) =>
          ch.label.toLowerCase().includes(q) ||
          ch.id.toLowerCase().includes(q) ||
          (ch.desc && ch.desc.toLowerCase().includes(q)),
        );
      }, [items, searchQuery]);

      return React.createElement("div", { className: "cc-root" },
        // 头部标题
        React.createElement("div", { className: "cc-header" },
          React.createElement("div", { className: "cc-title-area" },
            React.createElement("h2", { className: "cc-main-title" }, t.title),
            React.createElement("p", { className: "cc-main-sub" }, t.sub),
          ),
        ),

        // 状态概览与操作栏（紧凑胶囊设计）
        React.createElement("div", { className: "cc-summary-bar" },
          React.createElement("div", { className: "cc-stat-pills" },
            React.createElement("div", { className: "cc-stat-pill-item" },
              React.createElement("span", { style: { color: "#10b981", fontSize: 10 } }, "●"),
              React.createElement("span", null, `${t.statConnected}:`),
              React.createElement("span", { className: "cc-stat-pill-val" }, `${items.length} ${t.unitChannels}`),
            ),
            React.createElement("div", { className: "cc-stat-pill-item" },
              React.createElement("span", { style: { color: "#3370ff", fontSize: 11 } }, "💬"),
              React.createElement("span", null, `${t.statSessions}:`),
              React.createElement("span", { className: "cc-stat-pill-val" }, `${totalSessions} ${t.unitSessions}`),
            ),
          ),
          React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } },
            React.createElement("input", {
              type: "text",
              className: "cc-search-input",
              placeholder: t.searchPlaceholder,
              value: searchQuery,
              onChange: (e) => setSearchQuery(e.target.value),
            }),
            React.createElement(Button, {
              variant: "ghost",
              onClick: load,
              disabled: state.status === "loading",
            }, t.refresh),
          ),
        ),

        state.error && React.createElement("div", { className: "cc-msg-banner cc-msg-err" }, `${t.error}: ${state.error}`),
        state.status === "loading" && !state.data && React.createElement("div", { style: { padding: "40px 0", textAlign: "center", color: "var(--dsw-alias-label-tertiary)" } }, t.loading),

        // 紧凑列表组（仅展示已验证的飞书与 iMessage）
        state.data && React.createElement("div", { className: "cc-list-group" },
          displayedChannels.map((ch) =>
            React.createElement(ChannelRow, {
              key: ch.id,
              ch,
              t,
              onConfigure: (targetCh) => setEditingChannel(targetCh),
            }),
          ),
        ),

        // 空状态
        state.data && items.length === 0 && React.createElement("div", {
          style: { padding: "48px 24px", textAlign: "center", background: "var(--dsw-alias-bg-layer-2)", borderRadius: 12, border: "1px dashed var(--dsw-alias-border-l2)" },
        },
          React.createElement("h3", { style: { margin: "0 0 6px", font: "var(--dsw-font-s-strong-14)", color: "var(--dsw-alias-label-primary)" } }, t.noConnectedTitle),
          React.createElement("p", { style: { margin: 0, font: "var(--dsw-font-xxs-12)", color: "var(--dsw-alias-label-tertiary)" } }, t.noConnectedSub),
        ),

        // 可视化配置模态框
        editingChannel && React.createElement(ConfigModal, {
          ch: editingChannel,
          t,
          connection,
          onClose: () => setEditingChannel(null),
          onSaved: load,
        }),
      );
    }

    const inject = ["slots", "connection", "locale"];

    function apply(ctx) {
      installStyle();
      const connection = ctx.get("connection");
      const t = ctx.locale.bind(NS);
      ctx.effect(() => ctx.locale.register(NS, { zh: copy.zh, en: copy.en }), "harness-channel-config: dictionaries");
      ctx.slots.inject("settings.section", () =>
        ctx.slots.register(
          {
            name: "settings.section",
            id: "harness-channel-config",
            order: 26,
            label: () => t("nav"),
            locale: NS,
            inject: () => ({ connection, t, locale: ctx.locale }),
          },
          ChannelsSection,
        ),
      );
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.ChannelsSection = ChannelsSection;
    exports.ChannelRow = ChannelRow;
    exports.ConfigModal = ConfigModal;
    return module.exports;
  },
});
