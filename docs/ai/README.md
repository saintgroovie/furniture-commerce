# AI — как работать с моделями (оглавление)

Канон для оператора и агентов Woodright.

**Machine runtime contract** = `.cursor/rules/*.mdc` (особенно `woodright-core.mdc`).  
**Human docs** объясняют контракт; они **не** второй независимый source of truth.

| Документ | Роль |
|----------|------|
| [`WOODRIGHT_MASTER_RULES.md`](WOODRIGHT_MASTER_RULES.md) | Полный human canon (ChatGPT + оператор): инварианты, UX, git, models, templates |
| [`RESPONSE_FORMAT.md`](RESPONSE_FORMAT.md) | Подробная человеческая FORMAT A/B/C + packet skeleton |
| [`MASTER_PROMPT.md`](MASTER_PROMPT.md) | Системный контекст проекта |
| [`AI_WORKING_RULES.md`](AI_WORKING_RULES.md) | 10 инвариантов + pre-change checklist |
| [`SYSTEM_BOUNDARIES.md`](SYSTEM_BOUNDARIES.md) | Неизменяемые границы (эскалация) |
| [`AI_CONTEXT.md`](AI_CONTEXT.md) | Короткий контекст (не заменяет trio) |

## Cursor rules

**Canonical root:** `/Users/leonidmbp/Documents/projects/furniture-commerce/.cursor/rules/`  
**Thin mirror:** `/Users/leonidmbp/furniture-commerce/.cursor/rules/` — sync only, never edit independently.

### alwaysApply (machine stack — bodies always in context)

- `woodright-core.mdc` — precedence, invariants, Codex table, status fields, nav canon
- `woodright-response-format.mdc` — FORMAT A/B/C + one-click integrity
- `github-access.mdc` — git write / push / PR safety
- `foreground-only-execution.mdc` — foreground / blocked packet order
- `language-preference.mdc` — RU responses
- `operator-location.mdc` — RU / Europe/Moscow
- `dash-typography.mdc` — RU тире только ` - `
- `ux-copywriting.mdc` — точки, отбивки, висячие предлоги (+ pointer на skill)

### task-specific (globs)

- `woodright-model-routing.mdc` — legacy/media executor routing (Codex policy → core)
- `kids-content-separation.mdc` — kids catalog/cart globs

### project skills (`.cursor/skills/`)

Agent playbooks - читать по description/trigger. Не дублируют alwaysApply; углубляют.

- `ru-ux-ui-copywriting/` - полный русский UX/UI копирайтинг (Контур / Ozon / UPROCK + Woodright overlays). Триггер: RU storefront/admin copy, `woodright-copy.ts`, CTA, empty/error, микрокопирайт.
