# Отчёт: интерпретация каталога и внедрение правил

Дата: 2026-04-10.

---

## 1. Summary

Зафиксированы подтверждённые правила интерпретации в отдельном документе. Проведён аудит витрины и сида Greenwich относительно этих правил. Реализованы **минимальные** правки: карточки с display group снова показывают артикул и габариты, PDP — галерею, каноническое имя из metadata, блок «Другие размеры» по `display_group`, фильтр **активных** коллекций по `metadata.collection`, синхронизирован backend `seed-greenwich` с полем `canonical_name` и полным набором display/metadata. Структурные темы (разделение Oliver, подколлекции Willie Winkie, перекрёстные ссылки) остаются на стороне контента и последующих итераций ingestion — без смены архитектуры Medusa + Next.js.

---

## 2. Created docs

| Файл | Назначение |
|------|------------|
| `docs/storefront/catalog-interpretation-rules.md` | Единый структурированный свод подтверждённых правил |
| `docs/storefront/catalog-implementation-gap-audit.md` | Соответствие и пробелы до правок |
| `docs/storefront/catalog-target-display-model.md` | Целевая модель коллекция / карточка / PDP / группы |
| `docs/storefront/catalog-interpretation-implementation-report.md` | Этот отчёт |

Пути в репозитории: `furniture-commerce/docs/…` (корень документации проекта Woodright).

---

## 3. Audit findings

Кратко (детали — в `catalog-implementation-gap-audit.md`):

- Карточка **скрывала** артикул и размеры для товаров в display group — нарушение обязательных полей.
- PDP не показывал **галерею** и **соседние размеры** по группе.
- `canonical_name` из ingestion **не попадал** в продукт при использовании устаревшего `apps/backend/src/scripts/seed-greenwich.ts`.
- Каталог не **исключал** товары с явным `metadata.collection` из паузируемых листов workbook.
- Oliver (adult/kids), WW paintings как подколлекции, перекрёстные ссылки — **не смоделированы** в данных.
- `docs/storefront/storefront-content-model.md` всё ещё содержит устаревшую рекомендацию про variant finish для WW; актуальный источник — `catalog-interpretation-rules.md`.

---

## 4. Target model

См. `docs/storefront/catalog-target-display-model.md`: backend metadata как контракт (`collection`, `collection_label`, `canonical_name`, `dimensions`, `display_group*`, опционально `subcollection_label`), листинг через `groupProductsForDisplay`, PDP с галереей и списком членов группы.

---

## 5. Files changed

| Путь | Изменение |
|------|-----------|
| `docs/storefront/catalog-interpretation-rules.md` | Создан |
| `docs/storefront/catalog-implementation-gap-audit.md` | Создан |
| `docs/storefront/catalog-target-display-model.md` | Создан |
| `docs/storefront/catalog-interpretation-implementation-report.md` | Создан |
| `apps/storefront/src/lib/catalog-scope.ts` | Создан: активные / паузируемые slug |
| `apps/storefront/src/lib/product-metadata.ts` | `getCanonicalName`, `getSubcollectionLabel` |
| `apps/storefront/src/lib/display-group.ts` | `getDisplayGroupMembers` |
| `apps/storefront/src/components/product-card.tsx` | Артикул/размеры для групп; подколлекция в контексте |
| `apps/storefront/src/app/catalog/page.tsx` | Фильтр `isProductInActiveCatalogScope` |
| `apps/storefront/src/app/kids/catalog/page.tsx` | Тот же фильтр для kids-выборки |
| `apps/storefront/src/app/product/[id]/page.tsx` | Галерея, canonical, «Другие размеры», коллекция/подколлекция |
| `apps/storefront/src/app/globals.css` | Стили галереи PDP, canonical, related sizes |
| `scripts/seed-greenwich.ts` | `canonical_name` в metadata |
| `apps/backend/src/scripts/seed-greenwich.ts` | Синхронизация с полным metadata (label, display_group, canonical) |

---

## 6. What was fixed in catalog / cards / PDP

- **Каталог /kids:** товары с `metadata.collection` из паузируемого набора не показываются; без `collection` — как раньше (демо seed).
- **Карточка:** для display group отображаются артикул и габариты представителя; опционально `subcollection_label` в строке контекста.
- **PDP:** миниатюры дополнительных изображений; подпись workbook при `canonical_name` ≠ title; блок ссылок на другие продукты той же `display_group` + `collection`; коллекция и подколлекция в шапке.
- **Seed Greenwich:** новые продукты получают `collection_label`, `display_group*`, `canonical_name` в metadata (повторный seed для уже созданных SKU не обновляет существующие записи — см. caveats).

---

## 7. Remaining caveats

- **Повторный прогон seed** не обновляет уже существующие Greenwich-товары; для обновления metadata в БД нужен отдельный скрипт миграции или ручное обновление в админке.
- **Oliver** adult/kids и **взаимные ссылки** — нет полей в данных и URL; не реализовано.
- **Willie Winkie:** подколлекции картин не заведены в каталоге; `subcollection_label` поддержан в UI, но не заполнен ingestion для WW.
- **Связанные варианты** (банкетка малая/большая и т.д.) — нет контракта `related_product_ids` (или аналога) в metadata; не реализовано.
- **PDP «Другие размеры»** для группы вызывает `getProducts()` при наличии `display_group` — дополнительный запрос к API; при росте каталога имеет смысл вынести фильтрацию на backend (расширение существующего store route), без нового BFF.
- **Документ `storefront-content-model.md`** стоит привести в соответствие с `catalog-interpretation-rules.md` (раздел WW) отдельным правкой документации.

---

## Формат результата (чеклист)

1. Summary — см. §1  
2. Created docs — §2  
3. Audit findings — §3  
4. Target model — §4  
5. Files changed — §5  
6. What was fixed — §6  
7. Remaining caveats — §7  
