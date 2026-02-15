# OpenCode Memory

[![npm version](https://img.shields.io/npm/v/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![npm downloads](https://img.shields.io/npm/dm/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)
[![license](https://img.shields.io/npm/l/opencode-mem.svg)](https://www.npmjs.com/package/opencode-mem)

![OpenCode Memory Banner](.github/banner.png)

用于 AI 编码代理的持久内存系统，可使用本地矢量数据库技术实现跨会话的长期上下文保留。

## 视觉概述

**项目记忆时间轴：**

![Project Memory Timeline](.github/screenshot-project-memory.png)

**用户个人资料查看器：**

![User Profile Viewer](.github/screenshot-user-profile.png)

## 核心特性

采用 SQLite 的本地矢量数据库、持久项目记忆、自动用户配置文件学习、统一记忆提示时间线、功能齐全的 Web UI、基于智能提示的内存提取、多提供商 AI 支持（OpenAI、Anthropic）、12+ 本地嵌入模型、智能重复数据删除和内置隐私保护。

## 快速开始

添加到 `~/.config/opencode/opencode.json` 处的 OpenCode 配置：

```jsonc
{
  "plugins": ["opencode-mem"],
}
```

该插件会在下次启动时自动下载。使用 Apple Silicon 的 macOS 用户必须安装 Homebrew SQLite 并配置自定义路径 - 有关详细信息，请参阅我们的 Wiki。

## 用法示例

```typescript
memory({ mode: "add", content: "Project uses microservices architecture" });
memory({ mode: "search", query: "architecture decisions" });
memory({ mode: "profile" });
memory({ mode: "list", limit: 10 });
```

访问 `http://127.0.0.1:4747` 的 Web 界面进行视觉内存浏览和管理。

## 配置要点

在 `~/.config/opencode/opencode-mem.jsonc` 处配置：

```jsonc
{
  "storagePath": "~/.opencode-mem/data",
  "userEmailOverride": "user@example.com",
  "userNameOverride": "John Doe",
  "embeddingModel": "Xenova/nomic-embed-text-v1",
  "webServerEnabled": true,
  "webServerPort": 4747,

  "autoCaptureEnabled": true,
  "autoCaptureLanguage": "auto",
  "memoryProvider": "openai-chat",
  "memoryModel": "gpt-4o-mini",
  "memoryApiUrl": "https://api.openai.com/v1",
  "memoryApiKey": "sk-...",
  "memoryTemperature": 0.3,

  "showAutoCaptureToasts": true,
  "showUserProfileToasts": true,
  "showErrorToasts": true,

  "userProfileAnalysisInterval": 10,
  "maxMemories": 10,

  "compaction": {
    "enabled": true,
    "memoryLimit": 10,
  },
  "chatMessage": {
    "enabled": true,
    "maxMemories": 3,
    "excludeCurrentSession": true,
    "maxAgeDays": undefined,
    "injectOn": "first",
  },
}
```

**API 密钥格式：**

```jsonc
"memoryApiKey": "sk-..."
"memoryApiKey": "file://~/.config/opencode/api-key.txt"
"memoryApiKey": "env://OPENAI_API_KEY"
```

完整文档请查看 [配置指南](https://github.com/tickernelz/opencode-mem/wiki/Configuration-Guide)。

## 文档

- [安装指南](https://github.com/tickernelz/opencode-mem/wiki/Installation-Guide)
- [API 参考](https://github.com/tickernelz/opencode-mem/wiki/API-Reference)
- [故障排查](https://github.com/tickernelz/opencode-mem/wiki/Troubleshooting)
- [完整 Wiki](https://github.com/tickernelz/opencode-mem/wiki)

## 开发与贡献

本地构建和测试：

```bash
bun install
bun run build
bun run typecheck
bun run format
```

该项目欢迎贡献，目标是成为 AI 编码代理可靠的记忆插件。无论你是修复 bug、添加功能、改进文档，还是扩展嵌入模型支持，贡献都非常有价值。代码结构清晰，便于扩展；如果你遇到阻碍或有改进建议，欢迎提交 Pull Request，我们会尽快审查与合并。

## 许可证和链接

MIT 许可证 - 详见 LICENSE 文件

- **存储库**：https://github.com/tickernelz/opencode-mem
- **维基**：https://github.com/tickernelz/opencode-mem/wiki
- **问题**：https://github.com/tickernelz/opencode-mem/issues
- **开放代码平台**：https://opencode.ai

灵感来自 [opencode-supermemory](https://github.com/supermemoryai/opencode-supermemory)
