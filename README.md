# 💉 ozempskills

> **Trim the fat from your Claude Code context window.**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Claude Code Plugin Ready](https://img.shields.io/badge/Claude_Code-Plugin_Ready-blueviolet)](#-quick-start)
[![Skills](https://img.shields.io/badge/Skills-Optimized-0e7a6e)](#how-it-compresses)

**Claude Code skill compression for `SKILL.md` — reduce prompt tokens and optimize your context window without losing steps.**

`ozempskills` is a skill for Claude Code that routes other skill invocations through a token-compressing cache. Before another skill `X` runs, it resolves `X`'s real source file, compresses the instructional body (cutting redundant prose while preserving execution logic), and caches the result — so every repeat invocation costs fewer tokens.

_Keywords: Claude Code skill compression, reduce prompt tokens in SKILL.md, context window optimization for LLM agents, Anthropic Claude skill optimizer._

---

## Why this exists

Skills are markdown files loaded in full every time they're invoked — whether you type `/<skill-name>` or Claude matches a skill's description autonomously. Large skills cost the same tokens on the 1st and the 50th invocation.

`ozempskills` pays the compression cost **once**, then serves the cached, slimmed version everywhere.

### Example savings (illustrative)

| Metric         | Raw `SKILL.md` | `ozempskills` Cached | Difference     |
| -------------- | -------------- | -------------------- | -------------- |
| Token count    | ~1,420         | ~680                 | **~52% fewer** |
| Lines          | 115            | 42                   | **~63% fewer** |
| Steps executed | 5/5            | 5/5                  | **identical**  |

> Example from a prose-heavy skill. Actual savings vary by skill — wrapper skills with little prose compress barely at all, prose-heavy skills compress heavily. The step count, order, and behavior never change.

### How it compresses

```markdown
<!-- BEFORE: verbose prose in SKILL.md -->

When you are attempting to review a pull request, you should make sure that you
check every line carefully for any TypeScript typing errors, and then write a
summary of what you found...

<!-- AFTER: ozempskills cached (prose slimmed, structure untouched) -->

- PR Review: Audit TypeScript typing errors per line. Output concise summary.
```

Frontmatter, `allowed-tools`, file paths, `{{template}}` tokens, code blocks, and the count/order of procedural steps are **never touched, byte-for-byte** — only restated rationale and duplicate examples are cut.

---

## ⚡ Quick Start

### 1. Install as a Claude Code plugin

```bash
/plugin marketplace add marianif/ozempskills
/plugin install ozempskills@ozempskills
```

Or manual install: place `skill/` under `.claude/skills/ozempskills/` (project or `~/.claude/skills/`).

### 2. Add the routing instruction to `CLAUDE.md`

This is what makes compression automatic for both `/X` and autonomous skill matching:

```markdown
## Skill routing through ozempskills

Before invoking any skill X via the Skill tool — whether the user typed `/X`
explicitly or you are about to invoke X because its description matches the
conversation — first invoke the `ozempskills` skill with X's name as the argument,
and follow ozempskills's output in place of invoking X directly.

Exceptions — invoke X directly via the Skill tool, do NOT route through
ozempskills, when:

- X is `ozempskills` itself.
- You are already executing ozempskills's own procedure (never re-enter it from
  inside itself).
- X's name was already routed through ozempskills earlier in this same session —
  check once per skill per session, not on every single invocation of that skill.
- ozempskills already reported "not found" for X earlier this session — invoke X
  normally and don't retry ozempskills for it again this session.
```

Cache lives at `~/.claude/skills/ozempskills/cache/` regardless of install location. Deleting that directory is always safe — entries regenerate lazily on next use.

---

## What ozempskills does (step by step)

1. **Resolves `X`'s real source file** — checks `project .claude/skills/`, then `~/.claude/skills/`, then enabled plugins (via `~/.claude/settings.json` + `installed_plugins.json`), then marketplace fallback. Same priority Claude Code itself uses.
2. **License gate** — before caching a rewritten copy, checks `X`'s `license` field. Restrictive/proprietary/ambiguous → refuses and falls back to normal invocation. Attribution requirements are carried forward into the cache entry.
3. **Cache check** — `sha256(absolute path)[:16]__<name>.json` keyed to content hash. Hit → reuse. Miss/stale → re-check license and regenerate.
4. **Triage & compress** — splits frontmatter (verbatim, never modified) from body. If the body is mostly code/paths/tokens with little prose, skips compression. Otherwise cuts only redundant prose while preserving all load-bearing content (see never-alter list in [`skill/SKILL.md`](./skill/SKILL.md#step-6--compress-the-body-skip-if-step-5-marked-it-skipped)).
5. **Referenced prose files** — when `SKILL.md` conditionally loads `reference/*.md` or `agents/*.md` during a task, that file is compressed the same way, under the same license/cache rules. Scripts and executables are **never** touched.
6. **Apply with permission boundary** — returns the compressed instructions and self-restricts to `X`'s original `allowed-tools` for the task. Stated once per use, never silent.

Full procedure: [`skill/SKILL.md`](./skill/SKILL.md)

## Why not just ask Claude to compress it yourself?

For a one-off in one session, asking directly is simpler. `ozempskills` earns its keep for skills you reuse across sessions:

- **Persistence.** Ad hoc compression evaporates when the session ends. `ozempskills` writes to a cache file — compress once, reuse in any session/project.
- **Consistent safety boundary.** Fixed never-alter rules (frontmatter, code blocks, paths, `{{tokens}}`, step count/order, tool names) applied identically every run — not reinvented freehand.
- **Automatic staleness handling.** Entries are keyed to a hash of the source. Plugin bump or edited file → detected and regenerated, no manual bookkeeping.
- **A stable routing target.** `CLAUDE.md` needs a durable skill name to redirect to — "just compress it" isn't routable.
- **License check every time.** Persisting a derivative copy is a step beyond reading. `ozempskills` checks on every cache miss and carries attribution forward.

**Tradeoff:** the harness never parses `X`'s real `allowed-tools` through this path. `ozempskills` copies that frontmatter verbatim and self-restricts as instruction — model-followed, not harness-enforced. Stated out loud on each use.

---

## Repository layout

```
skill/SKILL.md              # the meta-skill itself
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
tests/structure.test.mjs    # static well-formedness checks
tests/SCENARIOS.md          # behavioral runbook (requires live agent)
```

## Testing

- `npm test` runs `tests/structure.test.mjs` — deterministic checks: frontmatter parses, `plugin.json`/`marketplace.json` agree, every numbered step exists, never-alter list names load-bearing exclusions, cache-entry schema stays in sync.
- `tests/SCENARIOS.md` — behavioral scenarios (cold compression, warm hit, staleness, license gate, not-found fallback, self-routing guard, referenced-file compression, project-shadows-plugin resolution) with pass/fail criteria. Requires a live agent + real installed skills, so documented as a runbook, not automated.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
