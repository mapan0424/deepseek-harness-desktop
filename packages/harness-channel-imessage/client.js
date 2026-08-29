if (typeof window !== "undefined" && window.__ModuleLoader__) {
  window.__ModuleLoader__.load({
    id: "@anarkhgatsby/deepseek-harness-channel-imessage",
    factory: (require) => {
      const module = { exports: {} };
      const exports = module.exports;
      Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

      exports.IMESSAGE_GATEWAY = "imessageGateway";
      exports.MODES = ["imsg", "photon", "relay"];
      exports.modeMeta = {
        imsg: {
          label: "本地 imsg",
          description: "Mac + Messages.app + imsg CLI（JSON-RPC over stdio）。数据不出本机，需 Mac 与自动化/全盘访问授权。",
          fields: ["imsgCmd", "chatDb", "defaultWorkspace"],
        },
        photon: {
          label: "Photon 云端",
          description: "托管 iMessage 号码（hosted line），无需 Mac/SIM/Apple ID。RFC 8628 浏览器授权，开箱即用。v1 仅纯文本一对一。",
          fields: ["photonApiOrigin"],
          authFlow: "device",
        },
        relay: {
          label: "云中继",
          description: "Claw Messenger / Sendblue 等消息 API 中继。数据经第三方云，开箱即用、无需 Apple 设备。",
          fields: ["relayProvider", "relayApiBase"],
        },
      };

      return module.exports;
    },
  });
}
