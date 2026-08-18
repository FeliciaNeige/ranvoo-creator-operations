# Routing and Feishu data

## UGC collaboration

- `💸💸💸【Collab Invitation】: Paid UGC Collab with RANVOO`
- `Felicia from WLIVE — Would Love to Work Together Again`

## Dental professional collaboration

- `【RANVOO Collab】Next-gen Electric Toothbrush`

## Commercial creator collaboration

- `💸💸💸【Collab Invitation】: Paid Instagram Collab with RANVOO`
- `💸💸💸【Collab Invitation】: Helping Moms Make Self-Care Easier 🤍`
- `💸💸💸【Collab Invitation】: A Better Oral Care Experience During Pregnancy`
- `【Collab Invitation】: Empowering Moms with Better Oral Care`

Normalize whitespace, case, reply prefixes, and minor punctuation. If the title is unmatched, use sender, product, platform, deliverables, pricing language, role, and earlier messages. Keep uncertain threads Unclassified.

## Record matching

1. Exact email address.
2. Exact handle or profile URL.
3. Exact creator or clinic name plus platform.

If multiple records match, do not update until the user chooses.

### Dual-table status priority

- UGC: `UGC👖` → preferred `UGC合作`.
- Commercial creator: `牙刷红人👖` → preferred `🪥合作红人（26年4月后`.
- Dental professional: `专业人员👖` → preferred `🪥牙医合作`.

Search both tables by the same normalized creator email. If the email exists in both, use the preferred collaboration table's `合作进度` as the current status. Any approved progress or date update must write only to that preferred collaboration-table record; never modify the source-table record. If the preferred table has no matching email, fall back to the source-table record. Duplicate matches inside the selected table still require manual resolution before writing.

Discover the live schema before editing. Typical fields include stage, 更新日期, last inbound/outbound date, follow-up count, next action, due date, platform, deliverables, price, contract, logistics, Brief, content, posting, payment, and concise factual notes.

Whenever stage/current progress changes, set `更新日期` to the current date in Asia/Shanghai. Do not refresh it for read-only review or an unchanged progress value.

## Stage-triggered target-table transfer

- `UGC👖` → `UGC合作` after the UGC collaboration is explicitly agreed.
- `牙刷红人👖` → `🪥合作红人（26年4月后` after the commercial creator collaboration is explicitly agreed.
- `专业人员👖` → `🪥牙医合作` after the professional explicitly agrees to the product trial/evaluation.

Interest or an unanswered proposal is not enough. Before creating, search the target by exact contact/email and then exact Handle/profile link. One match means update that record; multiple matches require user selection; no match means propose one new record.

Copy only fields that exist in the target: Handle/channel name, profile link, contact/email, platform, creator/professional type, country, agreed content, collaboration date, collaboration progress, Brief status, concise notes, and 更新日期 when available. Never remove the source record.

Show the source record, trigger evidence, target record or new-record status, duplicate-check result, and all copied fields before confirmation.

`已合作牙医资料` is a separate post-collaboration professional archive and is not written by the product-trial trigger.
