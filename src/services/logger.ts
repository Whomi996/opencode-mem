import {
  appendFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  renameSync,
  unlinkSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";

const LOG_DIR = join(homedir(), ".opencode-mem");
const LOG_FILE = join(LOG_DIR, "opencode-mem.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024;

const GLOBAL_LOGGER_KEY = Symbol.for("opencode-mem.logger.initialized");

function rotateLog() {
  try {
    if (!existsSync(LOG_FILE)) return;
    const stats = statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;

    const oldLog = LOG_FILE + ".old";
    if (existsSync(oldLog)) unlinkSync(oldLog);
    renameSync(LOG_FILE, oldLog);
  } catch {}
}

function ensureLoggerInitialized() {
  if ((globalThis as any)[GLOBAL_LOGGER_KEY]) return;
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  rotateLog();
  writeFileSync(LOG_FILE, `\n--- Session started: ${new Date().toISOString()} ---\n`, {
    flag: "a",
  });
  (globalThis as any)[GLOBAL_LOGGER_KEY] = true;
}

export function log(message: string, data?: unknown) {
  ensureLoggerInitialized();
  const timestamp = new Date().toISOString();
  const line = data
    ? `[${timestamp}] ${message}: ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
}
