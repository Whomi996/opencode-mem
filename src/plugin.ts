#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { OpenCodeMemPlugin } = await import("./index.js");
export { OpenCodeMemPlugin };
export default OpenCodeMemPlugin;
