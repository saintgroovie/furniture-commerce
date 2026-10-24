import React from "react";
import { Badge, Button, Notice, Section } from "./ui.jsx";
import { roleHelp } from "./role-help.mjs";
import "./role-help.css";

export function RoleHelp({ data, go, onClose }) {
  const guide = roleHelp(data.access?.role);
  const open = (page) => { onClose(); go(page); };
  if (!guide) return <Notice>Не удалось определить рабочую роль. Обновите страницу или обратитесь к полному администратору.</Notice>;
  return (
    <div className="role-guide">
      <p><Badge>{guide.title}</Badge></p>
      <p className="muted">Памятка для вашей текущей роли. Все рабочие записи сохраняются в общей базе; доступ зависит от роли и назначения.</p>
      {guide.sections.map(([title, text, page]) => (
        <Section key={title} title={title}>
          <p>{text}</p>
          {page && data.access?.pages?.includes(page) && <Button variant="secondary" aria-label={`Открыть раздел: ${title}`} onClick={() => open(page)}>Открыть раздел</Button>}
        </Section>
      ))}
      <Section title="Приглашения сотрудников"><p>{guide.invitations}</p></Section>
      <details className="role-guide-common">
        <summary>Вход, сохранение и совместная работа</summary>
        <Section title="Вход и выход"><p>Откройте os.woodright.ru и войдите со своим email и личным паролем. Новый сотрудник сначала открывает ссылку-приглашение и задаёт пароль. Для выхода: меню пользователя справа вверху → «Рабочее пространство» → «Выйти».</p></Section>
        <Section title="Сохранение изменений"><p>Дождитесь подтверждения сохранения или загрузки файла. Чтобы увидеть изменения коллеги, нажмите «Обновить». Если запись уже изменена другим сотрудником, обновите карточку и внесите правку заново.</p></Section>
        <Section title="Куда прикреплять файл"><p>Откройте доступную вашей роли карточку, выберите файл и нажмите «Прикрепить». Документ появится у сотрудников с подходящими правами; само прикрепление не меняет назначение ответственного.</p></Section>
      </details>
    </div>
  );
}
