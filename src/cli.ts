#!/usr/bin/env node
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import * as readline from "node:readline";
import { stripJsoncComments } from "./services/jsonc.js";

const OPENCODE_CONFIG_DIR = join(homedir(), ".config", "opencode");
const PLUGIN_NAME = "opencode-mem@latest";

function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

async function confirm(rl: readline.Interface, question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

function findOpencodeConfig(): string | null {
  const candidates = [
    join(OPENCODE_CONFIG_DIR, "opencode.jsonc"),
    join(OPENCODE_CONFIG_DIR, "opencode.json"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

function addPluginToConfig(configPath: string): boolean {
  try {
    const content = readFileSync(configPath, "utf-8");
    
    if (content.includes("opencode-mem")) {
      console.log("✓ Plugin already registered in config");
      return true;
    }

    const jsonContent = stripJsoncComments(content);
    let config: Record<string, unknown>;
    
    try {
      config = JSON.parse(jsonContent);
    } catch {
      console.error("✗ Failed to parse config file");
      return false;
    }

    const plugins = (config.plugin as string[]) || [];
    plugins.push(PLUGIN_NAME);
    config.plugin = plugins;

    if (configPath.endsWith(".jsonc")) {
      if (content.includes('"plugin"')) {
        const newContent = content.replace(
          /("plugin"\s*:\s*\[)([^\]]*?)(\])/,
          (_match, start, middle, end) => {
            const trimmed = middle.trim();
            if (trimmed === "") {
              return `${start}\n    "${PLUGIN_NAME}"\n  ${end}`;
            }
            return `${start}${middle.trimEnd()},\n    "${PLUGIN_NAME}"\n  ${end}`;
          }
        );
        writeFileSync(configPath, newContent);
      } else {
        const newContent = content.replace(
          /^(\s*\{)/,
          `$1\n  "plugin": ["${PLUGIN_NAME}"],`
        );
        writeFileSync(configPath, newContent);
      }
    } else {
      writeFileSync(configPath, JSON.stringify(config, null, 2));
    }

    console.log(`✓ Added plugin to ${configPath}`);
    return true;
  } catch (err) {
    console.error("✗ Failed to update config:", err);
    return false;
  }
}

function createNewConfig(): boolean {
  const configPath = join(OPENCODE_CONFIG_DIR, "opencode.jsonc");
  mkdirSync(OPENCODE_CONFIG_DIR, { recursive: true });
  
  const config = `{
  "plugin": ["${PLUGIN_NAME}"]
}
`;
  
  writeFileSync(configPath, config);
  console.log(`✓ Created ${configPath}`);
  return true;
}



interface InstallOptions {
  tui: boolean;
}

async function install(options: InstallOptions): Promise<number> {
  console.log("\n🧠 opencode-mem installer\n");

  const rl = options.tui ? createReadline() : null;

  console.log("Step 1: Register plugin in OpenCode config");
  const configPath = findOpencodeConfig();
  
  if (configPath) {
    if (options.tui) {
      const shouldModify = await confirm(rl!, `Add plugin to ${configPath}?`);
      if (!shouldModify) {
        console.log("Skipped.");
      } else {
        addPluginToConfig(configPath);
      }
    } else {
      addPluginToConfig(configPath);
    }
  } else {
    if (options.tui) {
      const shouldCreate = await confirm(rl!, "No OpenCode config found. Create one?");
      if (!shouldCreate) {
        console.log("Skipped.");
      } else {
        createNewConfig();
      }
    } else {
      createNewConfig();
    }
  }

  console.log("\n" + "─".repeat(50));
  console.log("\n✓ Setup complete! Restart OpenCode to activate.\n");
  console.log("The memory system runs locally with no API keys required.");
  console.log("Data is stored in: ~/.opencode-mem/data\n");
  console.log("Optional: Configure custom embedding model in ~/.config/opencode/opencode-mem.jsonc");
  console.log("\n" + "─".repeat(50) + "\n");

  if (rl) rl.close();
  return 0;
}

function printHelp(): void {
  console.log(`
opencode-mem - Local persistent memory for OpenCode agents

Commands:
  install                    Install and configure the plugin
    --no-tui                 Run in non-interactive mode (for LLM agents)

Examples:
  bunx opencode-mem@latest install
  bunx opencode-mem@latest install --no-tui
`);
}

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
  printHelp();
  process.exit(0);
}

if (args[0] === "install") {
  const noTui = args.includes("--no-tui");
  install({ tui: !noTui }).then((code) => process.exit(code));
} else if (args[0] === "setup") {
  console.log("Note: 'setup' is deprecated. Use 'install' instead.\n");
  const noTui = args.includes("--no-tui");
  install({ tui: !noTui }).then((code) => process.exit(code));
} else {
  console.error(`Unknown command: ${args[0]}`);
  printHelp();
  process.exit(1);
}
