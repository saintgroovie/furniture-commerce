# Локальный запуск Woodright (гибрид)

**Рекомендуемый режим на каждый день.**

В Docker Desktop зелёными должны быть только **postgres** и **redis**.
Серые **medusa** / **storefront** - нормально: их не запускайте кнопкой Play, пока работаете локально.

## Порты

| Что | Где | URL / порт |
|-----|-----|------------|
| PostgreSQL | Docker | `localhost:5432` |
| Redis | Docker | `localhost:6379` |
| Medusa API + admin | локально (хост) | http://localhost:9000 |
| Витрина | локально (хост) | http://localhost:3002 |

## Ежедневный старт

```bash
# 1) Инфра (только БД + Redis)
cd /path/to/furniture-commerce
docker compose up -d

# 2) Backend
cd apps/backend
yarn start
# или для hot-reload админки: yarn dev

# 3) Витрина
cd apps/storefront
yarn dev
```

Проверка:

```bash
curl --max-time 5 -s http://localhost:9000/health   # OK
curl --max-time 5 -s -o /dev/null -w "%{http_code}\n" http://localhost:3002/
```

## Чего не делать

- Не жать Play у контейнеров `medusa` / `storefront` в Docker Desktop, если уже слушают `:9000` / `:3002` на Mac - будет конфликт портов.
- Не рассчитывать на Docker-storefront (`:8000`) для ежедневной работы: внутри Next на 3002, снаружи проброшен `8000:3002`.
- Не убивать listeners на `:9000` / `:3002` вслепую (`lsof | xargs kill`) - сначала проверьте PID, cwd и worktree (`lsof -nP -iTCP:3002 -sTCP:LISTEN`).

## Полный Docker (редко / демо)

Только если сознательно уходите целиком в compose:

1. Остановите **свои** локальные Medusa/storefront процессы на `:9000` / `:3002` (по PID из `lsof`, не через blind kill).
2. Затем:

```bash
docker compose --profile full up -d --build
```

Storefront в full-profile доступен на http://localhost:8000 (host `8000` → container `3002`).

Остановка full-сервисов без трогания БД:

```bash
docker compose --profile full stop medusa storefront
```

## Зачем так

- Быстрый HMR и отладка на хосте
- Стабильная БД/Redis в Docker
- Docker Desktop не выглядит «сломанным»: app-контейнеры в profile `full`, не в default
