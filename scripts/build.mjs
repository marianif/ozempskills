#!/usr/bin/env node

/**
 * Build system for ozempskills.
 *
 * ozempskills' skill/SKILL.md has no {{template}} vars and no provider-specific
 * frontmatter fields to strip (Claude Code and Cursor both support the full
 * field set it uses: allowed-tools, user-invocable, argument-hint, license).
 * So "building" for each provider is currently just a verbatim copy to that
 * provider's skills/ convention. If a provider needs real transformation later
 * (dropped fields, resolved template vars), add it here per-provider rather
 * than adding a generic transformer factory nothing yet needs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT_DIR, 'skill');

const PROVIDERS = {
  'claude-code': { configDir: '.claude', displayName: 'Claude Code' },
  cursor: { configDir: '.cursor', displayName: 'Cursor' },
};

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function build() {
  console.log('Building ozempskills for all providers...\n');

  for (const [key, config] of Object.entries(PROVIDERS)) {
    const skillDest = path.join(ROOT_DIR, config.configDir, 'skills', 'ozempskills');
    if (fs.existsSync(skillDest)) fs.rmSync(skillDest, { recursive: true });
    copyDirSync(SOURCE_DIR, skillDest);
    console.log(`  ${config.displayName} -> ${path.relative(ROOT_DIR, skillDest)}/`);
  }

  console.log('\nBuild complete.');
}

build();
