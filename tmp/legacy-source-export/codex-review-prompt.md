# Codex CLI Review Prompt — Legacy Media Census Toolkit (dry-run scope)

Ты — независимый security/scope reviewer. Проверь toolkit для будущего legacy media census в repo Woodright. Сам экспорт ещё не выполнялся; на этом этапе допустимы только: операторский чеклист, шаблон отчёта, README и скрипты (1 рабочая инвентаризация + 3 guarded skeletons).

## Scope review

Файлы (и только они):

- `tmp/legacy-source-export/legacy-readonly-export-operator-checklist.md`
- `tmp/legacy-source-export/legacy-source-export-report.md`
- `tmp/legacy-source-export/codex-review-prompt.md` (этот файл)
- `tools/legacy-media-census/README.md`
- `tools/legacy-media-census/scan-files.mjs`
- `tools/legacy-media-census/build-media-census.mjs`
- `tools/legacy-media-census/build-product-census.mjs`
- `tools/legacy-media-census/build-url-map.mjs`
- `.gitignore` (только если менялся — diff должен быть минимальным)

## Чеклист проверки

### Секреты и приватные артефакты

- [ ] no secrets: ни в одном файле нет реальных паролей;
- [ ] no credentials: нет логинов/паролей hosting/DB/admin (шаблоны с плейсхолдерами `<DB_HOST>` допустимы);
- [ ] no cookies, no sessions, no tokens;
- [ ] no private keys (`BEGIN RSA`, `PRIVATE KEY`);
- [ ] no DB URLs с credentials (`mysql://user:pass@`, `postgres://user:pass@`);
- [ ] no raw dumps in repo (`*.sql`, `*.sql.gz`, `*.dump`);
- [ ] no archive files in repo (`*.zip`, `*.tar*`, `*.7z`);
- [ ] no media files из legacy-экспорта в repo;
- [ ] no screenshots with access data.

### Поведение скриптов

- [ ] no network calls: нет `fetch(`, `axios`, `got(`, `undici`, `node:http(s)`, `net`, `dgram`;
- [ ] no DB connections: нет `mysql`, `pg`, `sequelize`, `prisma`, `mongoose`; дампы читаются только как локальный текст;
- [ ] no `child_process`;
- [ ] разрешённые imports только: `node:fs`, `node:path`, `node:crypto`, `node:process`;
- [ ] скрипты читают ТОЛЬКО private export root `raw/`:
      `/Users/leonidmbp/Documents/woodright-legacy-private-export/YYYY-MM-DD/raw/`;
- [ ] скрипты пишут ТОЛЬКО в `census/` того же export root; в repo — ничего;
- [ ] path guard: `--date` валидируется, path traversal отклоняется;
- [ ] skeleton-скрипты (build-*) завершаются exit code 2 с меткой `SKELETON_NOT_IMPLEMENTED` и не притворяются успешным census;
- [ ] scan-files обрабатывает symlinks безопасно: не следует за ними, пишет `skipped=true, skip_reason=symlink`.

### Запретные операции (не должно быть даже следов)

- [ ] no legacy prod access: логин в админки, живые подключения к legacy-сайтам;
- [ ] no DNS / Cloudflare / nic.ru changes; no robots.txt / sitemap / .htaccess changes;
- [ ] no payment / mail / sales / CarrotQuest / analytics access;
- [ ] no Medusa seed / apply / publish / product-media apply — ни вызовов, ни инструкций «применить автоматически».

### Схемы и правила

- [ ] CSV schemas включают `evidence`, `candidate_confidence`/`confidence`, `needs_operator_review`;
- [ ] confidence scale консервативна (0.9 DB relation … 0.0 unknown), `< 0.8` → operator review;
- [ ] fuzzy-only matches никогда не auto-apply;
- [ ] filename hints (article code в имени файла) не трактуются как evidence уровня 1.0.

### Git-гигиена

- [ ] `git status` не содержит staged-изменений от этой задачи;
- [ ] нет unrelated changes, внесённых этой задачей (repo может иметь свой pre-existing dirty tree — его не трогали);
- [ ] `.gitignore` diff (если есть) минимален и не ломает существующие правила.

## Формат ответа

Выдай verdict строго одним из:

- `safe_to_keep` — всё чисто, замечаний нет или только P3;
- `needs_changes` — перечисли findings по приоритетам P1 (блокирует) / P2 (важно) / P3 (желательно), каждый с файлом и строкой;
- `blocked` — найдены реальные секреты / private artifacts / запрещённые операции; перечисли что именно.

Плюс краткое обоснование (3–10 строк) и список проверенных файлов.
