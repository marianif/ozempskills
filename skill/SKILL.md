---
name: ozempskills
description: "Internal meta-skill. Never match this from conversation content — it is only ever invoked by the routing rule in CLAUDE.md, right before some other skill X would be invoked. Given a target skill name, resolves that skill's real source file on disk, returns a token-compressed version of its instructions (with frontmatter preserved verbatim) for Claude to follow in place of invoking X directly, caching the result until X's source changes."
argument-hint: "<target-skill-name>"
user-invocable: false
allowed-tools:
  - Read
  - Write(~/.claude/skills/ozempskills/cache/*)
  - Bash(mkdir -p ~/.claude/skills/ozempskills/cache)
  - Bash(shasum *)
  - Bash(cat ~/.claude/settings.json)
  - Bash(cat ~/.claude/plugins/installed_plugins.json)
  - Bash(find ~/.claude/plugins/cache/* -maxdepth 6 -iname SKILL.md)
  - Bash(find ~/.claude/plugins/marketplaces/* -iname SKILL.md)
  - Bash(ls ~/.claude/plugins/cache/*/*/*)
license: Apache-2.0
---

# ozempskills

You are running ozempskills, invoked because CLAUDE.md's routing rule fired before
some other skill X was about to be invoked. Your job: find X's real source file,
produce (or reuse) a compressed version of its instructions, and hand that back for
the calling context to follow **instead of** invoking X via the Skill tool.

Note on paths below: ozempskills itself may be installed anywhere (a plugin cache
directory, a project's `.claude/skills/`, etc.) — but its own compression cache
always lives at the fixed, install-independent location
`~/.claude/skills/ozempskills/cache/`, so cached entries survive ozempskills being
reinstalled or upgraded to a new plugin version directory. Create that directory if
it doesn't exist yet.

## Stop condition — check first

If the target skill name is `ozempskills` itself, or you are already executing this
same procedure (i.e. this is a nested/recursive entry), do not proceed. Say plainly
"ozempskills does not route itself" and stop here.

## Step 1 — Resolve the source file

Search in this order. Stop at the first hit.

1. `<project-root>/.claude/skills/<name>/SKILL.md`
2. `~/.claude/skills/<name>/SKILL.md` (skip if this resolves back to ozempskills
   itself)
3. **Enabled plugins** (the common case — most real skills are plugin-provided,
   not project/user files):
   - Read `~/.claude/settings.json`, get `enabledPlugins`, keep only entries whose
     value is `true`.
   - Read `~/.claude/plugins/installed_plugins.json`, look up each enabled plugin's
     `installPath`. If multiple version directories exist for that plugin, prefer
     the one containing a `.in_use` marker file and no `.orphaned_at` file.
   - Check `<installPath>/skill/SKILL.md` first (single-skill plugin layout), then
     glob `<installPath>/skills/*/SKILL.md` (multi-skill plugin layout), matching
     the `name:` field in each candidate's frontmatter against the target name.
4. **Marketplace fallback**, only if step 3 found nothing: glob
   `~/.claude/plugins/marketplaces/*/**/SKILL.md` matching `name:` against the
   target. If a match is found only here, note in your final output that this copy
   is the source checkout and may not exactly match what's actually active/enabled.
5. **Not found anywhere.** This is a normal, expected outcome — likely the skill is
   built into the Claude Code app bundle at a path that isn't discoverable this way.
   Tell the calling context: "No source file found for `<name>`; invoke it normally
   via the Skill tool." Stop here — do not treat this as an error or retry.

## Step 2 — License check

Compression persists a rewritten copy of the skill's instructional text to a local
cache file. Reading the text on invocation is normal and unavoidable — that's how
skills work — but writing a derivative, cached rewrite of it is a step beyond that,
and not every license permits derivative copies.

Read the source file's `license` field (if present) and decide:

- **Clearly permissive with no unmet conditions** (e.g. plain `MIT`, `Apache-2.0`,
  `BSD-*`, `ISC`) → proceed to Step 3. If the license text names a condition your
  compressed cache entry can't itself carry forward — most commonly a required
  attribution/notice line (e.g. "Apache 2.0, forked from X, see NOTICE.md for
  attribution") — copy that attribution line verbatim into the cache entry's
  `license_basis` field so it travels with the compressed copy, rather than treating
  the permissive base license alone as sufficient.
- **Absent entirely** → treat as unclear, not as permissive by default. Proceed to
  Step 3 but set `license_basis: "absent, assumed permissive by omission"` in the
  cache entry, so this assumption is visible and auditable later rather than silent.
- **Explicitly restrictive, proprietary, or ambiguous** (e.g. `proprietary`,
  `all rights reserved`, `internal`, `license: none`, a custom license whose terms
  you can't confirm permit derivatives, or any license naming a required attribution
  step you cannot carry through into a compressed rewrite) → **do not compress**.
  Tell the calling context: "Skipping compression for `<name>` — its license
  (`<value>`) doesn't clearly permit derivative copies. Invoke it normally via the
  Skill tool." Stop here. Do not cache anything for this skill.

This check runs every time the cached source hash no longer matches the live file
(Step 4 below), not just once — a plugin update could change its license terms
along with its content.

## Step 3 — Cache key

`sha256(<resolved absolute source path>)`, first 16 hex characters, then `__`, then
the skill name, then `.json`. Example: `a1b2c3d4e5f6a7b8__flow.json`. This keeps
same-named skills from different roots (project vs. plugin) or different plugin
versions in separate cache entries, since their resolved paths differ.

Cache entries live in `~/.claude/skills/ozempskills/cache/<key>.json`.

## Step 4 — Check the cache

If a cache entry exists for this key:
- Read the live source file's raw bytes and hash them (`shasum -a 256`).
- Compare to the cache entry's `source_hash`.
- **Match** → use the cached `frontmatter_raw` and (`compressed_body` or, if
  `compression_skipped` is true, the cached verbatim body). Skip to Step 7.
- **Mismatch, or no entry exists** → re-run Step 2's license check against the live
  source before continuing (its license may have changed along with its content),
  then continue to Step 5. (A mismatch is expected and normal — it means the plugin
  updated, e.g. via `autoUpdate`, or the project/user skill file was edited since
  last time.)

## Step 5 — Read and triage the source

Read the full source file. Split it into:
- **Frontmatter**: the YAML block between the `---` fences, verbatim, in original
  order. This is never modified, ever, for any reason.
- **Body**: everything after the closing `---`.

Estimate roughly what fraction of the body consists of fenced code blocks,
file/path references, and `{{template}}` tokens versus actual explanatory prose. If
that fraction is high and the remaining prose is already terse — little redundant
explanation left to cut — set `compression_skipped: true` and use the body verbatim
rather than forcing a compression pass that would save little. (Example: a thin
wrapper skill that's mostly a single tool call has nothing worth compressing.)

## Step 6 — Compress the body (skip if Step 5 marked it skipped)

**Never alter, under any circumstance:**
- The frontmatter block (handled separately, never touched here anyway).
- Fenced code blocks (` ``` `), in full.
- Any relative or absolute file/path reference (e.g. `scripts/foo.mjs`,
  `reference/mobile/audit.md`).
- Any `{{template_var}}` token.
- Tool names as referenced in instructions (`Bash`, `Read`, `Write`, MCP tool
  names).
- Literal quoted strings the skill instructs Claude to say verbatim to the user.
- The count, order, and each distinct action of numbered/ordered procedural steps —
  these may be reworded more tersely but never merged, reordered, or dropped.
- Anything marked as non-negotiable or otherwise emphasized as a hard constraint.
- Conditional file-load instructions (e.g. "if X, load reference/Y.md — required")
  — the trigger condition and the path must both survive, even though the
  referenced file's own content is out of scope for this pass.

**Eligible to cut:** restated rationale, redundant elaboration, and duplicate
examples that illustrate the same rule (keep exactly one clear example per distinct
rule; drop the rest). Do not target a fixed compression ratio — some skills barely
compress, some compress heavily. Stop cutting the moment further cuts would remove
anything that changes behavior or a trigger condition.

Write the result to `~/.claude/skills/ozempskills/cache/<key>.json`:

```json
{
  "cache_format_version": 1,
  "skill_name": "<name>",
  "source_path": "<resolved absolute path>",
  "source_hash": "sha256:<hex>",
  "resolved_via": "project | user | enabled_plugin | marketplace_fallback",
  "generated_at": "<current time if known, else omit>",
  "frontmatter_raw": "<verbatim frontmatter block>",
  "license_basis": "<the license value found, plus 'assumed permissive by omission' if absent>",
  "compressed_body": "<compressed or verbatim body>",
  "compression_skipped": false,
  "skip_reason": null,
  "original_body_chars": <int>,
  "compressed_body_chars": <int>
}
```

## Step 7 — Apply, with the permission-boundary warning

Present the frontmatter (verbatim) and the compressed/cached body as the
instructions to follow for the rest of this task, in place of invoking `<name>` via
the Skill tool.

State this plainly, once, before proceeding: **"Using a compressed instruction set
for `<name>` via ozempskills; the harness did not parse `<name>`'s real
`allowed-tools` frontmatter through this path, so I'm self-restricting to the tool
patterns listed in it for the rest of this task."** Then actually honor that
self-imposed restriction for the remainder of the task — treat that skill's
`allowed-tools` list as a ceiling on your own tool use, the same way the harness
would have enforced it had the skill been invoked directly.

## Notes

- The `cache/` directory is never auto-pruned. It's always safe to delete its
  contents entirely — entries regenerate lazily on next use.
- Discovery's root priority (project > user > plugin) is a reasonable inference,
  not a verified match to Claude Code's internal resolution order. If a project ever
  defines a skill with the same name as an installed plugin's skill, be aware
  ozempskills could serve a different one than the harness would pick on a direct
  `/name` invocation.
