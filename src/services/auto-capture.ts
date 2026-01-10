import type { PluginInput } from "@opencode-ai/plugin";
import { memoryClient } from "./client.js";
import { getTags } from "./tags.js";
import { log } from "./logger.js";
import { CONFIG } from "../config.js";
import type { MemoryType } from "../types/index.js";

interface MessageEntry {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface ToolEntry {
  name: string;
  args: unknown;
  result: string;
  timestamp: number;
}

interface CaptureBuffer {
  sessionID: string;
  iterationCount: number;
  messages: MessageEntry[];
  tools: ToolEntry[];
  lastCaptureTime: number;
  fileEdits: number;
}

interface MemoryEntry {
  summary: string;
  scope: "user" | "project";
  type: MemoryType;
  reasoning: string;
}

interface CaptureResponse {
  memories: MemoryEntry[];
}

export class AutoCaptureService {
  private buffers = new Map<string, CaptureBuffer>();
  private capturing = new Set<string>();
  private threshold: number;
  private timeThreshold: number;
  private enabled: boolean;
  private maxMemories: number;

  constructor() {
    this.threshold = CONFIG.autoCaptureThreshold;
    this.timeThreshold = CONFIG.autoCaptureTimeThreshold * 60 * 1000;
    this.enabled = CONFIG.autoCaptureEnabled;
    this.maxMemories = CONFIG.autoCaptureMaxMemories;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private getOrCreateBuffer(sessionID: string): CaptureBuffer {
    if (!this.buffers.has(sessionID)) {
      this.buffers.set(sessionID, {
        sessionID,
        iterationCount: 0,
        messages: [],
        tools: [],
        lastCaptureTime: Date.now(),
  fileEdits: 0,
      });
    }
    return this.buffers.get(sessionID)!;
  }

  onSessionIdle(sessionID: string): boolean {
    if (!this.enabled) return false;
    if (this.capturing.has(sessionID)) return false;

    const buffer = this.getOrCreateBuffer(sessionID);
    buffer.iterationCount++;

    const timeSinceCapture = Date.now() - buffer.lastCaptureTime;
    const iterationMet = buffer.iterationCount >= this.threshold;
    const timeMet = this.timeThreshold > 0 && timeSinceCapture >= this.timeThreshold;

    return iterationMet || timeMet;
  }

  addMessage(sessionID: string, role: "user" | "assistant", content: string) {
    if (!this.enabled) return;
    const buffer = this.getOrCreateBuffer(sessionID);
    buffer.messages.push({ role, content, timestamp: Date.now() });
  }

  addTool(sessionID: string, name: string, args: unknown, result: string) {
    if (!this.enabled) return;
    const buffer = this.getOrCreateBuffer(sessionID);
    buffer.tools.push({ name, args, result, timestamp: Date.now() });
  }

  onFileEdit(sessionID: string) {
    if (!this.enabled) return;
    const buffer = this.getOrCreateBuffer(sessionID);
    buffer.fileEdits++;
  }

  getSummaryPrompt(sessionID: string): string {
    const buffer = this.buffers.get(sessionID);
    if (!buffer) return "";

    const conversationText = buffer.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");

    const toolsText = buffer.tools.length > 0
      ? `\n\nTools executed:\n${buffer.tools.map((t) => `- ${t.name}`).join("\n")}`
      : "";

    return `Analyze the last ${buffer.iterationCount} iterations of conversation.

Extract distinct, actionable memories and categorize each by scope:

**Scope definitions:**
- "user": Cross-project user behaviors, preferences, patterns
  Examples: "prefers TypeScript", "likes concise responses", "uses vim keybindings"
  
- "project": Project-specific knowledge, decisions, archit Examples: "uses Bun runtime", "API at /api/v1", "database is PostgreSQL"

**Memory types:**
- preference: User preferences
- learned-pattern: User behavior patterns
- project-config: Project configuration/setup
- architecture: Project architecture decisions
- error-solution: Solutions to specific errors
- conversation: General conversation summary

Return JSON array (can be empty if nothing worth remembering):
{
  "memories": [
    {
      "summary": "Clear, concise summary (max 200 chars)",
      "scope": "user" | "project",
      "type": "preference" | "learned-pattern" | "project-config" | "architecture" | "error-solution" | "conversation",
      "reasoning": "Why this is worth remembering"
    }
  ]
}

Conversation:
${conversationText}${toolsText}

IMPORTANT: 
- Only extract memories worth long-term retention
- Be selective: quality over quantity
- Each memory should be atomic and independent
- Return empty array if nothing significant to remember
- Maximum ${this.maxMemories} memories per capture`;
  }

  markCapturing(sessionID: string) {
    this.capturing.add(sessionID);
  }

  clearBuffer(sessionID: string) {
    const buffer = this.buffers.get(sessionID);
    if (buffer) {
      this.buffers.set(sessionID, {
        sessionID,
        iterationCount: 0,
        messages: [],
        tools: [],
        lastCaptureTime: Date.now(),
        fileEdits: 0,
      });
    }
    this.capturing.delete(sessionID);
  }

  getStats(sessionID: string) {
    const buffer = this.buffers.get(sessionID);
    if (!buffer) return null;

    return {
      iterations: buffer.iterationCount,
      messages: buffer.messages.length,
      tools: buffer.tools.length,
      fileEdits: buffer.fileEdits,
      timeSinceCapture: Date.now() - buffer.lastCaptureTime,
    };
  }

  cleanup(sessionID: string) {
    this.buffers.delete(sessionID);
    this.capturing.delete(sessionID);
  }
}

export async function performAutoCapture(
  ctx: PluginInput,
  service: AutoCaptureService,
  sessionID: string,
  directory: string
): Promise<void> {
  try {
    service.markCapturing(sessionID);

    await ctx.client?.tui.showToast({
      body: {
        title: "Auto-Capture",
        message: "Analyzing conversation...",
        variant: "info",
        duration: 2000,
      },
    }).catch(() => {});

    const prompt = service.getSummaryPrompt(sessionID);
    if (!prompt) {
      log("Auto-capture: no content to summarize", { sessionID });
      service.clearBuffer(sessionID);
      return;
    }

    const response = await summarizeWithAI(ctx, sessionID, prompt);
    if (!response) {
      throw new Error("Failed to generate summary");
    }

    let parsed: CaptureResponse;
    try {
      parsed = JSON.parse(response);
      if (!parsed.memories || !Array.isArray(parsed.memories)) {
        throw new Error("Invalid response format");
      }
    } catch (error) {
      log("Auto-capture: JSON parse failed, using fallback", { error: String(error) });
      parsed = {
        memories: [{
          summary: response.substring(0, 500),
          scope: "project",
          type: "conversation",
          reasoning: "Fallback capture due to parse error"
        }]
      };
    }

    const tags = getTags(directory);
    const results: Array<{ scope: string; id: string }> = [];

    for (const memory of parsed.memories.slice(0, CONFIG.autoCaptureMaxMemories)) {
      if (!memory.summary || !memory.scope || !memory.type) {
        log("Auto-capture: invalid memory entry", { memory });
        continue;
      }

      const containerTag = memory.scope === "user" ? tags.user : tags.project;

      const result = await memoryClient.addMemory(
        memory.summary,
        containerTag,
        {
          type: memory.type,
          source: "auto-capture",
          sessionID,
          reasoning: memory.reasoning,
          captureTimestamp: Date.now(),
        }
      );

      if (result.success) {
        results.push({ scope: memory.scope, id: result.id });
        log("Auto-capture: memory saved", {
          scope: memory.scope,
          type: memory.type,
          id: result.id,
        });
      }
    }

    if (results.length === 0) {
      log("Auto-capture: no memories captured", { sessionID });
      service.clearBuffer(sessionID);
      return;
    }

    const userCount = results.filter(r => r.scope === "user").length;
    const projectCount = results.filter(r => r.scope === "project").length;

    await ctx.client?.tui.showToast({
      body: {
        title: "Memory Captured",
        message: `Saved ${userCount} user + ${projectCount} project memories`,
        variant: "success",
        duration: 3000,
      },
    }).catch(() => {});

    log("Auto-capture: success", {
      sessionID,
      userCount,
      projectCount,
      total: results.length,
    });

    service.clearBuffer(sessionID);
  } catch (error) {
    log("Auto-capture: error", { sessionID, error: String(error) });

    await ctx.client?.tui.showToast({
      body: {
        title: "Auto-Capture Failed",
        message: String(error),
        variant: "error",
        duration: 5000,
      },
    }).catch(() => {});

    service.clearBuffer(sessionID);
  }
}

async function summarizeWithAI(
  ctx: PluginInput,
  sessionID: string,
  prompt: string
): Promise<string> {
  if (!ctx.client) {
    throw new Error("Client not available");
  }

  const useExternalAPI = CONFIG.memoryModel && CONFIG.memoryApiUrl && CONFIG.memoryApiKey;

  if (useExternalAPI) {
    return await callExternalAPI(prompt);
  } else {
    return await callSessionModel(ctx, sessionID, prompt);
  }
}

async function callExternalAPI(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`${CONFIG.memoryApiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CONFIG.memoryApiKey}`,
      },
      body: JSON.stringify({
        model: CONFIG.memoryModel,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    return data.choices[0].message.content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

async function callSessionModel(
  ctx: PluginInput,
  sessionID: string,
  prompt: string
): Promise<string> {
  if (!ctx.client) {
    throw new Error("Client not available");
  }

  const response = await ctx.client.session.prompt({
    path: { id: sessionID },
    body: {
      noReply: false,
      parts: [{ type: "text", text: prompt }],
    },
  });

  if (!response.data) {
    throw new Error("No response from AI");
  }

  const textParts = response.data.parts.filter(
    (p: any) => p.type === "text"
  );

  return textParts.map((p: any) => p.text).join("").trim();
}

