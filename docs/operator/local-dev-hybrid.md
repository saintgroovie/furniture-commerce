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

## После перезагрузки Mac

Порядок:

1. Docker Desktop должен быть запущен (`docker info`). Если daemon ещё не готов - подождать, не гонять compose вхолостую.
2. Снова проверить `:5432` и `:6379`. Compose `docker compose up -d postgres redis` (контейнеры `medusa_postgres`, `medusa_redis`) только если какой-то из портов не слушает. Если оба LISTEN - compose не запускать. Дождаться healthy Postgres, если его поднимали.
3. Kickstart backend (`com.woodright.medusa-backend`) только если `:9000` ещё не слушает - не больше одного kickstart на этот probe. Витрина `:3002` часто переживает reboot сама - kickstart `com.woodright.storefront-qa` только если `:3002` down, тоже не больше одного.
4. Не поднимать старые preview (`:3188`, `:9141`, matrix `:3004`, `~/.woodright/durable-local-servers/*`), пока явно не попросили этот preview.

Если Medusa в launchctl «running», а `:9000` молчит и в логе `ECONNREFUSED` - сначала Postgres, не серия kickstart (KeepAlive storm).

LaunchAgent `run-backend.sh` ждёт `:5432`/`:6379` до 90s; если инфра так и не поднялась - **не** стартует Medusa (exit 0, без шторма). После compose - один kickstart backend.

Machine: `.cursor/rules/durable-local-review-servers.mdc`.

## Чего не делать

- Не жать Play у контейнеров `medusa` / `storefront` в Docker Desktop, если уже слушают `:9000` / `:3002` на Mac - будет конфликт портов.
- Не рассчитывать на Docker-storefront (`:8000`) для ежедневной работы: внутри Next на 3002, снаружи проброшен 8000 (исторический маппинг).

## Полный Docker (редко / демо)

Storefront в full-profile доступен на http://localhost:8000 (host `8000` → container `3002`).


Только если сознательно уходите целиком в compose. Сначала остановите хостовые Medusa и витрину **по identity**, не `lsof | xargs kill`:

```bash
bash ~/.woodright/qa-dev-servers/woodright-backend.sh stop
bash ~/.woodright/qa-dev-servers/woodright-storefront.sh stop

docker compose --profile full up -d --build
```

Остановка full-сервисов без трогания БД:

```bash
docker compose --profile full stop medusa storefront
```

## Зачем так

- Быстрый HMR и отладка на хосте
- Стабильная БД/Redis в Docker
- Docker Desktop не выглядит «сломанным»: app-контейнеры в profile `full`, не в default
