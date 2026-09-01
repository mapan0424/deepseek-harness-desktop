if (typeof window !== "undefined" && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: "@anarkhgatsby/deepseek-harness-channel-imessage",
    factory: (require) => {
      const module = { exports: {} };
      const exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

      exports.IMESSAGE_GATEWAY = "imessageGateway";
      exports.MODES = ["local"];
      exports.modeMeta = {
        local: {
          label: "本机 Messages.app",
          description: "通过本机 chat.db 与 Messages.app 直接收发 iMessage。数据不经过第三方云服务。",
          fields: ["chatDb", "defaultWorkspace"],
        },
      };

      return module.exports;
    },
  });
}
