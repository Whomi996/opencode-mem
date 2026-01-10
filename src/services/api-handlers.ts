import { memoryClient } from "./client.js";
import { log } from "./logger.js";
import type { MemoryType } from "../types/index.js";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

interface Memory {
  id: string;
  content: string;
  type?: string;
  scope: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function handleListTags(): Promise<ApiResponse<{ user: string[]; project: string[] }>> {
  try {
    await memoryClient.warmup();
    
    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    const results = await table.query().select(["containerTag"]).toArray();
    
    const tags = new Set<string>();
    for (const r of results) {
      if (r.containerTag) {
        tags.add(r.containerTag);
      }
    }

    const userTags: string[] = [];
    const projectTags: string[] = [];

    for (const tag of tags) {
      if (tag.includes("_user_")) {
        userTags.push(tag);
      } else if (tag.includes("_project_")) {
        projectTags.push(tag);
      }
    }

    return {
      success: true,
      data: { user: userTags, project: projectTags }
    };
  } catch (error) {
    log("handleListTags: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleListMemories(
  tag?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ApiResponse<PaginatedResponse<Memory>>> {
  try {
    await memoryClient.warmup();

    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    let query = table.query();
    
    if (tag) {
      query = query.where(`\`containerTag\` = '${tag}'`);
    }

    const allResults = await query.toArray();
    
    const total = allResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    
    const paginatedResults = allResults.slice(offset, offset + pageSize);

    const memories: Memory[] = paginatedResults.map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      scope: r.containerTag?.includes("_user_") ? "user" : "project",
      createdAt: new Date(Number(r.createdAt)).toISOString(),
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));

    return {
      success: true,
      data: {
        items: memories,
        total,
        page,
        pageSize,
        totalPages
      }
    };
  } catch (error) {
    log("handleListMemories: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleAddMemory(data: {
  content: string;
  containerTag: string;
  type?: MemoryType;
}): Promise<ApiResponse<{ id: string }>> {
  try {
    if (!data.content || !data.containerTag) {
      return { success: false, error: "content and containerTag are required" };
    }

    const result = await memoryClient.addMemory(
      data.content,
      data.containerTag,
      { type: data.type }
    );

    if (!result.success) {
      return { success: false, error: result.error || "Failed to add memory" };
    }

    return { success: true, data: { id: result.id } };
  } catch (error) {
    log("handleAddMemory: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleDeleteMemory(id: string): Promise<ApiResponse<void>> {
  try {
    if (!id) {
      return { success: false, error: "id is required" };
    }

    const result = await memoryClient.deleteMemory(id);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to delete memory" };
    }

    return { success: true };
  } catch (error) {
    log("handleDeleteMemory: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleBulkDelete(ids: string[]): Promise<ApiResponse<{ deleted: number }>> {
  try {
    if (!ids || ids.length === 0) {
      return { success: false, error: "ids array is required" };
    }

    let deleted = 0;
    for (const id of ids) {
      const result = await memoryClient.deleteMemory(id);
      if (result.success) {
        deleted++;
      }
    }

    return { success: true, data: { deleted } };
  } catch (error) {
    log("handleBulkDelete: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleUpdateMemory(
  id: string,
  data: { content?: string; type?: MemoryType }
): Promise<ApiResponse<void>> {
  try {
    if (!id) {
      return { success: false, error: "id is required" };
    }

    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    const existing = await table.query().where(`\`id\` = '${id}'`).toArray();
    
    if (existing.length === 0) {
      return { success: false, error: "Memory not found" };
    }

    const memory = existing[0];
    
    await memoryClient.deleteMemory(id);

    const embedder = (memoryClient as any).embedder;
    const vector = await embedder.embed(data.content || memory.content);

    const updatedMemory = {
      id,
      content: data.content || memory.content,
      vector,
      containerTag: memory.containerTag,
      type: data.type || memory.type,
      createdAt: memory.createdAt,
      updatedAt: Date.now(),
      metadata: memory.metadata,
    };

    await table.add([updatedMemory]);

    return { success: true };
  } catch (error) {
    log("handleUpdateMemory: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleSearch(
  query: string,
  tag?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ApiResponse<PaginatedResponse<Memory & { similarity: number }>>> {
  try {
    if (!query) {
      return { success: false, error: "query is required" };
    }

    await memoryClient.warmup();

    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    const embedder = (memoryClient as any).embedder;
    const queryVector = await embedder.embed(query);

    let dbQuery = table.query().nearestTo(queryVector);
    
    if (tag) {
      dbQuery = dbQuery.where(`\`containerTag\` = '${tag}'`);
    }

    const allResults = await dbQuery.limit(1000).toArray();

    const total = allResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    
    const paginatedResults = allResults.slice(offset, offset + pageSize);

    const memories = paginatedResults.map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      scope: r.containerTag?.includes("_user_") ? "user" : "project",
      createdAt: new Date(Number(r.createdAt)).toISOString(),
      similarity: Math.round((1 - (r._distance || 0)) * 100),
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));

    return {
      success: true,
      data: {
        items: memories,
        total,
        page,
        pageSize,
        totalPages
      }
    };
  } catch (error) {
    log("handleSearch: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}

export async function handleStats(): Promise<ApiResponse<{
  total: number;
  byScope: { user: number; project: number };
  byType: Record<string, number>;
}>> {
  try {
    await memoryClient.warmup();

    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    const results = await table.query().toArray();

    let userCount = 0;
    let projectCount = 0;
    const typeCount: Record<string, number> = {};

    for (const r of results) {
      if (r.containerTag?.includes("_user_")) {
        userCount++;
      } else if (r.containerTag?.includes("_project_")) {
        projectCount++;
      }

      if (r.type) {
        typeCount[r.type] = (typeCount[r.type] || 0) + 1;
      }
    }

    return {
      success: true,
      data: {
        total: results.length,
        byScope: { user: userCount, project: projectCount },
        byType: typeCount
      }
    };
  } catch (error) {
    log("handleStats: error", { error: String(error) });
    return { success: false, error: String(error) };
  }
}
