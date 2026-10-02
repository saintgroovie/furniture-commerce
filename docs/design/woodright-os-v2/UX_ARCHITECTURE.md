# Woodright OS V2

Working application layout. The previous card shell is not the visual baseline.

## IA

Top level: Сегодня, Продажи, Заказы, Каталог, Витрина.

Продажи opens обращения. Inside it: Обращения, Люди, Компании. Входящие stay hidden until a real mailbox is connected. Проекты are not a section: the current data has no project that owns several orders. `bespoke_project` is a product sales mode. A designer stays a role on a person, with a company and a request.

Каталог holds товары and комнаты. Bookmarks to `/people`, `/requests`, `/products`, `/media` still redirect.

## Layout

Sidebar 220px, navy. Topbar 56px with a wide search. Main content uses the viewport. Object pages use `main + 340px inspector`. At 1024px and below the inspector stacks. Text blocks stay readable. Lists and tables use the width.

## Person

Header answers who this is. Main column is active work, history, a team note, and a logged contact. Inspector holds contacts, source, follow-up, role chips, company, customer match, assignee. An ambiguous customer match is a banner, not a full-width form. There is no automatic merge.

A logged call, meeting, or message is a person note with a kind. It is not an email and not a team note.

## Orders and storefront

Orders stay a table with the three axes separate. The storefront screen shows the real product image at stage size. The slot and the buyer price stay different facts.

## Tokens

Navy `#14233b`, canvas `#f6f4ef`, white surfaces, gold only as a small accent. Page title 32px, object title 28px, section 18px, body 15px, meta 13px.
