import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarBlank,
  Users,
  ChatCircle,
  User,
  Buildings,
  Cube,
  BookOpen,
  Armchair,
  House,
  Storefront,
  Receipt,
  Paperclip,
  MagnifyingGlass,
  Bell,
  CaretDown,
  CaretUp,
  Plus,
  Question,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowRight,
  CheckCircle,
  List,
  X,
} from "@phosphor-icons/react";
import "@fontsource/inter/cyrillic-400.css";
import "@fontsource/inter/cyrillic-500.css";
import "@fontsource/inter/cyrillic-600.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/lora/cyrillic-400.css";
import "@fontsource/lora/cyrillic-500.css";
import {
  Button,
  IconButton,
  Drawer,
  Toast,
  Notice,
  Empty,
  FormError,
} from "./ui.jsx";
import { loadData, saveData } from "./storage.js";
import {
  Login,
  LiveNotice,
  SourceGate,
  Integrations,
  LivePanel,
  LiveObjectDetail,
} from "./Live.jsx";
import { todayGroups, reconcileCatalog } from "./model.mjs";
import { TodayView, ObjectList } from "./BusinessViews.jsx";
const NAV_NAMES = {
  today: "Рабочая очередь",
  requests: "Обращения",
  people: "Люди",
  companies: "Компании",
  orders: "Заказы",
  products: "Товары",
  rooms: "Комнаты",
  storefront: "Витрина",
  invoices: "Счета",
  files: "Файлы",
  integrations: "Интеграции",
};
const parseRoute = () => {
  const [page = "today", id] = window.location.hash
    .replace(/^#\/?/, "")
    .split("/");
  return {
    page: NAV_NAMES[page] ? page : "today",
    id: id ? decodeURIComponent(id) : null,
  };
};
export function App() {
  const [data, setData] = useState(null),
    [loadError, setLoadError] = useState(""),
    [route, setRoute] = useState(parseRoute),
    [panel, setPanel] = useState(null),
    [toast, setToast] = useState(null),
    [search, setSearch] = useState(""),
    [menu, setMenu] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [refreshing, setRefreshing] = useState(false),
    [expanded, setExpanded] = useState({
      sales: true,
      catalog: true,
      documents: true,
    });
  const current = useRef(null),
    queue = useRef(Promise.resolve()),
    toastTimer = useRef(null);
  useEffect(() => {
    let active = true;
    loadData()
      .then((saved) => {
        const d = reconcileCatalog(saved);
        if (active) {
          current.current = d;
          setData(d);
        }
      })
      .catch((e) => {
        if (active) setLoadError(e);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const listener = () => {
      setRoute(parseRoute());
      setMobileNav(false);
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);
  useEffect(() => {
    const key = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPanel((p) => (p?.type === "search" ? null : { type: "search" }));
      }
      if (e.key === "Escape") {
        setMenu(false);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    document.title = `${NAV_NAMES[route.page]} · Woodright OS`;
  }, [route.page]);
  const notify = useCallback((text, options = {}) => {
    clearTimeout(toastTimer.current);
    setToast({ text, ...options });
    toastTimer.current = setTimeout(
      () => setToast(null),
      options.error ? 12000 : 6000,
    );
  }, []);
  const mutate = useCallback(
    (fn) => {
      const task = queue.current
        .catch(() => {})
        .then(async () => {
          const next = reconcileCatalog(fn(current.current));
          await saveData(next);
          current.current = next;
          setData(next);
          return next;
        });
      queue.current = task;
      task.catch((e) => notify(e.message, { error: true }));
      return task;
    },
    [notify],
  );
  const go = useCallback((page, id) => {
    window.location.hash = `/${page}${id ? `/${encodeURIComponent(id)}` : ""}`;
  }, []);
  const openPanel = useCallback((value) => {
    setPanel(value);
    setMenu(false);
  }, []);
  const openInvoice = (id) => setPanel({ type: "invoiceDetail", id });
  const createInvoice = (objectId = "") => {
    const linked = [...data.requests, ...data.orders].some(
      (x) => x.id === objectId,
    );
    setPanel({
      type: "invoiceEditor",
      objectId: linked ? objectId : "",
      personId: data.people.some((p) => p.id === objectId) ? objectId : "",
    });
  };
  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await loadData();
      current.current = next;
      setData(next);
      setLoadError("");
      return next;
    } catch (e) {
      if (e.status === 401) {
        setData(null);
        setLoadError(e);
      } else notify(e.message, { error: true });
      throw e;
    } finally {
      setRefreshing(false);
    }
  };
  if (loadError)
    return (
      <Login
        error={loadError.status === 401 ? "" : loadError.message}
        onLogin={refresh}
      />
    );
  if (!data)
    return (
      <div className="startup" role="status">
        <img src="/brand/woodright-white.svg" alt="Woodright" />
        <p>Открываем рабочее пространство…</p>
        <div className="loading-bar" />
      </div>
    );
  const common = {
    data,
    mutate,
    notify,
    go,
    openPanel,
    openInvoice,
    createInvoice,
  };
  const groups = todayGroups(data),
    overdue = groups.find((g) => g.title === "Просрочено")?.items.length || 0;
  function nav(page, label, Icon, child = false) {
    return (
      <a
        className={`nav-item ${child ? "child" : ""} ${route.page === page ? "active" : ""}`}
        href={`#/${page}`}
        aria-label={label}
        aria-current={route.page === page ? "page" : undefined}
      >
        <Icon size={child ? 19 : 21} weight="light" />
        <span>{label}</span>
        {page === "today" && overdue > 0 && (
          <small className="nav-count">{overdue}</small>
        )}
      </a>
    );
  }
  const searchResults = search.trim()
    ? ["requests", "people", "orders", "products", "rooms"]
        .flatMap((kind) =>
          data[kind]
            .filter(
              (x) =>
                !x.archived &&
                `${x.id} ${x.title || x.name || x.number} ${x.payer || ""} ${x.sku || ""}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
            )
            .map((x) => ({
              ...x,
              title: kind === "invoices" ? `Счёт ${x.number}` : x.title,
              kind,
            })),
        )
        .slice(0, 20)
    : [];
  function activateSearch(r) {
    if (r.kind === "invoices") openInvoice(r.id);
    else if (r.kind === "files")
      openPanel({ type: "files", objectId: r.objectId, fileId: r.id });
    else {
      setPanel(null);
      go(r.kind, r.id);
    }
  }
  return (
    <div className={`shell density-${data.prefs.density}`}>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`sidebar ${mobileNav ? "open" : ""}`}
        aria-label="Основная навигация"
      >
        <a className="brand" href="#/today">
          <span className="brand-lockup">
            <img src="/brand/woodright-white.svg" alt="Woodright" />
            <span className="brand-os">OS</span>
          </span>
          <small>Рабочее пространство</small>
        </a>
        <nav>
          {nav("today", "Сегодня", CalendarBlank)}
          <div className="nav-group">
            <button
              className="nav-parent"
              aria-label="Продажи"
              onClick={() => setExpanded((x) => ({ ...x, sales: !x.sales }))}
              aria-expanded={expanded.sales}
            >
              <Users size={21} weight="light" />
              <span>Продажи</span>
              {expanded.sales ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </button>
            {expanded.sales && (
              <div>
                {nav("requests", "Обращения", ChatCircle, true)}
                {nav("people", "Люди", User, true)}
                {nav("companies", "Компании", Buildings, true)}
              </div>
            )}
          </div>
          <div className="nav-divider" />
          {nav("orders", "Заказы", Cube)}
          <div className="nav-group">
            <button
              className="nav-parent"
              aria-label="Документы"
              onClick={() =>
                setExpanded((x) => ({ ...x, documents: !x.documents }))
              }
              aria-expanded={expanded.documents}
            >
              <Receipt size={21} weight="light" />
              <span>Документы</span>
              {expanded.documents ? (
                <CaretUp size={14} />
              ) : (
                <CaretDown size={14} />
              )}
            </button>
            {expanded.documents && (
              <div>
                {nav("invoices", "Счета", Receipt, true)}
                {nav("files", "Файлы", Paperclip, true)}
              </div>
            )}
          </div>
          <div className="nav-divider" />
          <div className="nav-group">
            <button
              className="nav-parent"
              aria-label="Каталог"
              onClick={() =>
                setExpanded((x) => ({ ...x, catalog: !x.catalog }))
              }
              aria-expanded={expanded.catalog}
            >
              <BookOpen size={21} weight="light" />
              <span>Каталог</span>
              {expanded.catalog ? (
                <CaretUp size={14} />
              ) : (
                <CaretDown size={14} />
              )}
            </button>
            {expanded.catalog && (
              <div>
                {nav("products", "Товары", Armchair, true)}
                {nav("rooms", "Комнаты", House, true)}
              </div>
            )}
          </div>
          <div className="nav-divider" />
          {nav("storefront", "Витрина", Storefront)}
          {nav("integrations", "Интеграции", SlidersHorizontal)}
        </nav>
        <footer className="sidebar-footer">
          <button
            className="sidebar-help"
            aria-label="Помощь и возможности"
            onClick={() => openPanel({ type: "help" })}
          >
            <Question size={19} />
            <span>Помощь и возможности</span>
          </button>
          <button
            className="sidebar-profile"
            onClick={() => setMenu(!menu)}
            aria-expanded={menu}
          >
            <span className="avatar">
              {data.session.email.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <b>Woodright OS</b>
              <small>Рабочая база</small>
            </span>
            <CaretDown size={14} />
          </button>
        </footer>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <IconButton
            icon={List}
            label="Открыть меню"
            className="mobile-menu"
            onClick={() => setMobileNav(true)}
          />
          <span className="demo-label" title="Данные действующей Medusa">
            Medusa
          </span>
          <button
            className="global-search"
            onClick={() => {
              setSearch("");
              openPanel({ type: "search" });
            }}
          >
            <MagnifyingGlass size={20} weight="light" />
            <span>Найти обращение, клиента, заказ</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="topbar-actions">
            <IconButton
              icon={Bell}
              label="Вопросы, требующие внимания"
              onClick={() => openPanel({ type: "notifications" })}
            />
            <button
              className="topbar-profile"
              onClick={() => setMenu(!menu)}
              aria-label="Меню пользователя"
              aria-expanded={menu}
            >
              <span className="avatar">
                {data.session.email.slice(0, 2).toUpperCase()}
              </span>
              <CaretDown size={13} />
            </button>
          </div>
          {menu && (
            <>
              <button
                className="menu-dismiss"
                aria-label="Закрыть меню пользователя"
                onClick={() => setMenu(false)}
              />
              <div className="user-menu">
                <b>Woodright OS</b>
                <small>{data.session.email}</small>
                <button onClick={() => openPanel({ type: "settings" })}>
                  <SlidersHorizontal size={18} />
                  Рабочее пространство
                </button>
                <button onClick={() => openPanel({ type: "help" })}>
                  <Question size={18} />
                  Интеграции и возможности
                </button>
              </div>
            </>
          )}
        </header>
        <LiveNotice
          data={data}
          refresh={() => refresh().catch(() => {})}
          busy={refreshing}
        />
        <main
          id="main-content"
          className={
            route.page === "today"
              ? "page-content today-content"
              : "page-content"
          }
          key={`${route.page}/${route.id || ""}`}
        >
          <SourceGate page={route.page} data={data}>
            {route.page === "today" ? (
              <TodayView {...common} />
            ) : route.page === "integrations" ? (
              <Integrations data={data} />
            ) : route.page === "companies" ? (
              <div className="standard-page">
                <h1>Компании</h1>
                <Notice>
                  Модуль компаний существующей OS ещё не установлен в рабочем
                  контуре. Список появится после подключения CRM.
                </Notice>
              </div>
            ) : route.page === "files" ? (
              <Integrations data={data} focus="files" />
            ) : route.page === "invoices" ? (
              <Integrations data={data} focus="accounting" />
            ) : route.page === "storefront" ? (
              <ObjectList kind="products" {...common} />
            ) : route.id ? (
              <LiveObjectDetail
                key={`${route.page}/${route.id}`}
                kind={route.page}
                id={route.id}
                refresh={refresh}
                {...common}
              />
            ) : (
              <ObjectList kind={route.page} {...common} />
            )}
          </SourceGate>
        </main>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Быстрая навигация">
        <a
          href="#/today"
          aria-current={route.page === "today" ? "page" : undefined}
        >
          <CalendarBlank size={21} />
          Работа
        </a>
        <a
          href="#/requests"
          aria-current={route.page === "requests" ? "page" : undefined}
        >
          <Users size={21} />
          Продажи
        </a>
        <a
          href="#/orders"
          aria-current={route.page === "orders" ? "page" : undefined}
        >
          <Cube size={21} />
          Заказы
        </a>
        <a
          href="#/invoices"
          aria-current={route.page === "invoices" ? "page" : undefined}
        >
          <Receipt size={21} />
          Счета
        </a>
        <button onClick={() => setMobileNav(true)}>
          <List size={21} />
          Ещё
        </button>
      </nav>
      {panel?.type === "search" && (
        <Drawer
          title="Поиск по Woodright"
          kicker="Быстрый переход"
          onClose={() => setPanel(null)}
          wide
        >
          <div className="command-search">
            <MagnifyingGlass size={23} />
            <input
              autoFocus
              aria-label="Глобальный поиск"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && searchResults[0]) {
                  e.preventDefault();
                  activateSearch(searchResults[0]);
                }
              }}
              placeholder="Имя, номер, тема обращения или SKU"
            />
          </div>
          {search.trim() ? (
            searchResults.length ? (
              <div className="search-results">
                {searchResults.map((r) => (
                  <button
                    key={`${r.kind}/${r.id}`}
                    onClick={() => activateSearch(r)}
                  >
                    <span>
                      <small>
                        {NAV_NAMES[r.kind]} ·{" "}
                        {r.id.startsWith("WR") ? r.id : r.sku || ""}
                      </small>
                      <b>{r.title || r.name}</b>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Ничего не найдено"
                text="Попробуйте название, часть номера или SKU."
              />
            )
          ) : (
            <>
              <p className="muted search-hint">
                Поиск по загруженным обращениям, людям, заказам, товарам и
                комнатам.
              </p>
              <SectionQuick
                onCreate={(kind) => openPanel({ type: "create", kind })}
              />
            </>
          )}
        </Drawer>
      )}
      {panel && panel.type !== "search" && (
        <LivePanel panel={panel} data={data} onClose={() => setPanel(null)} />
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
function SectionQuick({ onCreate }) {
  return (
    <div className="quick-commands">
      <small>БЫСТРОЕ СОЗДАНИЕ</small>
      {[
        ["request", "Новое обращение"],
        ["person", "Добавить человека"],
        ["company", "Добавить компанию"],
      ].map(([kind, label]) => (
        <button key={kind} onClick={() => onCreate(kind)}>
          <Plus size={18} />
          {label}
          <ArrowRight size={16} />
        </button>
      ))}
    </div>
  );
}
