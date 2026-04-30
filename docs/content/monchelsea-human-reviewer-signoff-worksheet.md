# Monchelsea Human Reviewer Sign-off Worksheet

Monchelsea remains blocked for identity confirmation.  
This worksheet is for human reviewer sign-off only.  
No asset promotion, seed readiness, media readiness, storefront readiness, or rollout stage promotion is allowed from this worksheet alone.

## Scope

- Collection: `monchelsea`
- Total rows in scope: `26`
- Source of truth backlog: `data/normalized/monchelsea-manual-identity-closure-backlog.json`
- Current state: all rows are pending human reviewer sign-off

## Allowed reviewer decision values

- `confirmed`
- `probable`
- `no_match`
- `blocked_by_source_or_workbook_issue`
- `keep_pending`

## Reviewer guidance (mandatory)

- Legacy fuzzy hint by itself is **not** deterministic identity confirmation.
- Disk auto-findings do **not** close `manual_identity_review_needed` rows by themselves.
- If confidence is insufficient, use `keep_pending` or `no_match` instead of `confirmed`/`probable`.
- Cursor is not a reviewer and does not set reviewer decisions.

## Row-by-row reviewer worksheet (26 rows)

| stable_row_key | collection | sku_or_article_code | join_key | product_name | candidate_basis | evidence/search_keys_used | current_status | reviewer_decision | reviewer_name | reviewer_checked_at | reviewer_note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `monchelsea:MNm-05-4` | `monchelsea` | `MNm-05-4` | `MN-05-4` | `Комод с зеркалом` | `legacy_fuzzy_hint_only` | `MN-05-4, MNm-05-4, MNM-05-4, mnm-05-4, Комод с зеркалом` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-15-3` | `monchelsea` | `MNm-15-3` | `MN-15-3` | `Кровать 1,5-сп. (120*190) с подъем мех` | `legacy_fuzzy_hint_only` | `MN-15-3, MNm-15-3, MNM-15-3, mnm-15-3, Кровать 1,5-сп. (120*190) с подъем мех` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-16-3` | `monchelsea` | `MNm-16-3` | `MN-16-3` | `Кровать 1,5-сп. (140*190) с подъем мех` | `legacy_fuzzy_hint_only` | `MN-16-3, MNm-16-3, MNM-16-3, mnm-16-3, Кровать 1,5-сп. (140*190) с подъем мех` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-14-1` | `monchelsea` | `MNm-14-1` | `MN-14-1` | `Кровать 1-сп. (90*190)` | `legacy_fuzzy_hint_only` | `MN-14-1, MNm-14-1, MNM-14-1, mnm-14-1, Кровать 1-сп. (90*190)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-14-2` | `monchelsea` | `MNm-14-2` | `MN-14-2` | `Кровать 1-сп. (90*190) без изножья` | `legacy_fuzzy_hint_only` | `MN-14-2, MNm-14-2, MNM-14-2, mnm-14-2, Кровать 1-сп. (90*190) без изножья` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-14-3` | `monchelsea` | `MNm-14-3` | `MN-14-3` | `Кровать 1-сп.(90*190)с подъем мех` | `legacy_fuzzy_hint_only` | `MN-14-3, MNm-14-3, MNM-14-3, mnm-14-3, Кровать 1-сп.(90*190)с подъем мех` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-17-2` | `monchelsea` | `MNm-17-2` | `MN-17-2` | `Кровать 2-сп. (160*200) без изножья` | `legacy_fuzzy_hint_only` | `MN-17-2, MNm-17-2, MNM-17-2, mnm-17-2, Кровать 2-сп. (160*200) без изножья` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-17-3` | `monchelsea` | `MNm-17-3` | `MN-17-3` | `Кровать 2-сп. (160*200) с подъем мех` | `legacy_fuzzy_hint_only` | `MN-17-3, MNm-17-3, MNM-17-3, mnm-17-3, Кровать 2-сп. (160*200) с подъем мех` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-18-2` | `monchelsea` | `MNm-18-2` | `MN-18-2` | `Кровать 2-сп. (180*200) без изножья` | `legacy_fuzzy_hint_only` | `MN-18-2, MNm-18-2, MNM-18-2, mnm-18-2, Кровать 2-сп. (180*200) без изножья` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-18-3` | `monchelsea` | `MNm-18-3` | `MN-18-3` | `Кровать 2-сп. (180*200) с подъем мех` | `legacy_fuzzy_hint_only` | `MN-18-3, MNm-18-3, MNM-18-3, mnm-18-3, Кровать 2-сп. (180*200) с подъем мех` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-65-1` | `monchelsea` | `MNm-65-1` | `MN-65-1` | `Стол письменный 1-тумб. 0П` | `legacy_fuzzy_hint_only` | `MN-65-1, MNm-65-1, MNM-65-1, mnm-65-1, Стол письменный 1-тумб. 0П` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-66-1` | `monchelsea` | `MNm-66-1` | `MN-66-1` | `Стол письменный 2-тумб. ПП` | `legacy_fuzzy_hint_only` | `MN-66-1, MNm-66-1, MNM-66-1, mnm-66-1, Стол письменный 2-тумб. ПП` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-66-2` | `monchelsea` | `MNm-66-2` | `MN-66-2` | `Стол письменный 2-тумб. ПЯ` | `legacy_fuzzy_hint_only` | `MN-66-2, MNm-66-2, MNM-66-2, mnm-66-2, Стол письменный 2-тумб. ПЯ` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-66-4` | `monchelsea` | `MNm-66-4` | `MN-66-4` | `Стол письменный 2-тумб. ЯЯ` | `legacy_fuzzy_hint_only` | `MN-66-4, MNm-66-4, MNM-66-4, mnm-66-4, Стол письменный 2-тумб. ЯЯ` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-1` | `monchelsea` | `MNm-01-1` | `MN-01-1` | `Шкаф для одежды 1-дв. (модуль/Ш/ручка слева)` | `legacy_fuzzy_hint_only` | `MN-01-1, MNm-01-1, MNM-01-1, mnm-01-1, Шкаф для одежды 1-дв. (модуль/Ш/ручка слева)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-2` | `monchelsea` | `MNm-01-2` | `MN-01-2` | `Шкаф для одежды 1-дв. (модуль/Ш/ручка справа)` | `legacy_fuzzy_hint_only` | `MN-01-2, MNm-01-2, MNM-01-2, mnm-01-2, Шкаф для одежды 1-дв. (модуль/Ш/ручка справа)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-5` | `monchelsea` | `MNm-01-5` | `MN-01-5` | `Шкаф для одежды 1-дв. (модуль/ЯП/ручка слева)` | `legacy_fuzzy_hint_only` | `MN-01-5, MNm-01-5, MNM-01-5, mnm-01-5, Шкаф для одежды 1-дв. (модуль/ЯП/ручка слева)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-6` | `monchelsea` | `MNm-01-6` | `MN-01-6` | `Шкаф для одежды 1-дв. (модуль/ЯП/ручка справа)` | `legacy_fuzzy_hint_only` | `MN-01-6, MNm-01-6, MNM-01-6, mnm-01-6, Шкаф для одежды 1-дв. (модуль/ЯП/ручка справа)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-3` | `monchelsea` | `MNm-01-3` | `MN-01-3` | `Шкаф для одежды 1-дв. (модуль/ЯШ/ручка слева)` | `legacy_fuzzy_hint_only` | `MN-01-3, MNm-01-3, MNM-01-3, mnm-01-3, Шкаф для одежды 1-дв. (модуль/ЯШ/ручка слева)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-01-4` | `monchelsea` | `MNm-01-4` | `MN-01-4` | `Шкаф для одежды 1-дв. (модуль/ЯШ/ручка справа)` | `legacy_fuzzy_hint_only` | `MN-01-4, MNm-01-4, MNM-01-4, mnm-01-4, Шкаф для одежды 1-дв. (модуль/ЯШ/ручка справа)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-02-3` | `monchelsea` | `MNm-02-3` | `MN-02-3` | `Шкаф для одежды 2-дв. (модуль/ЯП)` | `legacy_fuzzy_hint_only` | `MN-02-3, MNm-02-3, MNM-02-3, mnm-02-3, Шкаф для одежды 2-дв. (модуль/ЯП)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-03-4` | `monchelsea` | `MNm-03-4` | `MN-03-4` | `Шкаф для одежды 3-дв. (модуль/2Ш+ЯП+Ш)` | `legacy_fuzzy_hint_only` | `MN-03-4, MNm-03-4, MNM-03-4, mnm-03-4, Шкаф для одежды 3-дв. (модуль/2Ш+ЯП+Ш)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-00-1` | `monchelsea` | `MNm-00-1` | `MN-00-1` | `Шкаф для одежды угловой (модуль/ручка слева)` | `legacy_fuzzy_hint_only` | `MN-00-1, MNm-00-1, MNM-00-1, mnm-00-1, Шкаф для одежды угловой (модуль/ручка слева)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-00-2` | `monchelsea` | `MNm-00-2` | `MN-00-2` | `Шкаф для одежды угловой (модуль/ручка справа)` | `legacy_fuzzy_hint_only` | `MN-00-2, MNm-00-2, MNM-00-2, mnm-00-2, Шкаф для одежды угловой (модуль/ручка справа)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-61-2` | `monchelsea` | `MNm-61-2` | `MN-61-2` | `Шкаф книжный 1-дв. (модуль/ручка слева)` | `legacy_fuzzy_hint_only` | `MN-61-2, MNm-61-2, MNM-61-2, mnm-61-2, Шкаф книжный 1-дв. (модуль/ручка слева)` | `pending reviewer sign-off` |  |  |  |  |
| `monchelsea:MNm-61-4` | `monchelsea` | `MNm-61-4` | `MN-61-4` | `Шкаф книжный 3-дв. (модуль)` | `legacy_fuzzy_hint_only` | `MN-61-4, MNm-61-4, MNM-61-4, mnm-61-4, Шкаф книжный 3-дв. (модуль)` | `pending reviewer sign-off` |  |  |  |  |

## Per-row verification reminder

For each row, reviewer checks whether white-background files deterministically map to SKU/article using code/path/name consistency and product identity match.

## What this worksheet does not authorize

- No backlog auto-close by Cursor.
- No production asset assignment.
- No seed/ingestion/storefront actions.
- No rollout stage/verdict promotion.
