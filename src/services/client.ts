import { connect } from "@lancedb/lancedb";
import { pipeline, env } from "@xenova/transformers";
import { existsSync, mkdirSync } from "node:fs";
import * as arrow from "apache-arrow";
import { CONFIG } from "../config.js";
import { log } from "./logger.js";
import type { MemoryType } from "../types/index.js";

function safeToISOString(timestamp: any): string {
  try {
    if (timestamp === null || timestamp === undefined) {
      return new Date().toISOString();
    }
    const numValue = typeof timestamp === 'bigint' 
      ? Number(timestamp) 
      : Number(timestamp);
    
    if (isNaN(numValue) || numValue < 0) {
      return new Date().toISOString();
    }
    
    return new Date(numValue).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function safeJSONParse(jsonString: any): any {
  if (!jsonString || typeof jsonString !== 'string') {
    return undefined;
  }
  try {
    return JSON.parse(jsonString);
  } catch {
    return undefined;
  }
}

env.allowLocalModels = true;
env.allowRemoteModels = true;
env.cacheDir = CONFIG.storagePath + "/.cache";

const TIMEOUT_MS = 30000;

interface MemoryRecord {
  id: string;
  content: string;
  vector: number[];
  containerTag: string;
  type?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: string;
  displayName?: string;
  userName?: string;
  userEmail?: string;
  projectPath?: string;
  projectName?: string;
  gitRepoUrl?: string;
}

interface SearchResult {
  id: string;
  memory: string;
  similarity: number;
  metadata?: Record<string, unknown>;
  displayName?: string;
  userName?: string;
  userEmail?: string;
  projectPath?: string;
  projectName?: string;
  gitRepoUrl?: string;
}

interface ProfileData {
  static: string[];
  dynamic: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    ),
  ]);
}

class EmbeddingService {
  private pipe: any = null;
  private initPromise: Promise<void> | null = null;
  public isWarmedUp: boolean = false;

  async warmup(progressCallback?: (progress: any) => void): Promise<void> {
    if (this.isWarmedUp) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (CONFIG.embeddingApiUrl && CONFIG.embeddingApiKey) {
          log("Using OpenAI-compatible API for embeddings");
          this.isWarmedUp = true;
          return;
        }

        log("Downloading embedding model", { model: CONFIG.embeddingModel });

        this.pipe = await pipeline(
          "feature-extraction",
          CONFIG.embeddingModel,
          { progress_callback: progressCallback }
        );

        this.isWarmedUp = true;
        log("Embedding model ready");
      } catch (error) {
        this.initPromise = null;
        log("Failed to initialize embedding model", { error: String(error) });
        throw error;
      }
    })();

    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.isWarmedUp && !this.initPromise) {
      await this.warmup();
    }

    if (this.initPromise) {
      await this.initPromise;
    }

    if (CONFIG.embeddingApiUrl && CONFIG.embeddingApiKey) {
      const response = await fetch(`${CONFIG.embeddingApiUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${CONFIG.embeddingApiKey}`,
        },
        body: JSON.stringify({
          input: text,
          model: CONFIG.embeddingModel,
        }),
      });

      if (!response.ok) {
        throw new Error(`API embedding failed: ${response.statusText}`);
      }

      const data: any = await response.json();
      return data.data[0].embedding;
    }

    const output = await this.pipe(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  }
}

export class LocalMemoryClient {
  private db: any = null;
  private table: any = null;
  private embedder: EmbeddingService;
  private initPromise: Promise<void> | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.embedder = new EmbeddingService();
  }

  private async initialize(): Promise<void> {
    if (this.isConnected) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        if (!existsSync(CONFIG.storagePath)) {
          mkdirSync(CONFIG.storagePath, { recursive: true });
        }

        this.db = await connect(CONFIG.storagePath);

        const tableNames = await this.db.tableNames();
        if (tableNames.includes("memories")) {
          this.table = await this.db.openTable("memories");
        } else {
          const schema = new arrow.Schema([
            new arrow.Field("id", new arrow.Utf8(), false),
            new arrow.Field("content", new arrow.Utf8(), false),
            new arrow.Field("vector", new arrow.FixedSizeList(384, new arrow.Field("item", new arrow.Float32(), true)), false),
            new arrow.Field("containerTag", new arrow.Utf8(), false),
            new arrow.Field("type", new arrow.Utf8(), true),
            new arrow.Field("createdAt", new arrow.Int64(), false),
            new arrow.Field("updatedAt", new arrow.Int64(), false),
            new arrow.Field("metadata", new arrow.Utf8(), true),
            new arrow.Field("displayName", new arrow.Utf8(), true),
            new arrow.Field("userName", new arrow.Utf8(), true),
            new arrow.Field("userEmail", new arrow.Utf8(), true),
            new arrow.Field("projectPath", new arrow.Utf8(), true),
            new arrow.Field("projectName", new arrow.Utf8(), true),
            new arrow.Field("gitRepoUrl", new arrow.Utf8(), true),
          ]);
          this.table = await this.db.createEmptyTable("memories", schema);
        }

        this.isConnected = true;
        log("LanceDB connected", { path: CONFIG.storagePath });
      } catch (error) {
        this.initPromise = null;
        log("LanceDB connection failed", { error: String(error) });
        throw error;
      }
    })();

    return this.initPromise;
  }

  async warmup(progressCallback?: (progress: any) => void): Promise<void> {
    await this.initialize();
    await this.embedder.warmup(progressCallback);
  }

  async isReady(): Promise<boolean> {
    return this.isConnected && this.embedder.isWarmedUp;
  }

  getStatus(): {
    dbConnected: boolean;
    modelLoaded: boolean;
    ready: boolean;
  } {
    return {
      dbConnected: this.isConnected,
      modelLoaded: this.embedder.isWarmedUp,
      ready: this.isConnected && this.embedder.isWarmedUp,
    };
  }

  async refreshTable(): Promise<void> {
    if (!this.db) {
      log("refreshTable: db not initialized");
      return;
    }
    
    try {
      this.table = await this.db.openTable("memories");
    } catch (error) {
      log("refreshTable: error", { error: String(error) });
      throw error;
    }
  }

  async searchMemories(query: string, containerTag: string) {
    log("searchMemories: start", { containerTag });
    try {
      await this.initialize();
      await this.refreshTable();

      const queryVector = await withTimeout(
        this.embedder.embed(query),
        TIMEOUT_MS
      );

      const results = await this.table
        .query()
        .nearestTo(queryVector)
        .where(`\`containerTag\` = '${containerTag}'`)
        .limit(CONFIG.maxMemories)
        .toArray();

      const mapped: SearchResult[] = results.map((r: any) => ({
        id: r.id,
        memory: r.content,
        similarity: 1 - (r._distance || 0),
        metadata: safeJSONParse(r.metadata),
        displayName: r.displayName,
        userName: r.userName,
        userEmail: r.userEmail,
        projectPath: r.projectPath,
        projectName: r.projectName,
        gitRepoUrl: r.gitRepoUrl,
      })).filter((r: SearchResult) => r.similarity >= CONFIG.similarityThreshold);

      log("searchMemories: success", { count: mapped.length });
      return { success: true as const, results: mapped, total: mapped.length, timing: 0 };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("searchMemories: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, results: [], total: 0, timing: 0 };
    }
  }

  async getProfile(containerTag: string, query?: string) {
    log("getProfile: start", { containerTag });
    try {
      await this.initialize();
      await this.refreshTable();

      const results = await this.table
        .query()
        .where(`\`containerTag\` = '${containerTag}'`)
        .limit(CONFIG.maxProfileItems * 2)
        .toArray();

      const staticFacts: string[] = [];
      const dynamicFacts: string[] = [];

      for (const r of results) {
        const content = r.content;
        if (r.type === "preference") {
          staticFacts.push(content);
        } else {
          dynamicFacts.push(content);
        }
      }

      const profile: ProfileData = {
        static: staticFacts.slice(0, CONFIG.maxProfileItems),
        dynamic: dynamicFacts.slice(0, CONFIG.maxProfileItems),
      };

      log("getProfile: success", { hasProfile: true });
      return { success: true as const, profile };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("getProfile: error", { error: errorMessage });
      return { success: false as const, error: errorMessage, profile: null };
    }
  }

  async addMemory(
    content: string,
    containerTag: string,
    metadata?: { 
      type?: MemoryType; 
      tool?: string; 
      displayName?: string;
      userName?: string;
      userEmail?: string;
      projectPath?: string;
      projectName?: string;
      gitRepoUrl?: string;
      [key: string]: unknown;
    }
  ) {
    log("addMemory: start", { containerTag, contentLength: content.length });
    try {
      await this.initialize();

      const vector = await withTimeout(
        this.embedder.embed(content),
        TIMEOUT_MS
      );

      const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
      const now = Date.now();

      const record: MemoryRecord = {
        id,
        content,
        vector,
        containerTag,
        type: metadata?.type,
        createdAt: now,
        updatedAt: now,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
        displayName: metadata?.displayName,
        userName: metadata?.userName,
        userEmail: metadata?.userEmail,
        projectPath: metadata?.projectPath,
        projectName: metadata?.projectName,
        gitRepoUrl: metadata?.gitRepoUrl,
      };

      await this.table.add([record]);
      await this.refreshTable();

      log("addMemory: success", { id });
      return { success: true as const, id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("addMemory: error", { error: errorMessage });
      return { success: false as const, error: errorMessage };
    }
  }

  async deleteMemory(memoryId: string) {
    log("deleteMemory: start", { memoryId });
    try {
      await this.initialize();

      await this.table.delete(`\`id\` = '${memoryId}'`);
      await this.refreshTable();

      log("deleteMemory: success", { memoryId });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("deleteMemory: error", { memoryId, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async listMemories(containerTag: string, limit = 20) {
    log("listMemories: start", { containerTag, limit });
    try {
      await this.initialize();
      await this.refreshTable();

      const results = await this.table
        .query()
        .where(`\`containerTag\` = '${containerTag}'`)
        .limit(limit)
        .toArray();

      const memories = results
        .sort((a: any, b: any) => Number(b.createdAt) - Number(a.createdAt))
        .map((r: any) => ({
          id: r.id,
          summary: r.content,
          createdAt: safeToISOString(r.createdAt),
          metadata: safeJSONParse(r.metadata),
          displayName: r.displayName,
          userName: r.userName,
          userEmail: r.userEmail,
          projectPath: r.projectPath,
          projectName: r.projectName,
          gitRepoUrl: r.gitRepoUrl,
        }));

      log("listMemories: success", { count: memories.length });
      return {
        success: true as const,
        memories,
        pagination: { currentPage: 1, totalItems: memories.length, totalPages: 1 }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("listMemories: error", { error: errorMessage });
      return {
        success: false as const,
        error: errorMessage,
        memories: [],
        pagination: { currentPage: 1, totalItems: 0, totalPages: 0 }
      };
    }
  }
}

export const memoryClient = new LocalMemoryClient();
