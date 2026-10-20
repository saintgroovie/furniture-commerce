import React, { useEffect, useRef } from "react";
import {
  X,
  ArrowRight,
  CheckCircle,
  WarningCircle,
  FolderOpen,
  Info,
  CaretRight,
} from "@phosphor-icons/react";
export function Button({
  children,
  variant = "primary",
  className = "",
  icon: Icon,
  ...props
}) {
  return (
    <button
      className={`btn ${variant} ${className}`}
      aria-label={typeof children === "string" ? children : undefined}
      {...props}
    >
      {Icon && <Icon size={18} />}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({ icon: Icon, label, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={20} />
    </button>
  );
}
export function Badge({ children, tone = "neutral" }) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Empty({ title = "Здесь пока ничего нет", text, action }) {
  return (
    <div className="empty">
      <FolderOpen size={30} weight="light" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Field({ label, hint, error, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && <small className="error-text">{error}</small>}
    </label>
  );
}
export function Notice({ children, tone = "info" }) {
  return (
    <div className={`notice ${tone}`}>
      <Info size={19} />
      <div>{children}</div>
    </div>
  );
}
export function Section({ title, action, children, className = "" }) {
  return (
    <section className={`section ${className}`}>
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Timeline({ items = [] }) {
  return items.length ? (
    <div className="timeline">
      {[...items]
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((item) => (
          <div key={item.id} className="timeline-item">
            <span className="timeline-dot" />
            <div>
              <small>
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Moscow",
                }).format(new Date(item.at))}{" "}
                · {item.author || "Менеджер"}
              </small>
              <b>{item.kind}</b>
              <p>{item.text}</p>
            </div>
          </div>
        ))}
    </div>
  ) : (
    <p className="muted small">События появятся после первого изменения.</p>
  );
}
export function Drawer({
  title,
  kicker,
  children,
  onClose,
  wide = false,
  dirty = false,
}) {
  const ref = useRef(null),
    oldFocus = useRef(document.activeElement),
    currentDirty = useRef(dirty),
    currentClose = useRef(onClose);
  currentDirty.current = dirty;
  currentClose.current = onClose;
  function close() {
    if (
      !currentDirty.current ||
      window.confirm("Есть несохранённые изменения. Закрыть без сохранения?")
    )
      currentClose.current();
  }
  useEffect(() => {
    const el = ref.current,
      focusables = () =>
        [
          ...el.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]',
          ),
        ].filter((x) => x.getClientRects().length);
    if ([...document.querySelectorAll('[role="dialog"]')].at(-1) === el)
      (
        el.querySelector('input:not([type="file"]),textarea,select') ||
        focusables()[0] ||
        el
      ).focus();
    const key = (e) => {
      if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== el)
        return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        close();
      }
      if (e.key === "Tab") {
        const fs = focusables(),
          first = fs[0],
          last = fs.at(-1);
        if (!fs.length) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      const top = [...document.querySelectorAll('[role="dialog"]')]
        .filter((x) => x !== el)
        .at(-1);
      if (top) {
        if (top.contains(oldFocus.current)) oldFocus.current.focus();
        else
          (
            top.querySelector(
              'input:not([type="file"]),select,textarea,button',
            ) || top
          ).focus();
      } else if (oldFocus.current?.isConnected) oldFocus.current.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        className={`drawer ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
        tabIndex={-1}
      >
        <header className="drawer-header">
          <div>
            {kicker && <span className="eyebrow">{kicker}</span>}
            <h2 id="drawer-title">{title}</h2>
          </div>
          <IconButton icon={X} label="Закрыть панель" onClick={close} />
        </header>
        <div className="drawer-body">{children}</div>
      </section>
    </div>
  );
}
export function PageHeading({ title, kicker, description, action, back }) {
  return (
    <header className="page-heading">
      <div>
        {back && (
          <button className="text-button back" onClick={back.onClick}>
            {back.label}
          </button>
        )}
        {kicker && <span className="eyebrow">{kicker}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="heading-actions">{action}</div>}
    </header>
  );
}
export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function ContextLink({ icon: Icon, label, count, onClick }) {
  return (
    <button className="context-link" onClick={onClick}>
      <Icon size={22} weight="light" />
      <span>
        {label}
        {count !== undefined && <small> · {count}</small>}
      </span>
      <CaretRight size={16} />
    </button>
  );
}
export function Definition({ items }) {
  return (
    <dl className="definition">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value || <span className="muted">Не указано</span>}</dd>
        </div>
      ))}
    </dl>
  );
}
export function FormError({ children }) {
  return children ? (
    <div className="form-error" role="alert">
      <WarningCircle size={20} />
      {children}
    </div>
  ) : null;
}
export function Toast({ toast, onClose }) {
  return toast ? (
    <div
      className={`toast ${toast.error ? "error" : ""}`}
      role={toast.error ? "alert" : "status"}
    >
      {toast.error ? <WarningCircle size={20} /> : <CheckCircle size={20} />}
      <span>{toast.text}</span>
      {toast.action && (
        <button onClick={toast.action.onClick}>{toast.action.label}</button>
      )}
      <IconButton icon={X} label="Закрыть уведомление" onClick={onClose} />
    </div>
  ) : null;
}
