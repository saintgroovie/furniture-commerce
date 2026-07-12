---
name: ru-ux-ui-copywriting
description: >-
  Full Russian UX/UI microcopy playbook (syntax, punctuation, buttons, errors,
  empty states, lists, tone). Use when writing or editing Russian storefront/admin
  copy, woodright-copy.ts, CopyLines, labels, CTAs, empty/error states, SEO UI
  strings, or when the user mentions UX-копирайтинг, микрокопирайт, редполитика,
  точки, отбивки, висячие предлоги, кнопки, empty state.
---

# Русский UX/UI копирайтинг

Свод для агента: как писать и править интерфейсный русский текст в Woodright.
Полная редполитика - в [reference.md](reference.md). Чеклист ревью - в [checklist.md](checklist.md).

## Когда читать этот skill

1. Любая правка buyer/admin RU-копирайта
2. Новые строки в `apps/storefront/src/lib/woodright-copy.ts`
3. Empty / error / success / CTA / labels / forms
4. Пользователь просит «по правилам UX» / «как пишут в интерфейсах»

## Источники (синтез)

- [Контур.Гайды - Текст в интерфейсе](https://guides.kontur.ru/principles/text/styleguide/)
- [Ozon UX-редактура (Habr)](https://habr.com/ru/companies/ozontech/articles/821383/)
- [UPROCK - Пунктуация в UX](https://www.uprock.ru/articles/punktuaciya-v-ux-polnoe-rukovodstvo)
- Практики Госуслуг / редполитики коротких UX-текстов
- Woodright overlays: `dash-typography.mdc`, `ux-copywriting.mdc`

При конфликте с внешним гайдом побеждает **Woodright overlay** (ниже).

## Woodright overlays (жёстко)

1. Тире только ` - ` (пробелы). Запрещены `—` и `–`
2. Точка в конце однопредложного UI-блока - нет. Точка только между двумя предложениями на одной строке
3. Чаще отбивка: `string[]` + `CopyLines` / `lead` + `supporting`
4. Висячие предлоги **и** устойчивые словосочетания: `formatRuInline` / `CopyLines` (nbsp)
   - Не оставлять `под` / `по` / `и` в конце строки
   - Не отрывать `под проект` от `мебель` → всегда `мебель под проект` одним блоком
   - Не начинать визуальную строку с союза `и …` (`… для взрослых` / `и детских комнат`)
   - Не резать collocation через `string[]` отбивку; резать только между мыслями
   - Узкий footer: задавать смысловые строки явно, не полагаться на wrap в 32–38ch
5. SoT строк: `woodright-copy.ts`. Рендер: `copy-lines.tsx`

## Быстрый алгоритм

1. Определи формат: кнопка / заголовок / лид / caption / error / empty / toast / SEO
2. Одна мысль - один блок. Сократи канцелярит и синонимы-дубли терминов
3. Заголовок + кнопка должны читаться как диалог без тела текста
4. Кнопка действия = инфинитив («Добавить в корзину»). Подтверждение без действия = наречие («Понятно»)
5. Ошибка: что случилось + что сделать. Без вины пользователя и без «Oops»
6. Примени overlays Woodright (тире / точки / отбивки / nbsp)
7. Прогони [checklist.md](checklist.md)

## Куда писать в репо

| Что | Куда |
|-----|------|
| Повторяющийся UI-текст | `apps/storefront/src/lib/woodright-copy.ts` |
| Многострочный лид | `string[]` + `<CopyLines />` |
| Alert/setError | `flatCopy(...)` |
| Typo helper | `apps/storefront/src/lib/format-ru-copy.ts` |

## Не делать

- Синонимы для одного действия на разных экранах («В корзину» / «Отправить в корзину»)
- Точка на кнопке, чипе, одиночном статусе
- Длинный дефис AI-стиля
- Восклицательные знаки в ошибках
- Точка с запятой в списках UI
- Многоточие вне процесса загрузки/отправки
- SEO meta править «под UI» без нужды (UI строже SEO)

## Additional resources

- [reference.md](reference.md) - полный свод правил по форматам
- [checklist.md](checklist.md) - ревью перед сдачей
- Machine short rules: `.cursor/rules/ux-copywriting.mdc`, `.cursor/rules/dash-typography.mdc`
