# Oliver Thumbnail Approval

Final approved state for Oliver thumbnail backfill. Discovery history lives in `docs/project/oliver-thumbnail-review.md`. Machine-readable mapping: `docs/project/oliver-thumbnail-approved-mapping.json` (mirror of `apps/backend/data/oliver/oliver-thumbnail-approved-mapping.json`, which Medusa reads in Docker).

Serving rule: storefront and Store API use backend-hosted static Oliver assets at `/static/products/oliver/<processed_filename>` (full URL: `{MEDUSA_BACKEND_URL}/static/products/oliver/...`). Approved Yandex paths are resolved to processed filenames via `data/processed/asset-manifests/processed-assets.json`.

## Approval table

| handle | approved_primary_image_url | status |
|---|---|---|
| `ol-15-1` | `http://localhost:9000/static/products/oliver/OL-15-1_color_lorna_01.jpg` | `approved` |
| `ol-15-2` | `http://localhost:9000/static/products/oliver/OL-15-2_color_lorna_01.jpg` | `approved` |
| `ol-07-1` | `http://localhost:9000/static/products/oliver/OL-07-1_color_leona_02.jpg` | `approved` |
| `ol-14-2` | `http://localhost:9000/static/products/oliver/OL-14-2_color_lorna_01.jpg` | `approved` |
| `ol-16-2` | `http://localhost:9000/static/products/oliver/OL-16-2_color_lorna_01.jpg` | `approved` |
| `ol-16-1` | `http://localhost:9000/static/products/oliver/OL-16-1_color_lorna_01.jpg` | `approved` |
| `ol-17-3` | `http://localhost:9000/static/products/oliver/OL-17-3_color_lorna_01.jpg` | `approved` |
| `ol-18-1` | `http://localhost:9000/static/products/oliver/OL-18-1_color_lillian_01.jpg` | `approved` |
| `ol-17-1` | `http://localhost:9000/static/products/oliver/OL-17-1_color_lorna_01.jpg` | `approved` |
| `ol-17-2` | `http://localhost:9000/static/products/oliver/OL-17-2_color_lorna_01.jpg` | `approved` |
| `ol-18-2` | `http://localhost:9000/static/products/oliver/OL-18-2_color_lorna_01.jpg` | `approved` |
| `ol-23-1` | `http://localhost:9000/static/products/oliver/OL-23-1_color_lorna_02.jpg` | `approved` |
| `ol-55-2` | `http://localhost:9000/static/products/oliver/OL-55-2_color_lorna_01.jpg` | `approved` |
| `ol-55-1` | `http://localhost:9000/static/products/oliver/OL-55-1_color_lorna_01.jpg` | `approved` |
| `ol-82-1` | `http://localhost:9000/static/products/oliver/OL-82-1_color_lorna_01.jpg` | `approved` |

Replace `http://localhost:9000` with `MEDUSA_BACKEND_URL` in non-local environments.

## Approved source paths (human reference)

| handle | approved Yandex / disk path |
|---|---|
| `ol-15-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-15-1-lorna-050.jpg` |
| `ol-15-2` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-15-2-lorna-050.jpg` |
| `ol-07-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-07-1-leona-050.jpg` |
| `ol-14-2` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-14-2-lorna-050.jpg` |
| `ol-16-2` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-16-2-lorna-050.jpg` |
| `ol-16-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-16-1-lorna-050.jpg` |
| `ol-17-3` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-17-3-lorna-050.jpg` |
| `ol-18-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-18-1-lillian-050.jpg` |
| `ol-17-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-17-1-lorna-050.jpg` |
| `ol-17-2` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-17-2-lorna-050.jpg` |
| `ol-18-2` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-18-2-lorna-050.jpg` |
| `ol-23-1` | `/WOODRIGHT/Контент /Фото на белом фоне /Стулья /ol-23-1-lorna-050.jpg` |
| `ol-55-2` | `/WOODRIGHT/Контент /Фото на белом фоне /Стулья /ol-55-2-lorna-050.jpg` |
| `ol-55-1` | `/WOODRIGHT/Контент /Фото на белом фоне /Стулья /ol-55-1-lorna-050.jpg` |
| `ol-82-1` | `/WOODRIGHT/Контент /Коллекции /Oliver/Фото на белом фоне /ol-82-1-lorna-050.jpg` |

## Ready for backfill now

All 15 handles above: run `yarn refresh-oliver-thumbnails` from `apps/backend` (after DB is available).

## Still needs manual pick

None — final mapping approved for backfill.
