#!/usr/bin/env node
/** Copy static assets into the standalone build output (Linux/macOS deploy hosts). */
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next/standalone");

if (!existsSync(standalone)) {
  console.warn("[postbuild] .next/standalone not found — skip asset copy");
  process.exit(0);
}

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  cpSync(publicDir, join(standalone, "public"), { recursive: true });
}

const staticDir = join(root, ".next/static");
if (existsSync(staticDir)) {
  cpSync(staticDir, join(standalone, ".next/static"), { recursive: true });
}

console.log("[postbuild] standalone assets copied");
