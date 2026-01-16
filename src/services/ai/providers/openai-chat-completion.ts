import { BaseAIProvider, type ToolCallResult } from "./base-provider.js";
import { AISessionManager } from "../session/ai-session-manager.js";
import type { ChatCompletionTool } from "../tools/tool-schema.js";
import { log } from "../../logger.js";
import { UserProfileValidator } from "../validators/user-profile-validator.js";

interface ToolCallResponse {
  choices: Array<{
    message: {
      content?: string;
      tool_calls?: Array<{
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason?: string;
  }>;
}

export class OpenAIChatCompletionProvider extends BaseAIProvider {
  private aiSessionManager: AISessionManager;

  constructor(config: any, aiSessionManager: AISessionManager) {
    super(config);
    this.aiSessionManager = aiSessionManager;
  }

  getProviderName(): string {
    return "openai-chat";
  }

  supportsSession(): boolean {
    return true;
  }

  async executeToolCall(
    systemPrompt: string,
    userPrompt: string,
    toolSchema: ChatCompletionTool,
    sessionId: string
  ): Promise<ToolCallResult> {
    let session = this.aiSessionManager.getSession(sessionId, "openai-chat");

    if (!session) {
      session = this.aiSessionManager.createSession({
        provider: "openai-chat",
        sessionId,
      });
    }

    const existingMessages = this.aiSessionManager.getMessages(session.id);
    const messages: any[] = [];

    for (const msg of existingMessages) {
      const apiMsg: any = {
        role: msg.role,
        content: msg.content,
      };

      if (msg.toolCalls) {
        apiMsg.tool_calls = msg.toolCalls;
      }

      if (msg.toolCallId) {
        apiMsg.tool_call_id = msg.toolCallId;
      }

      messages.push(apiMsg);
    }

    if (messages.length === 0) {
      const sequence = this.aiSessionManager.getLastSequence(session.id) + 1;
      this.aiSessionManager.addMessage({
        aiSessionId: session.id,
        sequence,
        role: "system",
        content: systemPrompt,
      });

      messages.push({ role: "system", content: systemPrompt });
    }

    const userSequence = this.aiSessionManager.getLastSequence(session.id) + 1;
    this.aiSessionManager.addMessage({
      aiSessionId: session.id,
      sequence: userSequence,
      role: "user",
      content: userPrompt,
    });

    messages.push({ role: "user", content: userPrompt });

    let iterations = 0;
    const maxIterations = this.config.maxIterations ?? 5;
    const iterationTimeout = this.config.iterationTimeout ?? 30000;

    while (iterations < maxIterations) {
      iterations++;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), iterationTimeout);

      try {
        const requestBody = {
          model: this.config.model,
          messages,
          tools: [toolSchema],
          tool_choice: { type: "function", name: toolSchema.function.name },
          temperature: 0.3,
        };

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (this.config.apiKey) {
          headers.Authorization = `Bearer ${this.config.apiKey}`;
        }

        const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text().catch(() => response.statusText);
          log("OpenAI Chat Completion API error", {
            status: response.status,
            error: errorText,
            iteration: iterations,
          });
          return {
            success: false,
            error: `API error: ${response.status} - ${errorText}`,
            iterations,
          };
        }

        const data = (await response.json()) as ToolCallResponse;

        if (!data.choices || !data.choices[0]) {
          return {
            success: false,
            error: "Invalid API response format",
            iterations,
          };
        }

        const choice = data.choices[0];

        const assistantSequence = this.aiSessionManager.getLastSequence(session.id) + 1;
        const assistantMsg: any = {
          aiSessionId: session.id,
          sequence: assistantSequence,
          role: "assistant",
          content: choice.message.content || "",
        };

        if (choice.message.tool_calls) {
          assistantMsg.toolCalls = choice.message.tool_calls;
        }

        this.aiSessionManager.addMessage(assistantMsg);
        messages.push(choice.message);

        if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
          const toolCall = choice.message.tool_calls[0];

          if (toolCall && toolCall.function.name === toolSchema.function.name) {
            try {
              const parsed = JSON.parse(toolCall.function.arguments);
              const result = UserProfileValidator.validate(parsed);
              if (!result.valid) {
                throw new Error(result.errors.join(", "));
              }
              return {
                success: true,
                data: result.data,
                iterations,
              };
            } catch (validationError) {
              const errorStack =
                validationError instanceof Error ? validationError.stack : undefined;
              log("OpenAI tool response validation failed", {
                error: String(validationError),
                stack: errorStack,
                errorType:
                  validationError instanceof Error
                    ? validationError.constructor.name
                    : typeof validationError,
                toolName: toolSchema.function.name,
                iteration: iterations,
                rawArguments: toolCall.function.arguments.slice(0, 500),
              });
              return {
                success: false,
                error: `Validation failed: ${String(validationError)}`,
                iterations,
              };
            }
          }
        }

        const retrySequence = this.aiSessionManager.getLastSequence(session.id) + 1;
        const retryPrompt =
          "Please use the save_memories tool to extract and save the memories from the conversation as instructed.";

        this.aiSessionManager.addMessage({
          aiSessionId: session.id,
          sequence: retrySequence,
          role: "user",
          content: retryPrompt,
        });

        messages.push({ role: "user", content: retryPrompt });
      } catch (error) {
        clearTimeout(timeout);
        if (error instanceof Error && error.name === "AbortError") {
          return {
            success: false,
            error: `API request timeout (${this.config.iterationTimeout}ms)`,
            iterations,
          };
        }
        return {
          success: false,
          error: String(error),
          iterations,
        };
      }
    }

    return {
      success: false,
      error: `Max iterations (${this.config.maxIterations}) reached without tool call`,
      iterations,
    };
  }
}
