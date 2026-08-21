# Behavioral scenarios

`tests/structure.test.mjs` (`npm test`) checks that the package is well-formed. It
cannot check that ozempskills actually *behaves* correctly when a real Claude Code
instance follows its instructions — that requires a live agent, real installed
skills, and a filesystem to write a real cache to. This file is that other half of
the suite: a fixed set of scenarios with concrete, checkable expected outcomes.

Run these by hand, or hand this file to an agent and ask it to execute each
scenario and report pass/fail per the stated criteria. Each scenario names exactly
what to do and exactly what to check — do not accept "seems to have worked" as a
pass.

Before running any scenario: back up (or note you can safely delete)
`~/.claude/skills/ozempskills/cache/` — scenarios will write real cache files there.

---

## Scenario 1 — Cold compression of a real installed skill

**Setup:** Pick a real plugin skill installed on the machine with a permissive
license and a non-trivial prose body (e.g. `flow`, which is Apache-2.0). Delete any
existing cache entry for it first: `rm -f ~/.claude/skills/ozempskills/cache/*__flow.json`
(adjust the glob to the actual skill name).

**Do:** In a fresh session, cause ozempskills to be invoked with that skill's name
as the target (either by having a CLAUDE.md routing rule in place and triggering an
autonomous match, or by invoking the `ozempskills` skill directly with the name as
argument).

**Check, all must hold:**
- [ ] A new file appears under `~/.claude/skills/ozempskills/cache/` whose name
      matches the documented key scheme (`sha256(...)[:16]__<name>.json`).
- [ ] The file's `frontmatter_raw` field is **byte-for-byte identical** to the real
      source SKILL.md's frontmatter block (diff them directly — do not eyeball).
- [ ] The file's `compressed_body_chars` is smaller than `original_body_chars`
      (unless `compression_skipped` is `true`, in which case they should be equal).
- [ ] Every fenced code block, file path, and `{{template_var}}` token present in
      the source body also appears, unchanged, in `compressed_body`.
- [ ] `resolved_via` correctly reflects where the skill was actually found
      (`enabled_plugin` for a plugin-provided skill).
- [ ] `license_basis` is populated and matches the source's actual `license` field
      (or the "absent, assumed permissive by omission" wording if it had none).
- [ ] Claude's response states, plainly, that it's using a compressed instruction
      set via ozempskills and is self-restricting to the target skill's
      `allowed-tools`.

## Scenario 2 — Warm cache hit (no recompression)

**Setup:** Run Scenario 1 first so a cache entry exists. Note the cache file's
`generated_at` (or its mtime via `ls -la` if that field is absent) and its exact
byte content (`shasum -a 256` the cache file itself).

**Do:** In a **new** session, invoke ozempskills again for the same skill, with the
skill's source file untouched.

**Check:**
- [ ] The cache file's content hash is unchanged after the run (confirms it wasn't
      rewritten).
- [ ] No sign in the transcript of re-reading/re-compressing the full source body —
      the response should reflect the cached compressed text being reused.

## Scenario 3 — Staleness detection on source change

**Setup:** Use the cache entry from Scenario 1/2. Make a small, harmless edit to
the *actual installed* source SKILL.md's body prose (not frontmatter) — e.g. add a
sentence to some explanatory paragraph. (If the skill is a plugin installed from a
marketplace, edit the file directly at its resolved `installPath`; remember what
you changed so you can revert it after.)

**Do:** Invoke ozempskills again for that skill.

**Check:**
- [ ] The cache file is rewritten (content hash differs from before the edit).
- [ ] The new `source_hash` in the cache entry matches a fresh hash of the edited
      source file.
- [ ] Revert your edit to the source file afterward — this scenario intentionally
      mutates a real installed skill's file on disk.

## Scenario 4 — License gate blocks compression

**Setup:** Create a throwaway test skill at `<project>/.claude/skills/no-derivatives-test/SKILL.md`:

```markdown
---
name: no-derivatives-test
description: "Scenario 4 fixture. Not a real skill — delete after testing."
license: "All rights reserved. No derivative works permitted without written consent."
---

This is filler prose that exists only to give the compression step something to
act on if the license gate fails to block it. If you see this exact sentence
inside a cache file under ~/.claude/skills/ozempskills/cache/, the license check
did not work.
```

**Do:** Invoke ozempskills with target name `no-derivatives-test`.

**Check:**
- [ ] No cache file is created for this skill at all.
- [ ] Claude's response explicitly says it's skipping compression because of the
      license, and that it will invoke the skill normally instead.
- [ ] Delete the fixture skill directory afterward.

## Scenario 5 — Not-found skill (app-bundled / undiscoverable)

**Setup:** Pick a skill name known to be built into the Claude Code app bundle
rather than installed as a plugin or project/user skill (on the machine this was
authored on: `dataviz`, `design`, `artifact-design`, and `code-review` were
confirmed undiscoverable via `.claude/skills/`, `~/.claude/skills/`, or any
installed-plugin path — verify this is still true on the machine you're testing on
before relying on it, since app-bundled skill sets can change between versions).

**Do:** Invoke ozempskills with that name as target.

**Check:**
- [ ] Claude reports the skill's source could not be found on disk, as a normal
      outcome, not an error.
- [ ] It states it will invoke the skill normally instead.
- [ ] No cache file is created.
- [ ] The skill still actually works when invoked normally afterward (confirms
      this "not found" path didn't block the real invocation).

## Scenario 6 — Self-routing guard (no infinite recursion)

**Do:** Invoke ozempskills with target name `ozempskills` itself.

**Check:**
- [ ] Claude stops immediately with a message equivalent to "ozempskills does not
      route itself."
- [ ] No cache file is created or read.
- [ ] No second invocation of ozempskills happens as a side effect.

## Scenario 7 — Referenced prose file compression (multi-file skill)

**Setup:** Use a skill with a real conditional file-load instruction and a prose
reference file (e.g. `flow`, which loads mobile/web reference docs based on
detected surface). Delete any existing cache entries for both the skill and its
reference file first.

**Do:** Invoke ozempskills for that skill in a context that will cause the
conditional branch to actually fire (e.g. working in a React Native project, if
that's what triggers the mobile reference load).

**Check:**
- [ ] A cache entry exists for the parent SKILL.md.
- [ ] A **separate** cache entry exists for the referenced file, keyed distinctly
      (per the documented `sha256(path)[:16]__<skill>__<relative-path-slug>.json`
      scheme) — confirm it's not colliding with or overwriting the parent's entry.
- [ ] The referenced file's cache entry's compressed content still contains every
      code block / path / template token from its original.
- [ ] A reference file that the branch did *not* trigger (e.g. the web reference
      doc, if mobile was detected) has **no** cache entry — confirms lazy,
      on-demand compression rather than eager compression of the whole tree.

## Scenario 8 — Project skill shadows a plugin skill of the same name

**Setup:** Pick an installed plugin skill name (e.g. `flow`). Create a minimal
throwaway project-level skill with the same name at
`<project>/.claude/skills/flow/SKILL.md` with clearly different, identifiable
content (e.g. a distinctive marker sentence) and a permissive license.

**Do:** Invoke ozempskills with target name `flow` from within that project.

**Check:**
- [ ] The cache entry's `source_path` points at the **project** skill file, not
      the plugin's installed path (confirms the documented project > user > plugin
      priority order actually holds).
- [ ] `resolved_via` is `"project"`.
- [ ] Delete the throwaway project skill afterward — leaving it in place would
      permanently shadow the real plugin skill for this project.
