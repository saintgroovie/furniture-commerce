# Legacy Media Assignment Board v2 — dev runtime

Короткий runbook для оператора и Cursor: один trusted URL, без путаницы с Docker и stale Next.

## Canonical environment

| Item | Value |
|------|--------|
| Repo | `/Users/leonidmbp/Documents/projects/furniture-commerce-emergency-fix` |
| Branch | `fix/legacy-board-role-source-flow` |
| Board route | `/qa/legacy-media-assignment-board-v2` |
| **Trusted URL** | `http://localhost:3002/qa/legacy-media-assignment-board-v2` |
| Required header badge | `v2 build: gallery-170-reorder` |
| DOM marker (optional) | `data-v2-board-build="gallery-170-reorder"` on `.legacy-media-board-v2-root` |

Если badge **не виден** в шапке доски — это **не** актуальный bundle. Hard refresh (Cmd+Shift+R) на trusted URL или перезапуск через helper script ниже.

## Порты — что использовать и что нет

| Port | Статус для v2 | Почему |
|------|----------------|--------|
| **3002** | **Trusted** | Controlled Next dev из emergency-fix `apps/storefront` |
| 3000 | Не trusted | Другой/старый процесс, если не перезапущен явно этим runbook |
| 8010 | Не trusted | Часто stale long-running Next; не использовать без cold restart |
| 8000 | **Invalid for v2** | Docker storefront монтирует **parent** repo; v2 route → **404** |

`package.json` в storefront задаёт `next dev --port 8000` — для v2 board **не** запускать `yarn dev` без смены порта; использовать `scripts/dev/start-legacy-board-v2.sh`.

## Быстрый старт (recommended)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce-emergency-fix
./scripts/dev/start-legacy-board-v2.sh
```

Скрипт:

- проверяет repo и наличие v2 board в коде;
- останавливает stale Next **только** на `3002`, если cwd указывает на этот storefront;
- удаляет `apps/storefront/.next`;
- поднимает `npx next dev --port 3002`;
- пишет PID/log в `tmp/logs/v2board-next-3002.{pid,log}`;
- печатает trusted URL и required badge.

Backend, DB и Docker **не** трогает.

## Ручной старт (если скрипт недоступен)

```bash
cd /Users/leonidmbp/Documents/projects/furniture-commerce-emergency-fix/apps/storefront
rm -rf .next
npx next dev --port 3002
```

Открыть: `http://localhost:3002/qa/legacy-media-assignment-board-v2`

## Проверка bundle (operator gate)

1. В header виден badge: `v2 build: gallery-170-reorder`.
2. Выбрать `co-02-1` (кнопка «↗ Быстро: co-02-1»).
3. Добавить 3 фото через `+ Галерея`.
4. В центральной колонке блок **ГАЛЕРЕЯ**, карточки ~**170px** шириной, thumb ~**150px**.
5. Reorder:
   - кнопки `←` / `→` на карточке галереи;
   - drag **только** за handle `↕ Перетащить` (не за превью).
6. Низ: **Порядок на витрине** — зеркало порядка галереи (не заменяет блок ГАЛЕРЕЯ).

## Reorder smoke (co-02-1)

Обозначения: A/B/C — первые три filename в strip после добавления в gallery.

| Step | Expected |
|------|----------|
| initial | `[A, B, C]` |
| `→` на первой карточке | `[B, A, C]` |
| drag handle 3 → slot 1 | `[C, B, A]` |
| reload | порядок сохраняется |
| Reset v2 | gallery пустая |

## Scope limits (dev-only)

- QA board: no Medusa writes, no catalog mutations.
- Export contract: `main + gallery` unchanged.
- Parent repo `/Users/leonidmbp/furniture-commerce` — **не** источник v2 board.

## Logs

- Next dev: `tmp/logs/v2board-next-3002.log`
- PID: `tmp/logs/v2board-next-3002.pid`

## Related code

- `apps/storefront/src/app/qa/legacy-media-assignment-board-v2/`
- Build label: `legacy-board-v2-build.ts`
