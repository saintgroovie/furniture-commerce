import { Text } from "@medusajs/ui"
import { useMemo, useState } from "react"
import {
  activeTasks,
  buildCatalogOpsBoard,
  frozenGroupSummary,
  matchPhotoFilename,
  taskMatchesQuery,
  type CatalogOpsProduct,
  type OpsTask,
  type PhotoItem,
} from "../../../lib/woodright-admin/catalog-ops-board"
import type { SellerProduct } from "../../../lib/woodright-admin/seller-product-types"
import { resolveAdminImageSrc } from "./site-status-labels"

type FilterId = "active" | "do" | "decide" | "automatic" | "waiting" | "done"

const FILTERS: Array<{ id: FilterId; label: string }> = [
  { id: "active", label: "Все активные" },
  { id: "do", label: "Нужно сделать" },
  { id: "decide", label: "Ждёт меня" },
  { id: "automatic", label: "Можно автоматом" },
  { id: "waiting", label: "Ждёт исходники" },
  { id: "done", label: "Готово" },
]

function toOpsProduct(product: SellerProduct): CatalogOpsProduct {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    status: product.status,
    collection_label: product.collection_label,
    thumbnail: product.thumbnail,
    image_urls: product.image_urls,
    description: product.description,
    missing_price: product.classification !== "BESPOKE" && !product.readiness.has_price,
    published_invisible: product.status === "published" && !product.readiness.visible,
    dimensions: product.dimensions,
  }
}

function matchesFilter(task: OpsTask, filter: FilterId): boolean {
  if (filter === "done") return task.status === "done"
  if (task.status === "done") return false
  if (filter === "active") return task.status === "active"
  if (filter === "do") return task.lane === "do"
  if (filter === "decide") return task.owner_input_required && task.status === "active"
  if (filter === "automatic") return task.lane === "automatic"
  return task.lane === "waiting" || task.lane === "watch" || task.status === "frozen"
}

export function CatalogOpsBoard({
  products,
  initialTaskId = "photo-catalog",
}: {
  products: SellerProduct[]
  initialTaskId?: string
}) {
  const board = useMemo(
    () => buildCatalogOpsBoard(products.map(toOpsProduct)),
    [products]
  )
  const [filter, setFilter] = useState<FilterId>("active")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId)
  const visible = board.tasks.filter(
    (task) => matchesFilter(task, filter) && taskMatchesQuery(task, query)
  )
  const selected = board.tasks.find((task) => task.task_id === selectedId) ?? visible[0] ?? null
  const summary = board.summary
  const nothingActive = activeTasks(board).length === 0

  return (
    <div className="px-6 py-5 flex flex-col gap-5 min-w-0">
      <div className="grid grid-cols-2 min-[980px]:grid-cols-4 gap-3">
        <Summary label="На витрине" value={summary.buyer_visible} />
        <Summary label="С нормальным фото" value={summary.ready_photos} />
        <Summary label="Ждут съёмку" value={summary.waiting_photos} />
        <Summary label="Критично" value={summary.critical} />
      </div>

      <label className="block max-w-md">
        <span className="sr-only">Поиск</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Артикул, название, коллекция"
          className="w-full text-sm bg-transparent border border-ui-border-base rounded-md px-3 py-2"
        />
      </label>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Фильтр задач">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={
              filter === item.id
                ? "text-sm px-3 py-1 rounded-full bg-ui-bg-base border border-ui-border-strong"
                : "text-sm px-3 py-1 rounded-full text-ui-fg-subtle"
            }
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 min-[980px]:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="min-w-0 flex flex-col gap-3">
          {filter === "active" && nothingActive ? (
            <div className="py-8">
              <h2 className="text-xl font-medium">Всё в порядке</h2>
              <Text size="small" className="text-ui-fg-subtle mt-2">
                Критических задач по каталогу нет
              </Text>
            </div>
          ) : null}
          {visible.length === 0 && !(filter === "active" && nothingActive) ? (
            <Text size="small" className="text-ui-fg-subtle">
              В этом разделе пусто
            </Text>
          ) : null}
          {visible.map((task) => (
            <TaskCard
              key={task.task_id}
              task={task}
              selected={selected?.task_id === task.task_id}
              onSelect={() => setSelectedId(task.task_id)}
            />
          ))}
          {filter === "active" ? (
            <QuietSections
              waiting={board.tasks.filter(
                (task) =>
                  (task.status === "frozen" || task.lane === "watch" || task.lane === "waiting") &&
                  taskMatchesQuery(task, query)
              )}
              done={board.tasks.filter((task) => task.status === "done" && taskMatchesQuery(task, query))}
              onSelect={setSelectedId}
            />
          ) : null}
        </div>
        <Inspector task={selected} />
      </div>
    </div>
  )
}

function QuietSections({
  waiting,
  done,
  onSelect,
}: {
  waiting: OpsTask[]
  done: OpsTask[]
  onSelect: (id: string) => void
}) {
  return (
    <div className="mt-4 flex flex-col gap-2 text-sm">
      <details>
        <summary className="cursor-pointer text-ui-fg-subtle">
          Ждёт новых исходников · {waiting.reduce((sum, task) => sum + task.affected_count, 0)}
        </summary>
        <ul className="mt-2 flex flex-col gap-1">
          {waiting.map((task) => (
            <li key={task.task_id}>
              <button type="button" className="text-left" onClick={() => onSelect(task.task_id)}>
                {task.title}
                <span className="text-ui-fg-subtle"> · {task.problem}</span>
              </button>
            </li>
          ))}
        </ul>
      </details>
      <details>
        <summary className="cursor-pointer text-ui-fg-subtle">Готово · {done.length}</summary>
        <ul className="mt-2 flex flex-col gap-1 text-ui-fg-subtle">
          {done.map((task) => (
            <li key={task.task_id}>
              {task.title}
              {task.completed_at ? ` · ${task.completed_at}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
    </div>
  )
}

function TaskCard({
  task,
  selected,
  onSelect,
}: {
  task: OpsTask
  selected: boolean
  onSelect: () => void
}) {
  const photoLine = task.photo_items
    ? groupLine(task.photo_items)
    : null
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        selected
          ? "text-left rounded-lg border border-ui-border-strong px-4 py-4 min-w-0"
          : "text-left rounded-lg border border-ui-border-base px-4 py-4 min-w-0"
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{task.title}</span>
        <span className="text-sm text-ui-fg-subtle shrink-0">{task.severity_label}</span>
      </div>
      <p className="mt-2 text-sm">{task.problem}</p>
      {photoLine ? <p className="mt-1 text-sm text-ui-fg-subtle">{photoLine}</p> : null}
      {task.affected_count > 0 && !task.photo_items ? (
        <p className="mt-1 text-sm text-ui-fg-subtle">{task.affected_count} позиций</p>
      ) : null}
      <p className="mt-3 text-sm">
        <span className="text-ui-fg-subtle">Следующий шаг: </span>
        {task.next_action}
      </p>
    </button>
  )
}

function groupLine(items: PhotoItem[]): string {
  const waiting = items.filter((item) => item.status !== "uploaded")
  const parts: Array<[PhotoItem["group"], string]> = [
    ["etagere", "этажерки"],
    ["guard", "бортика"],
    ["canopy", "каркас"],
    ["other", "прочие"],
  ]
  return parts
    .map(([group, label]) => {
      const count = waiting.filter((item) => item.group === group).length
      return count > 0 ? `${count} ${label}` : ""
    })
    .filter(Boolean)
    .join(" · ")
}

function Inspector({ task }: { task: OpsTask | null }) {
  if (!task) {
    return (
      <aside className="min-w-0 text-sm text-ui-fg-subtle">
        Выберите задачу
      </aside>
    )
  }
  return (
    <aside className="min-w-0 flex flex-col gap-4 text-sm">
      <div>
        <h2 className="text-base font-medium">{task.title}</h2>
        <p className="mt-2">{task.problem}</p>
      </div>
      {task.photo_items ? <PhotoBatch items={task.photo_items} /> : null}
      {task.task_id === "recovery-archive" ? <FrozenDetail /> : null}
      {task.why_not_automatic ? (
        <p className="text-ui-fg-subtle">{task.why_not_automatic}</p>
      ) : null}
      {!task.photo_items && task.affected_items.length > 0 && task.task_id !== "recovery-archive" ? (
        <ul className="flex flex-col gap-1">
          {task.affected_items.map((item) => (
            <li key={item.handle}>
              {item.handle} · {item.title}
            </li>
          ))}
        </ul>
      ) : null}
      <details>
        <summary className="cursor-pointer text-ui-fg-subtle">Технические детали</summary>
        <p className="mt-2 text-ui-fg-subtle break-words">{task.technical_status}</p>
        {task.evidence.map((path) => (
          <p key={path} className="mt-1 text-ui-fg-subtle break-words">
            {path}
          </p>
        ))}
        {task.completed_at ? (
          <p className="mt-1 text-ui-fg-subtle">Закрыто {task.completed_at}</p>
        ) : null}
      </details>
    </aside>
  )
}

function FrozenDetail() {
  return (
    <div>
      <p>Ничего делать сейчас не нужно</p>
      <ul className="mt-2 flex flex-col gap-1 text-ui-fg-subtle">
        {frozenGroupSummary().map((group) => (
          <li key={group.label}>
            {group.label} · {group.count}
          </li>
        ))}
      </ul>
    </div>
  )
}

const STATUS_LABEL: Record<PhotoItem["status"], string> = {
  not_shot: "Не снято",
  file_received: "Файл получен",
  checked: "Проверено",
  ready: "Готово к загрузке",
  uploaded: "Загружено",
}

function PhotoBatch({ items }: { items: PhotoItem[] }) {
  const [rows, setRows] = useState(items)
  const [note, setNote] = useState<string | null>(null)
  const groups = ["etagere", "guard", "canopy", "other"] as const
  const labels: Record<(typeof groups)[number], string> = {
    etagere: "Этажерки",
    guard: "Бортики",
    canopy: "Каркас балдахина",
    other: "Прочие",
  }

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const next = rows.map((row) => ({ ...row }))
    for (const file of Array.from(list)) {
      const match = matchPhotoFilename(
        file.name,
        next.map((row) => row.handle)
      )
      if (!match || match.role !== "HERO") continue
      const row = next.find((item) => item.handle === match.handle)
      if (!row || row.status === "uploaded") continue
      const ok = await fileLooksLikePhoto(file)
      row.status = ok ? "ready" : "file_received"
    }
    setRows(next)
    setNote(null)
  }

  function checkPack() {
    const pending = rows.filter((row) => row.status !== "uploaded")
    const ready = pending.filter((row) => row.status === "ready")
    if (ready.length === pending.length && pending.length > 0) {
      setNote("Комплект проверен. Запись в каталог с этого экрана не запускается")
      return
    }
    setNote("Не у всех товаров есть подходящий файл. Имена должны содержать артикул, например pr-68-1_hero.jpg")
  }

  const done = rows.filter((row) => row.status === "uploaded" || row.status === "ready").length

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ui-fg-subtle">
        {done} / {rows.length} готовы
      </p>
      {groups.map((group) => {
        const members = rows.filter((row) => row.group === group)
        if (members.length === 0) return null
        return (
          <div key={group}>
            <p className="font-medium">
              {labels[group]} · {members.length}
            </p>
            <ul className="mt-1 flex flex-col gap-2">
              {members.map((item) => (
                <li key={item.handle} className="min-w-0">
                  <div className="flex gap-3 items-start">
                    {item.reference_url ? (
                      <img
                        src={resolveAdminImageSrc(item.reference_url)}
                        alt=""
                        className="w-14 h-14 object-contain bg-ui-bg-subtle shrink-0"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p>
                        {item.handle} · {item.title}
                      </p>
                      <p className="text-ui-fg-subtle">{item.brief}</p>
                      <p className="text-ui-fg-subtle">{STATUS_LABEL[item.status]}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      <label className="block">
        <span className="text-ui-fg-subtle">Загрузить комплект</span>
        <input
          className="block mt-1 w-full text-sm"
          type="file"
          accept="image/jpeg,image/png"
          multiple
          onChange={(event) => {
            void onFiles(event.target.files)
          }}
        />
      </label>
      <button type="button" className="text-left text-sm font-medium underline underline-offset-4" onClick={checkPack}>
        Проверить комплект
      </button>
      {note ? <p>{note}</p> : null}
    </div>
  )
}

function fileLooksLikePhoto(file: File): Promise<boolean> {
  if (!file.type.startsWith("image/")) return Promise.resolve(false)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const longSide = Math.max(image.naturalWidth, image.naturalHeight)
      URL.revokeObjectURL(url)
      resolve(longSide >= 1600)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(false)
    }
    image.src = url
  })
}
