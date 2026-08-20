# ozempskills

A meta-skill for Claude Code that makes other skills cheaper to use, every time
after the first.

## The problem

Skills are markdown files loaded in full, every time they're invoked — whether you
type `/<skill-name>` explicitly or Claude decides autonomously that a skill's description
matches what you're asking for. Some skills are large (hundreds of lines of
frontmatter and prose). If you use the same skill across many sessions, you pay
that same loading cost, in full, every single time.

## What ozempskills does

Before another skill `X` is invoked, ozempskills runs first:

1. Finds `X`'s real source file on disk (project `.claude/skills/`, user-level
   `~/.claude/skills/`, or an installed plugin — resolved the same way Claude Code
   itself resolves it).
2. Checks whether a compressed version is already cached and still matches the
   current source (via a content hash).
3. Checks `X`'s license before doing anything else with the source. Reading a
   skill's text on invocation is normal and unavoidable — that's how skills work —
   but persisting a rewritten, compressed copy to a cache file is a step beyond
   that. If the license is explicitly restrictive, proprietary, or ambiguous,
   ozempskills refuses to compress and falls back to invoking `X` normally. A
   license naming a required attribution/notice condition gets that condition
   carried forward into the cache entry rather than dropped.
4. If not cached yet, or the source changed: compresses `X`'s instructional body —
   cutting redundant prose and restated rationale — while leaving frontmatter,
   `allowed-tools`, file paths, template variables, code blocks, and the order/count
   of procedural steps untouched, byte-for-byte. These are structurally load-bearing
   and never touched, so compression can't silently break a skill's permissions or
   behavior.
5. Hands back the compressed version for Claude to follow instead of `X`'s full
   original.

A short standing instruction in `CLAUDE.md` is what makes this happen automatically
— it steers Claude's own tool-choice reasoning to check ozempskills first, for both
explicit `/X` invocations and autonomous skill matching.

## Why not just ask Claude to compress it yourself?

You can, and for a single one-off use in one session, that's simpler than
installing anything. ozempskills earns its keep specifically for skills you come
back to across sessions:

- **Persistence.** Ad hoc compression lives only in that conversation and
  evaporates when the session ends. Next session, you pay the full compression
  cost again. ozempskills writes the result to a cache file, so you compress a
  given skill once and every later invocation — in any session, any project — just
  reads the cached version.
- **A consistent, codified safety boundary.** "Compress it" done freehand risks a
  less careful pass mangling an `allowed-tools` line or dropping a trigger
  condition it judged "redundant." ozempskills' rules for what's never touched vs.
  eligible to cut are fixed and applied the same way on every run, not
  reinvented in the moment.
- **Automatic staleness handling.** Cache entries are keyed to a hash of the
  source file. If the skill updates (a plugin version bump, an edited project
  skill), the next invocation detects the mismatch and regenerates — no manual
  bookkeeping about whether your compressed copy is still accurate.
- **A stable thing to route to.** The trick that makes any of this automatic is a
  standing `CLAUDE.md` instruction that redirects skill invocations through
  ozempskills. That instruction needs a durable, named target to point at — "ask
  Claude to compress it" isn't routable; a real installed skill is.
- **A license check that actually runs, every time.** Persisting a compressed
  rewrite to disk is a step beyond just reading a skill's text at invocation —
  some licenses don't clearly permit that. ozempskills checks the source's license
  before ever writing a cache entry, skips compression for anything restrictive or
  ambiguous, and carries forward any required attribution rather than dropping it.
  A freehand "just compress it" ask has no reason to remember to check this at all,
  let alone every time the source changes.

The tradeoff worth knowing: because ozempskills fully substitutes for invoking `X`
directly, the harness never parses `X`'s real `allowed-tools` frontmatter through
this path. ozempskills copies that frontmatter into the cache verbatim and
self-restricts to it as a matter of instruction, but that's model-followed, not
harness-enforced. Stated once per use, out loud, in ozempskills' own output —
never a silent trade.

## Install

This repo is a Claude Code plugin, structured like any other:

```
skill/SKILL.md              # the meta-skill itself
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
```

Add it as a plugin (or place `skill/` under `.claude/skills/ozempskills/` for a
manual project/user-level install), then add the routing instruction to your
`CLAUDE.md`:

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

Compressed cache entries live at `~/.claude/skills/ozempskills/cache/` regardless
of where ozempskills itself is installed. Deleting that directory's contents is
always safe — entries regenerate lazily on next use.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).
