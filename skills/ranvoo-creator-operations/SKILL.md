---
name: ranvoo-creator-operations
description: Operate RANVOO creator collaborations across Feishu Mail, Feishu multidimensional tables, and company messaging libraries. Use when reviewing creator threads, routing UGC, dental-professional, or commercial-influencer collaborations, determining stages, building daily follow-up queues, drafting contextual replies, or—only after explicit confirmation—sending replies and synchronizing approved table updates.
---

# RANVOO Creator Operations

Turn creator emails and records into a confirmation-gated workflow:

`read inbox → classify → match record → infer stage → recommend → preview → confirm → execute → verify`

Read:

- `references/workflow-and-priorities.md` for timing, stages, and execution.
- `references/routing-and-data.md` for subject routing and record matching.
- `references/message-library.md` before selecting or drafting any message.

## Daily workflow

1. Read relevant threads and table records without changing them.
2. Inspect the latest meaningful exchange; never classify from the subject alone.
3. Match by exact email, then profile/handle, then name plus platform.
4. Determine the current stage and next responsible party.
5. Calculate silence and deadline timing.
6. Return a queue ordered: Blocking, Due Today, Follow-up Due, Monitor, Termination Candidate.
7. Draft only for creators selected by the user unless asked for all.
8. Show an execution preview and wait for explicit confirmation.
9. If an approved action changes `合作进度` (or the equivalent current-stage field), include `更新日期` in the same preview and set it to the current date in Asia/Shanghai. Do not change `更新日期` for read-only review or unchanged progress.
10. Re-check the thread and record, execute only approved changes, then verify.

## Confirmation gate

Before sending or writing, show:

- creator and email thread;
- category and matched record;
- final subject and body;
- each table field with old and new values;
- the `更新日期` old/new value whenever collaboration progress will change;
- uncertainty or unmatched information.

Never send, edit, create, or terminate from ambiguous approval. Material changes require a new preview.
