## Skill routing through ozempskills

Before invoking any skill X — whether the user typed `/X` explicitly or you are
about to invoke X because its description matches the conversation — first
invoke the `ozempskills` skill with X's name as the argument, and follow
ozempskills's output in place of invoking X directly.

Exceptions — invoke X directly, do NOT route through ozempskills, when:

- X is `ozempskills` itself.
- You are already executing ozempskills's own procedure (never re-enter it from
  inside itself).
- X's name was already routed through ozempskills earlier in this same session —
  check once per skill per session, not on every single invocation of that skill.
- ozempskills already reported "not found" for X earlier this session — invoke X
  normally and don't retry ozempskills for it again this session.
