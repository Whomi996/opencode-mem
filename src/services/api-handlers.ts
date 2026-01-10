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
  displayName?: string;
  userName?: string;
  userEmail?: string;
  projectPath?: string;
  projectName?: string;
  gitRepoUrl?: string;
}

interface TagInfo {
  tag: string;
  displayName?: string;
  userName?: string;
  userEmail?: string;
  projectPath?: string;
  projectName?: string;
  gitRepoUrl?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function handleListTags(): Promise<ApiResponse<{ user: TagInfo[]; project: TagInfo[] }>> {
  try {
    await memoryClient.warmup();
    await (memoryClient as any).refreshTable();
    
    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    const results = await table.query().select([
      "containerTag", 
      "displayName", 
      "userName", 
      "userEmail", 
      "projectPath", 
      "projectName", 
      "gitRepoUrl"
    ]).toArray();
    
    const tagsMap = new Map<string, TagInfo>();
    
    for (const r of results) {
      if (r.containerTag && !tagsMap.has(r.containerTag)) {
        tagsMap.set(r.containerTag, {
          tag: r.containerTag,
          displayName: r.displayName,
          userName: r.userName,
          userEmail: r.userEmail,
          projectPath: r.projectPath,
          projectName: r.projectName,
          gitRepoUrl: r.gitRepoUrl,
        });
      }
    }

    const userTags: TagInfo[] = [];
    const projectTags: TagInfo[] = [];

    for (const tagInfo of tagsMap.values()) {
      if (tagInfo.tag.includes("_user_")) {
        userTags.push(tagInfo);
      } else if (tagInfo.tag.includes("_project_")) {
        projectTags.push(tagInfo);
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

export async function handleListMemories(
  tag?: string,
  page: number = 1,
  pageSize: number = 20
): Promise<ApiResponse<PaginatedResponse<Memory>>> {
  try {
    await memoryClient.warmup();
    await (memoryClient as any).refreshTable();

    const table = (memoryClient as any).table;
    if (!table) {
      return { success: false, error: "Database not initialized" };
    }

    let query = table.query();
    
    if (tag) {
      query = query.where(`\`containerTag\` = '${tag}'`);
    }

    const allResults = await query.toArray();
    
    const sortedResults = allResults.sort((a: any, b: any) => 
      Number(b.createdAt) - Number(a.createdAt)
    );
    
    const total = sortedResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    
    const paginatedResults = sortedResults.slice(offset, offset + pageSize);

    const memories: Memory[] = paginatedResults.map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      scope: r.containerTag?.includes("_user_") ? "user" : "project",
      createdAt: safeToISOString(r.createdAt),
      metadata: safeJSONParse(r.metadata),
      displayName: r.displayName,
      userName: r.userName,
      userEmail: r.userEmail,
      projectPath: r.projectPath,
      projectName: r.projectName,
      gitRepoUrl: r.gitRepoUrl,
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
  displayName?: string;
  userName?: string;
  userEmail?: string;
  projectPath?: string;
  projectName?: string;
  gitRepoUrl?: string;
}): Promise<ApiResponse<{ id: string }>> {
  try {
    if (!data.content || !data.containerTag) {
      return { success: false, error: "content and containerTag are required" };
    }

    const result = await memoryClient.addMemory(
      data.content,
      data.containerTag,
      { 
        type: data.type,
        displayName: data.displayName,
        userName: data.userName,
        userEmail: data.userEmail,
        projectPath: data.projectPath,
        projectName: data.projectName,
        gitRepoUrl: data.gitRepoUrl,
      }
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

    await memoryClient.warmup();
    await (memoryClient as any).refreshTable();

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
      displayName: memory.displayName,
      userName: memory.userName,
      userEmail: memory.userEmail,
      projectPath: memory.projectPath,
      projectName: memory.projectName,
      gitRepoUrl: memory.gitRepoUrl,
    };

    await table.add([updatedMemory]);
    await (memoryClient as any).refreshTable();

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
    await (memoryClient as any).refreshTable();

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
    
    const sortedResults = allResults.sort((a: any, b: any) => 
      Number(b.createdAt) - Number(a.createdAt)
    );

    const total = sortedResults.length;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;
    
    const paginatedResults = sortedResults.slice(offset, offset + pageSize);

    const memories = paginatedResults.map((r: any) => ({
      id: r.id,
      content: r.content,
      type: r.type,
      scope: r.containerTag?.includes("_user_") ? "user" : "project",
      createdAt: safeToISOString(r.createdAt),
      similarity: Math.round((1 - (r._distance || 0)) * 100),
      metadata: safeJSONParse(r.metadata),
      displayName: r.displayName,
      userName: r.userName,
      userEmail: r.userEmail,
      projectPath: r.projectPath,
      projectName: r.projectName,
      gitRepoUrl: r.gitRepoUrl,
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
    await (memoryClient as any).refreshTable();

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
