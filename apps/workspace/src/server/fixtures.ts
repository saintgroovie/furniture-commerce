export const fixtureAccess = {
  access: {
    role: "staff" as const,
    email: "seller@example.com",
    capabilities: {
      view_orders: true,
      edit_order_process: true,
      view_contacts: true,
      edit_contacts: true,
      view_catalog: true,
      edit_catalog: true,
      publish_catalog: true,
      manage_promotions: true,
      manage_site: true,
      view_crm: true,
      edit_crm: true,
      link_customer: true,
      assign_crm: true,
      follow_up: true,
      view_sensitive_settings: false,
      developer_escape_hatch: false,
    },
    escape_hatch: false,
  },
  medusa_admin_url: null as string | null,
}

export const fixtureToday = {
  attention: {
    missing_media: 1,
    missing_price: 1,
    published_invisible: 0,
    waiting_customer: 1,
    open_requests: 1,
  },
  inbox: [
    {
      id: "req:sample",
      kind: "request",
      title: "Анна Ковалева",
      hint: "Нужен стол под окно",
      action: "Открыть заявку",
      overdue: true,
      href: "/requests/req_sample",
    },
    {
      id: "ord:sample",
      kind: "production",
      title: "Заказ 1042",
      hint: "Ожидает согласования клиента",
      action: "Открыть этап",
      overdue: true,
      href: "/orders/order_sample",
    },
  ],
  follow_ups_truncated: false,
}

export const fixtureOrders = {
  orders: [
    {
      id: "order_sample",
      display_id: 1042,
      email: "anna@example.com",
      person_name: "Анна Ковалева",
      phone: "+7 900 000-00-01",
      total: 186000,
      currency_code: "rub",
      payment_status: "awaiting",
      fulfillment_status: "not_fulfilled",
      created_at: "2026-09-30T08:00:00.000Z",
      medusa_status: "pending",
      manufacturing_stage: "awaiting_customer_approval",
      manufacturing_label: "Ожидает согласования клиента",
      action_needed: true,
    },
  ],
  filter: "all",
  offset: 0,
  limit: 30,
  has_more: false,
}

export const fixtureOrder = {
  order: {
    id: "order_sample",
    display_id: 1042,
    email: "anna@example.com",
    total: 186000,
    currency_code: "rub",
    payment_status: "awaiting",
    fulfillment_status: "not_fulfilled",
    created_at: "2026-09-30T08:00:00.000Z",
    status: "pending",
    customer: { first_name: "Анна", last_name: "Ковалева", email: "anna@example.com", phone: "+7 900 000-00-01" },
    items: [{ id: "item_1", title: "Стол Оливер", quantity: 1, unit_price: 186000 }],
  },
  process: {
    id: "proc_sample",
    current_stage: "awaiting_customer_approval",
    label: "Ожидает согласования клиента",
    internal_note: "Ждём подтверждение ткани",
    customer_message: null,
    version: 2,
    allowed_stages: [
      { stage: "specification_in_progress", label: "Согласование комплектации" },
      { stage: "confirmed", label: "Подтверждён" },
      { stage: "on_hold", label: "Приостановлен" },
    ],
  },
  assignment: { assignee_id: null as string | null },
  staff: [] as Array<{ id: string; email: string | null }>,
  allowed_stages: [
    { stage: "specification_in_progress", label: "Согласование комплектации" },
    { stage: "confirmed", label: "Подтверждён" },
    { stage: "on_hold", label: "Приостановлен" },
  ],
  activity: [
    { id: "created:order_sample", at: "2026-09-30T08:00:00.000Z", kind: "order_created", label: "Заказ создан", detail: null },
    { id: "stage:evt", at: "2026-09-30T09:00:00.000Z", kind: "stage_changed", label: "Этап изготовления изменён", detail: "Ожидает согласования клиента" },
  ],
}

export const fixturePeople = {
  links_available: false,
  people: [
    {
      id: "lead_sample",
      name: "Анна Ковалева",
      email: "anna@example.com",
      phone: "+7 900 000-00-01",
      source: "bespoke",
      request_count: 1,
      customer_id: null,
      assignee_id: null,
      match_status: "unlinked",
    },
  ],
}

export const fixturePerson = {
  person: {
    id: "lead_sample",
    name: "Анна Ковалева",
    email: "anna@example.com",
    phone: "+7 900 000-00-01",
    source: "bespoke",
    comment: "Нужен стол под окно",
    created_at: "2026-09-29T12:00:00.000Z",
    updated_at: "2026-09-30T08:00:00.000Z",
  },
  requests: [
    { id: "req_sample", status: "new", comment: "Нужен стол под окно", created_at: "2026-09-29T12:00:00.000Z" },
  ],
  orders: [] as Array<{ id: string; display_id?: string | number | null }>,
  link: null as null | { customer_id: string | null; assignee_id: string | null; match_status: string },
  links_available: false,
  suggestion: {
    status: "none",
    customer_ids: [] as string[],
    candidates: [] as Array<{ id: string; email: string | null; phone: string | null }>,
  },
  staff: [],
  roles: [] as Array<{ role: string; label: string | null }>,
  companies: [] as Array<{ id: string; name: string; type: string | null; type_label: string | null; linked_at?: string | null }>,
  notes: [] as Array<{ id: string; body: string; kind?: string | null; created_at: string | null }>,
  follow_ups: [] as Array<{ id: string; entity_type: string | null; entity_id: string | null; assignee_id: string | null; due_at: string | null; summary: string; status: string }>,
  follow_ups_truncated: false,
  request_orders: [] as Array<{ id: string; request_id: string | null; order_id: string | null }>,
  activity: [] as Array<{ id: string; at: string | null; source: string; text: string }>,
  crm_available: false,
}

export const fixtureMailStatus = {
  visible: false,
  reason: "not_configured" as const,
}

export const fixtureMailThreads = {
  threads: [] as Array<{
    id: string
    subject: string | null
    status: string
    waiting_on: string
    assignee_id: string | null
    lead_id: string | null
    request_id: string | null
    order_id: string | null
    last_message_at: string | null
  }>,
}

export const fixtureCompanies = {
  companies: [] as Array<{ id: string; name: string; type: string | null; type_label: string | null; people_count: number }>,
}

export const fixtureCompany = {
  company: { id: "comp_sample", name: "Студия", type: "design_studio", type_label: "Дизайн-студия", internal_note: null as string | null, created_at: null as string | null },
  people: [] as Array<{ id: string; name: string | null; email: string | null; phone: string | null; role_label?: string | null; active_request?: boolean }>,
  requests: [] as Array<{ id: string; lead_id: string | null; status: string | null; comment: string | null; created_at: string | null }>,
  order_ids: [] as string[],
  follow_ups: [] as Array<{ id: string; status: string | null; summary: string | null; due_at: string | null }>,
  activity: [] as Array<{ id: string; at: string | null; source: string; text: string }>,
}

export const fixtureProducts = {
  products: [
    {
      id: "prod_sample",
      title: "Стол Оливер",
      subtitle: "",
      description: "",
      status: "draft",
      classification: "STANDARD",
      kids_nav: false,
      skus: ["OL-01-1"],
      variants: [
        {
          id: "variant_1",
          sku: "OL-01-1",
          title: "Основной",
          rub_price: { id: "price_1", amount: 186000, currency_code: "rub" } as { id: string; amount: number; currency_code?: string } | null,
          promo_price: null as { amount: number; price_list_id: string } | null,
        },
      ],
      thumbnail: null as string | null,
      image_urls: [] as string[],
      images: [] as Array<{ id: string; url: string }>,
      price_display: { kind: "single", amount: 186000 },
      readiness: { published: false, visible: false, has_price: true, has_media: false, warning_count: 0, error_count: 1, codes: ["missing_media"] },
      dimensions: { height_mm: 750, width_mm: 1600, depth_mm: 800 },
      publish: { ready: false, blockers: [{ code: "missing_media", message: "Нет фото" }], warnings: [] },
      collection_label: "Оливер",
    },
  ],
}

export const fixtureProduct = {
  product: fixtureProducts.products[0],
  site_url: "http://127.0.0.1:3002",
}

export const fixtureRequests = {
  bespoke_requests: [
    {
      id: "req_sample",
      lead_id: "lead_sample",
      status: "new",
      comment: "Нужен стол под окно",
      created_at: "2026-09-29T12:00:00.000Z",
      internal_notes: null,
    },
  ],
  leads: fixturePeople.people,
}

export const fixtureRooms = {
  room_sets: [{ id: "room_1", title: "Спальня у окна", slug: "bedroom-window", room_type: "спальня", is_active: true }],
}

export const fixturePromo = {
  slot: { enabled: true, label: "Сейчас в каталоге", product_ids: ["prod_sample"], rotation_interval_ms: 7000 },
  price_list: { id: "plist_1", title: "Акция каталога", active_now: true, admin_path: null },
  products: [
    {
      product_id: "prod_sample",
      title: "Стол Оливер",
      sku: "OL-01-1" as string | null,
      status: "draft" as string | null,
      thumbnail: null as string | null,
      base_price: 186000 as number | null,
      sale_price: null as number | null,
      discount_percent: null as number | null,
      buyer_base_price: 186000 as number | null,
      buyer_sale_price: null as number | null,
      blocker: "no_sale_price" as string | null,
    },
  ],
}

export const fixtureContacts: {
  configured: boolean
  live: boolean
  contacts: null | {
    free_call: { display: string }
    write_or_call: { display: string }
  }
  message: string
} = {
  configured: false,
  live: false,
  contacts: null,
  message: "Черновик контактов ещё не сохранён",
}
