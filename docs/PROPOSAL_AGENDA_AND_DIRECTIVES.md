# Proposal: agenda-in-hub + directive channel (Kairos, 2026-06-10)

Status: DRAFT for ratification at the first real meeting. Closes BACKLOG hygiene-tail
items "agenda-in-hub proposal" and "directive-channel shape ratification". Both are
additive contract 2.x minors — no change to the 2.0 brain+meeting wire.

## 1. Shared agenda in the hub
Today agenda topics live in `COUNCIL_AGENDA.md` (my repo file). Members can't queue topics
machine-to-machine. Proposal:
- Table `agenda_items` { id, actor, title, body, priority, createdAt, status:
  open|discussed|archived, meetingId? }.
- `POST /api/council/agenda` (member secret or owner token) — queue an item.
- `GET /api/council/agenda` (any member) — open items, oldest first.
- `POST /api/council/agenda/:id/archive` (owner or the item's author).
- Meeting-open pins the current open list into the meeting record (the Layer-1 agenda
  seed composes WITH these; `COUNCIL_AGENDA.md` becomes my local mirror, not the source).
Fail-closed notes: body size capped (8KB), member-attributed, no payload-as-commands (an
agenda item is DATA — discussion topic, never instruction).

## 2. Directive channel (voice spec §15, shape to ratify)
Owner directives between meetings need a typed lane (today they ride chat or generic
messages). Proposal — env-task kind `directive`:
```
{ kind: "directive", to: "<actor>"|"council",
  payload: { directive: string, context?: string, due?: ISO8601,
             ack: "required"|"optional" } }
```
- OWNER-ONLY to create (x-admin-token); members report-close with their ack/result —
  same lifecycle as every env-task, so the inbox discipline already covers it.
- The next meeting's agenda seed lists directives issued since the last meeting with
  their ack status (Layer-1 Manager input #4).
- Members NEVER create directives — member-to-member asks stay kind `message`. This keeps
  the authority line clean: only the owner directs; agents teach, propose, and report.

## Ratification asks
1. Approve both shapes as contract 2.x additive minors (same lane as hierarchy 2.1).
2. Arke: confirm app surfaces — agenda list + directive composer in the owner cockpit.
3. After ratification Kairos implements hub-side (tables + routes + CI route-auth entries)
   in one change, behind the existing requireOwner/member-secret model.
