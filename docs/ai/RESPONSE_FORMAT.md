# RESPONSE_FORMAT — человеческая спецификация ответов

**Machine runtime contract (short):** `.cursor/rules/woodright-core.mdc` + alwaysApply `woodright-response-format.mdc` + `github-access.mdc` + `foreground-only-execution.mdc`  
**Human examples:** this file — **not** a second independent source of truth.

Аудитория: UX/UI-оператор. Русский язык; paths/commands/API без перевода.

---

## Precedence (полный текст только в core)

1. Явная инструкция пользователя, включая схему ответа  
2. Security / secrets / data / git hard bans  
3. Accepted architecture & product invariants  
4. Task-specific rule  
5. Default FORMAT policy  
6. Human docs & current implementation  

Explicit user schema побеждает FORMAT A/B/C, но не отменяет честный статус, validation, changed files, git/push/PR, blockers, Codex when required.

---

## Decision tree

| Режим | Когда |
|-------|--------|
| **User schema** | Пользователь задал точные секции / JSON / table |
| **FORMAT A** | Финальный handoff: implement, smoke, large audit, remediation, Media Ops, evidence, blocked-after-start, high-blast |
| **FORMAT B** | Явно: только prompt / короткий ответ без packet |
| **FORMAT C** | Факт, порт/путь/команда, mid-task, уточнение, без правок/evidence/handoff |

Mid-task → C. Final after work → A (если не B/user schema). Не выдавать C как финальный handoff. Не `done` без обязательной validation.

---

## Именованные поля статуса

| Поле | Значения |
|------|----------|
| **Task status** | `done` \| `partial` \| `blocked` \| `failed` \| `read-only` |
| **Codex commit gate** / **Codex review verdict** | `safe_to_commit` \| `needs_fixes` \| `unsafe_scope` (или domain trio по запросу) |
| **Codex reviewer status** | `approve` \| `approve-with-notes` \| `request-changes` \| `not run` \| `pending` |

`pending` — Codex обязателен следующим шагом и ещё не стартовал; не смешивать с Task status / gate.  
Не писать одно голое `Verdict` для всех трёх смыслов.

---

## FORMAT A — скелет

Подводка (одна строка) + **ровно один** внешний copy block — весь handoff в одном one-click Copy окне.

### One-click copy и целостность markdown

Полный контракт: `.cursor/rules/woodright-response-format.mdc`.

- Один packet = один внешний fence; Copy захватывает целиком.
- Рекомендуемый внешний fence: `~~~~markdown` … `~~~~` (четыре тильды) — внутри допустимы обычные ` ``` `.
- Внешний delimiter должен быть длиннее внутренних; одинаковый closing fence запрещён.
- Не дробить packet на несколько copy windows; не писать обязательные секции после закрытия.
- Preflight: один outer block, сбалансированные fences, бюджет ≈ 80–120 строк (больше — только если нужен evidence).
- Длинные логи → path / короткий excerpt.

### Скелет (в чате — outer `~~~~markdown`)

~~~~markdown
# Woodright report packet

## Human summary
### Task status
done | partial | blocked | failed | read-only

## Что это значит по-человечески
…

## Scope
…

## Changed files
…

## Validation
…

## Evidence
…

## Codex CLI reviewer
- Codex reviewer status: …
- Codex commit gate / Codex review verdict: … (если запускался)
- Artifact / findings / follow-up

## Git status
### GitHub push
### GitHub PR
## Что осталось
…
~~~~

### Blocked / failed order

См. `foreground-only-execution.mdc`: Task status blocked|failed → started → stopped → confirmed → not confirmed → files → validation → Codex → Git status → push → PR → recovery.  
`GitHub push` **не** внутри Human summary.

### Бюджет

Human summary коротко; logs 3–10 строк или path; packet обычно ≤ ~80–120 строк (чтобы оставался одним Copy-блоком).

---

## FORMAT B / C

- **B:** один copy-ready prompt fence; без полного packet.  
- **C:** 1–5 предложений; без packet.

---

## Codex

Единственная decision table: `woodright-core.mdc`.  
Если Codex обязателен и не запускался → Task status `partial` или `blocked`, не commit-ready `done`.

---

## GitHub push / PR

- Нет push: `GitHub push: not performed` / `not applicable; no commit was created`  
- Был push: отдельные строки push + `GitHub PR: created|updated|not created — reason`  
- PR обязателен для review/merge flow на feature branch (`github-access.mdc`), не для любого incidental push.

---

## Dual-root

Canonical: `/Users/leonidmbp/Documents/projects/furniture-commerce`  
Mirror: `/Users/leonidmbp/furniture-commerce`  
Edit canonical only; sync + hash check; canonical wins.
