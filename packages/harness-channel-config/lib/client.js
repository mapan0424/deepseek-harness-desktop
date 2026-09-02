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
    const { Button, IconSettingsOutline16, IconNewChatOutline16, IconRefreshOutline16, IconWarningOutline16 } = require("@deepseek-ai/dsh-client-ui-primitives");

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
        statusPaused: "已暂停回复",
        statusAuthorization: "需要授权",
        statusAuthorized: "已授权接收",
        toggleEnable: "点击开启自动回复",
        toggleDisable: "点击暂停自动回复",
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
        wecomLabel: "企业微信",
        wecomDesc: "企业微信智能机器人长连接模式，出站直连企微网关，无需公网 IP 与回调加解密。",
        wecomGuide: "在企业微信管理后台 → 工作台 → 智能机器人 → API 模式创建机器人，连接方式选择「使用长连接」，获取 Bot ID 与 Secret，并确保可见范围包含使用成员。",
        imessageLabel: "iMessage",
        imessageDesc: "macOS 原生 AppleScript + chat.db 监听，支持本地直连无中转收发 iMessage 短信。",
        imessageGuide: "利用 macOS 本地信息数据库与 AppleScript 直接与系统「信息」应用协同，数据完全保存在本机。",
        fieldAppId: "App ID (应用唯一标识)",
        fieldAppSecret: "App Secret (应用密钥)",
        fieldBotId: "Bot ID (机器人唯一标识)",
        fieldWecomSecret: "Secret (长连接专用密钥)",
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
        summaryNotConfiguredWecom: "未配置 Bot ID",
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
        statusPaused: "Auto-reply Paused",
        statusAuthorization: "Authorization Required",
        statusAuthorized: "Receiving Authorized",
        toggleEnable: "Enable auto-reply",
        toggleDisable: "Pause auto-reply",
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
        wecomLabel: "WeCom",
        wecomDesc: "WeCom intelligent bot WebSocket long-connection mode for outbound direct connect without public IP or encryption keys.",
        wecomGuide: "Go to WeCom Admin Console → Workbench → Intelligent Bot → API Mode, select 'Long Connection', obtain Bot ID and Secret, and ensure visibility covers the users.",
        imessageLabel: "iMessage",
        imessageDesc: "Native macOS AppleScript + chat.db listener for direct, local message dispatch without third-party relays.",
        imessageGuide: "Integrates directly with macOS native Messages app via local database and AppleScript, ensuring complete privacy.",
        fieldAppId: "App ID",
        fieldAppSecret: "App Secret",
        fieldBotId: "Bot ID",
        fieldWecomSecret: "Secret",
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
        summaryNotConfiguredWecom: "Bot ID not configured",
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
        .cc-status-pill[data-status="paused"] {
          background: rgba(245, 158, 11, 0.14);
          color: var(--dsw-alias-state-warning-primary, #b45309);
        }
        .cc-status-pill[data-status="auth"] {
          background: rgba(245, 158, 11, 0.14);
          color: var(--dsw-alias-state-warning-primary, #b45309);
        }
        .cc-status-pill[data-status="authorized"] {
          background: var(--dsw-alias-state-success-tertiary);
          color: var(--dsw-alias-state-success-primary);
        }
        .cc-row-toggle {
          display: inline-flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          padding: 2px;
          border-radius: 99px;
          transition: opacity var(--ds-transition-duration, 0.2s);
        }
        .cc-row-toggle:hover {
          opacity: 0.85;
        }
        
        .cc-feishu-plate {
          fill: #ffffff;
          stroke: rgba(0, 0, 0, 0.08);
          stroke-width: 0.5px;
        }
        .cc-feishu-wing-green {
          fill: #00d6b9;
        }
        .cc-feishu-wing-blue {
          fill: #3370ff;
        }
        .cc-feishu-wing-darkblue {
          fill: #1948b8;
        }
        .cc-wecom-plate {
          fill: #ffffff;
          stroke: rgba(0, 0, 0, 0.08);
          stroke-width: 0.5px;
        }
        .cc-wecom-bubble-blue {
          fill: #0082ef;
        }
        .cc-wecom-bubble-green {
          fill: #34c759;
        }
        @media (prefers-color-scheme: dark) {
          .cc-feishu-plate {
            fill: #22252b !important;
            stroke: rgba(255, 255, 255, 0.12) !important;
          }
          .cc-feishu-wing-green {
            fill: #00e5c5 !important;
          }
          .cc-feishu-wing-blue {
            fill: #3e82ff !important;
          }
          .cc-feishu-wing-darkblue {
            fill: #669dfe !important;
          }
          .cc-wecom-plate {
            fill: #22252b !important;
            stroke: rgba(255, 255, 255, 0.12) !important;
          }
          .cc-wecom-bubble-blue {
            fill: #388bfd !important;
          }
          .cc-wecom-bubble-green {
            fill: #30d158 !important;
          }
          .cc-imessage-plate {
            fill: #30d158 !important;
          }
          .cc-wecom-img-light {
            display: none !important;
          }
          .cc-wecom-img-dark {
            display: block !important;
          }
        }
        body[data-ds-dark-theme] .cc-feishu-plate,
        [data-ds-dark-theme] .cc-feishu-plate,
        [data-theme="dark"] .cc-feishu-plate,
        .theme-dark .cc-feishu-plate,
        body[class*="dark"] .cc-feishu-plate {
          fill: #22252b !important;
          stroke: rgba(255, 255, 255, 0.12) !important;
        }
        body[data-ds-dark-theme] .cc-feishu-wing-green,
        [data-ds-dark-theme] .cc-feishu-wing-green,
        [data-theme="dark"] .cc-feishu-wing-green,
        .theme-dark .cc-feishu-wing-green,
        body[class*="dark"] .cc-feishu-wing-green {
          fill: #00e5c5 !important;
        }
        body[data-ds-dark-theme] .cc-feishu-wing-blue,
        [data-ds-dark-theme] .cc-feishu-wing-blue,
        [data-theme="dark"] .cc-feishu-wing-blue,
        .theme-dark .cc-feishu-wing-blue,
        body[class*="dark"] .cc-feishu-wing-blue {
          fill: #3e82ff !important;
        }
        body[data-ds-dark-theme] .cc-feishu-wing-darkblue,
        [data-ds-dark-theme] .cc-feishu-wing-darkblue,
        [data-theme="dark"] .cc-feishu-wing-darkblue,
        .theme-dark .cc-feishu-wing-darkblue,
        body[class*="dark"] .cc-feishu-wing-darkblue {
          fill: #669dfe !important;
        }
        body[data-ds-dark-theme] .cc-wecom-plate,
        [data-ds-dark-theme] .cc-wecom-plate,
        [data-theme="dark"] .cc-wecom-plate,
        .theme-dark .cc-wecom-plate,
        body[class*="dark"] .cc-wecom-plate {
          fill: #22252b !important;
          stroke: rgba(255, 255, 255, 0.12) !important;
        }
        body[data-ds-dark-theme] .cc-wecom-bubble-blue,
        [data-ds-dark-theme] .cc-wecom-bubble-blue,
        [data-theme="dark"] .cc-wecom-bubble-blue,
        .theme-dark .cc-wecom-bubble-blue,
        body[class*="dark"] .cc-wecom-bubble-blue {
          fill: #388bfd !important;
        }
        body[data-ds-dark-theme] .cc-wecom-bubble-green,
        [data-ds-dark-theme] .cc-wecom-bubble-green,
        [data-theme="dark"] .cc-wecom-bubble-green,
        .theme-dark .cc-wecom-bubble-green,
        body[class*="dark"] .cc-wecom-bubble-green {
          fill: #30d158 !important;
        }
        .cc-imessage-plate {
          fill: #34c759;
          stroke: rgba(0, 0, 0, 0.08);
          stroke-width: 0.5px;
        }
        .cc-imessage-bubble {
          fill: #ffffff;
        }
        @media (prefers-color-scheme: dark) {
          .cc-imessage-plate {
            fill: #22252b !important;
            stroke: rgba(255, 255, 255, 0.12) !important;
          }
          .cc-imessage-bubble {
            fill: #30d158 !important;
          }
        }
        body[data-ds-dark-theme] .cc-imessage-plate,
        [data-ds-dark-theme] .cc-imessage-plate,
        [data-theme="dark"] .cc-imessage-plate,
        .theme-dark .cc-imessage-plate,
        body[class*="dark"] .cc-imessage-plate {
          fill: #22252b !important;
          stroke: rgba(255, 255, 255, 0.12) !important;
        }
        body[data-ds-dark-theme] .cc-imessage-bubble,
        [data-ds-dark-theme] .cc-imessage-bubble,
        [data-theme="dark"] .cc-imessage-bubble,
        .theme-dark .cc-imessage-bubble,
        body[class*="dark"] .cc-imessage-bubble {
          fill: #30d158 !important;
        }
        
        .cc-wecom-img-light {
          display: block !important;
        }
        .cc-wecom-img-dark {
          display: none !important;
        }
        body[data-ds-dark-theme] .cc-wecom-img-light,
        [data-ds-dark-theme] .cc-wecom-img-light,
        [data-theme="dark"] .cc-wecom-img-light,
        .theme-dark .cc-wecom-img-light,
        body[class*="dark"] .cc-wecom-img-light {
          display: none !important;
        }
        body[data-ds-dark-theme] .cc-wecom-img-dark,
        [data-ds-dark-theme] .cc-wecom-img-dark,
        [data-theme="dark"] .cc-wecom-img-dark,
        .theme-dark .cc-wecom-img-dark,
        body[class*="dark"] .cc-wecom-img-dark {
          display: block !important;
        }
        
        .cc-imessage-img-light {
          display: block !important;
        }
        .cc-imessage-img-dark {
          display: none !important;
        }
        @media (prefers-color-scheme: dark) {
          .cc-imessage-img-light {
            display: none !important;
          }
          .cc-imessage-img-dark {
            display: block !important;
          }
        }
        body[data-ds-dark-theme] .cc-imessage-img-light,
        [data-ds-dark-theme] .cc-imessage-img-light,
        [data-theme="dark"] .cc-imessage-img-light,
        .theme-dark .cc-imessage-img-light,
        body[class*="dark"] .cc-imessage-img-light {
          display: none !important;
        }
        body[data-ds-dark-theme] .cc-imessage-img-dark,
        [data-ds-dark-theme] .cc-imessage-img-dark,
        [data-theme="dark"] .cc-imessage-img-dark,
        .theme-dark .cc-imessage-img-dark,
        body[class*="dark"] .cc-imessage-img-dark {
          display: block !important;
        }
        
        .cc-feishu-img-light {
          display: block !important;
        }
        .cc-feishu-img-dark {
          display: none !important;
        }
        @media (prefers-color-scheme: dark) {
          .cc-feishu-img-light {
            display: none !important;
          }
          .cc-feishu-img-dark {
            display: block !important;
          }
        }
        body[data-ds-dark-theme] .cc-feishu-img-light,
        [data-ds-dark-theme] .cc-feishu-img-light,
        [data-theme="dark"] .cc-feishu-img-light,
        .theme-dark .cc-feishu-img-light,
        body[class*="dark"] .cc-feishu-img-light {
          display: none !important;
        }
        body[data-ds-dark-theme] .cc-feishu-img-dark,
        [data-ds-dark-theme] .cc-feishu-img-dark,
        [data-theme="dark"] .cc-feishu-img-dark,
        .theme-dark .cc-feishu-img-dark,
        body[class*="dark"] .cc-feishu-img-dark {
          display: block !important;
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

    
    const FEISHU_OFFICIAL_LIGHT = "data:image/png;base64,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";
    const FEISHU_OFFICIAL_DARK = "data:image/png;base64,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";
    const IMESSAGE_OFFICIAL_LIGHT = "data:image/png;base64,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";
    const IMESSAGE_OFFICIAL_DARK = "data:image/png;base64,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";
    const WECOM_OFFICIAL_LIGHT = "data:image/png;base64,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";
    const WECOM_OFFICIAL_DARK = "data:image/png;base64,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";

    /** 平台 SVG 矢量图标渲染（官方原生品牌标准资产） */
    function ChannelIcon({ id, color, size = 22 }) {
      switch (id) {
        case "feishu":
          return React.createElement("span", {
            className: "cc-feishu-icon-container",
            style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size }
          },
            React.createElement("img", {
              className: "cc-feishu-img cc-feishu-img-light",
              src: FEISHU_OFFICIAL_LIGHT,
              width: size,
              height: size,
              alt: "飞书",
              style: { width: size, height: size, display: "block" },
            }),
            React.createElement("img", {
              className: "cc-feishu-img cc-feishu-img-dark",
              src: FEISHU_OFFICIAL_DARK,
              width: size,
              height: size,
              alt: "飞书",
              style: { width: size, height: size, display: "none" },
            }),
          );
        case "wecom":
          return React.createElement("span", {
            className: "cc-wecom-icon-container",
            style: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: size, height: size }
          },
            React.createElement("img", {
              className: "cc-wecom-img cc-wecom-img-light",
              src: WECOM_OFFICIAL_LIGHT,
              width: size,
              height: size,
              alt: "企业微信",
              style: { width: size, height: size, display: "block" },
            }),
            React.createElement("img", {
              className: "cc-wecom-img cc-wecom-img-dark",
              src: WECOM_OFFICIAL_DARK,
              width: size,
              height: size,
              alt: "企业微信",
              style: { width: size, height: size, display: "none" },
            }),
          );
        case "imessage":
          return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none" },
            // Apple Messages 官方圆角底板（浅色为苹果绿，深色为黑灰金属底板）
            React.createElement("rect", {
              className: "cc-imessage-plate",
              width: "24",
              height: "24",
              rx: "5.5",
            }),
            // 苹果官方平滑对话气泡（浅色为纯白，深色为荧光翡翠绿 #30D158）
            React.createElement("path", {
              className: "cc-imessage-bubble",
              d: "M12 4.6C7.36 4.6 3.6 7.88 3.6 11.95C3.6 14.3 4.88 16.4 6.84 17.68C6.54 18.75 5.86 19.7 4.78 20.25C6.46 20.35 8.2 19.85 9.5 18.98C10.28 19.26 11.12 19.42 12 19.42C16.64 19.42 20.4 16.14 20.4 12.07C20.4 8 16.64 4.6 12 4.6Z",
            }),
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
        case "wecom":
          return Boolean(cfg.botId && String(cfg.botId).trim() && cfg.secret && String(cfg.secret).trim());
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
        case "qq":
          return Boolean((cfg.appId && String(cfg.appId).trim()) || (cfg.token && String(cfg.token).trim()));
        default:
          return Boolean(ch.configured);
      }
    }

    /** 动态获取平台专属多语言配置规范（飞书、企业微信与 iMessage） */
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
      if (id === "wecom") {
        return {
          label: t.wecomLabel,
          desc: t.wecomDesc,
          guide: t.wecomGuide,
          color: "#0082EF",
          fields: [
            { key: "botId", label: t.fieldBotId, type: "text", required: true, placeholder: "aibS9-XXXXXXXXXXXXXXXXXXXXXXXX" },
            { key: "secret", label: t.fieldWecomSecret, type: "password", required: true, placeholder: "0Y3UNbXXXXXXXXXXXXXXXXXXXXXXXXXXXX" },
            { key: "defaultWorkspace", label: t.fieldWorkspace, type: "text", required: false, placeholder: "~/dsh/default" },
            { key: "autoReply", label: t.fieldAutoReply, type: "boolean", default: true },
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
    function ChannelRow({ ch, t, onConfigure, onToggle }) {
      const spec = getChannelSpec(ch.id, t);
      const configured = isChannelConfigured(ch);
      const label = spec.label || ch.label;
      const color = spec.color || ch.color || "#3370ff";
      const merged = { ...ch.namespace, ...ch.fileConfig };
      const autoReply = merged.autoReply !== false;
      const needsAuthorization = ch.id === "imessage" && ch.statusCode === "authorization-required";
      const databaseAuthorized = ch.id === "imessage" && ch.statusCode === "ready";

      let statusKey = "offline";
      let statusText = t.statusInactive;
      if (needsAuthorization) {
        statusKey = "auth";
        statusText = t.statusAuthorization;
      } else if (configured) {
        if (!autoReply) {
          statusKey = "paused";
          statusText = t.statusPaused;
        } else {
          statusKey = "online";
          statusText = databaseAuthorized ? t.statusAuthorized : t.statusOnline;
        }
      }

      let summaryText = "";
      if (ch.id === "feishu") {
        const appIdDisplay = merged.appId ? `App ID: ${String(merged.appId).slice(0, 10)}••••` : t.summaryNotConfigured;
        const ws = merged.defaultWorkspace ? `${t.summaryWorkspace}: ${merged.defaultWorkspace}` : "";
        summaryText = [appIdDisplay, ws].filter(Boolean).join("   •   ");
      } else if (ch.id === "wecom") {
        const botIdDisplay = merged.botId ? `Bot ID: ${String(merged.botId).slice(0, 10)}••••` : t.summaryNotConfiguredWecom;
        const ws = merged.defaultWorkspace ? `${t.summaryWorkspace}: ${merged.defaultWorkspace}` : "";
        summaryText = [botIdDisplay, ws].filter(Boolean).join("   •   ");
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

        // 右侧：运行状态药丸 + 活跃会话数 + 启停开关 + 配置操作按钮
        React.createElement("div", { className: "cc-row-right" },
          React.createElement("div", { className: "cc-row-status-box" },
            React.createElement("span", {
              className: "cc-status-pill",
              "data-status": statusKey,
            },
              React.createElement("span", { className: "cc-pulse-dot" }),
              statusText,
            ),
            configured && (ch.sessions || 0) > 0 && React.createElement("span", {
              className: "cc-row-sessions",
              style: { display: "inline-flex", alignItems: "center", gap: 5 },
            },
              React.createElement(IconNewChatOutline16, { size: 13 }),
              `${ch.sessions} ${t.sessionsCount}`,
            ),
          ),
          configured && React.createElement("div", {
            className: "cc-row-toggle",
            title: autoReply ? t.toggleDisable : t.toggleEnable,
            onClick: (e) => {
              e.stopPropagation();
              onToggle && onToggle(ch, !autoReply);
            },
          },
            React.createElement("div", { className: "cc-switch", "data-checked": String(autoReply) },
              React.createElement("div", { className: "cc-switch-thumb" }),
            ),
          ),
          React.createElement(Button, {
            variant: "ghost",
            icon: React.createElement(IconSettingsOutline16, null),
            onClick: () => onConfigure(ch),
            style: { minWidth: 84 },
          }, t.btnConfigure),
        ),
        ),
        needsAuthorization && React.createElement("div", { className: "cc-auth-warning" },
          React.createElement("strong", { style: { display: "inline-flex", alignItems: "center", gap: 6 } },
            React.createElement(IconWarningOutline16, { size: 14 }),
            t.imessageAuthTitle,
          ),
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

      const load = React.useCallback(async (retryCount = 0) => {
        setState((s) => ({ ...s, status: "loading", error: null }));
        try {
          if (!connection?.rpc) {
            if (retryCount < 3) {
              await new Promise((r) => setTimeout(r, 800));
              return load(retryCount + 1);
            }
            throw new Error("通信服务连接中，请稍后刷新");
          }
          const result = await connection.rpc.call("/api", "channelConfig/list", { args: {} });
          if (!result?.ok) {
            if (retryCount < 2) {
              await new Promise((r) => setTimeout(r, 800));
              return load(retryCount + 1);
            }
            throw new Error(result?.error?.message ?? "RPC 服务响应异常");
          }
          setState({ status: "ready", data: result.value, error: null });
        } catch (error) {
          setState({ status: "error", data: null, error: error instanceof Error ? error.message : String(error) });
        }
      }, [connection]);

      const handleToggle = React.useCallback(async (ch, nextEnabled) => {
        setState((prev) => {
          if (!prev.data?.items) return prev;
          const nextItems = prev.data.items.map((item) => {
            if (item.id === ch.id) {
              return {
                ...item,
                namespace: { ...item.namespace, autoReply: nextEnabled },
                fileConfig: { ...item.fileConfig, autoReply: nextEnabled },
              };
            }
            return item;
          });
          return { ...prev, data: { ...prev.data, items: nextItems } };
        });

        try {
          const gatewayServiceName = (ch.section || ch.id) + "Gateway";
          let res;
          try {
            res = await connection.rpc.call("/api", `${gatewayServiceName}/setConfig`, {
              args: { payload: { autoReply: nextEnabled } },
            });
          } catch (e) { /* fallback */ }

          if (!res?.ok) {
            const currentConfig = { ...ch.namespace, ...ch.fileConfig, autoReply: nextEnabled };
            res = await connection.rpc.call("/api", "channelConfig/save", {
              args: { payload: { section: ch.section || ch.id, config: currentConfig } },
            });
          }
          if (!res?.ok) throw new Error(res?.error?.message ?? "保存失败");
        } catch (err) {
          console.error("Failed to toggle channel autoReply:", err);
          load();
        }
      }, [connection, load]);

      React.useEffect(() => { void load(); }, [load]);

      // 仅展示已验证通过的飞书、企业微信与 iMessage 通道，其余未验证通道默认隐藏
      const items = (state.data?.items || []).filter((ch) => ch.id === "feishu" || ch.id === "imessage" || ch.id === "wecom");
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
              React.createElement(IconNewChatOutline16, { size: 14, style: { color: "var(--dsw-alias-brand-primary, #3370ff)" } }),
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
              icon: React.createElement(IconRefreshOutline16, null),
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
              onToggle: handleToggle,
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
