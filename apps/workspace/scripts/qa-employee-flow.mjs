// Native HTTP acceptance test. Production writes require the owner's explicit, named QA scope.
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile, unlink, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const roles = ["seller", "production", "accountant", "director", "god"];
export async function verifyEmployeeFlow(config) {
  const {
    base,
    backend,
    ownerEmail,
    ownerPassword,
    expectedEnvironment,
    reportPath,
    uiFile,
  } = config;
  const target = new URL(base),
    upstream = new URL(backend);
  const isolated =
    expectedEnvironment === "non_public_candidate" &&
    target.protocol === "http:" &&
    target.hostname === "127.0.0.1" &&
    target.pathname === "/os";
  const approvedLive =
    expectedEnvironment === "public_production" &&
    base === "https://woodright.ru/os" &&
    config.productionAuthorization === "OWNER_APPROVED_EMPLOYEE_FLOW_20261021";
  assert.ok(
    isolated || approvedLive,
    "explicit isolated test or exact owner-approved live QA required",
  );
  assert.ok(
    upstream.protocol === "http:" &&
      upstream.hostname === "127.0.0.1" &&
      !upstream.username &&
      !upstream.password,
  );
  assert.ok(ownerEmail && ownerPassword);
  if (uiFile)
    assert.match(
      uiFile,
      /^\/private\/tmp\/woodright-employee-flow-[\w-]+\.json$/,
    );
  const run = randomUUID(),
    planned = [],
    accounts = [],
    checks = [];
  const report = {
    scope: expectedEnvironment,
    run,
    at: new Date().toISOString(),
    checks,
    accounts: [],
    records: {},
    cleanup: {},
    state: "running",
  };
  let owner, companyId, personId, requestId, invoiceId;
  const protectedFiles = new Set();
  const attachments = [];
  async function api(path, { body, cookie, status = 200 } = {}) {
    const response = await fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        origin: target.origin,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(
      response.headers.get("content-type")?.includes("application/json"),
      `${path}: expected JSON, got ${response.status}`,
    );
    const value = await response.json();
    assert.equal(
      response.status,
      status,
      `${path}: ${value.message || response.status}`,
    );
    return { value, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  const login = async (email, password) =>
    (await api("/api/live/session", { body: { email, password } })).cookie;
  const snapshot = async (cookie) =>
    (await api("/api/live/data", { cookie })).value;
  const command = async (cookie, body, status = 200) =>
    (
      await api("/api/live/commands", {
        cookie,
        body: { ...body, key: body.key || randomUUID() },
        status,
      })
    ).value;
  const find = (data, kind, id) => {
    const row = data[kind].find((x) => x.id === id);
    assert.ok(row, `${kind} must contain persisted ${id}`);
    return row;
  };
  const pass = (step) => {
    checks.push({ step, status: "pass", at: new Date().toISOString() });
    console.log(`PASS ${step}`);
  };
  async function bytes(cookie, id, expected, status = 200) {
    const response = await fetch(`${base}/api/live/attachments/${id}`, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(response.status, status);
    if (status === 200)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), expected);
  }
  try {
    const nativeHealth = await fetch(backend + "/health", {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(nativeHealth.status, 200);
    assert.equal(
      nativeHealth.headers.get("x-woodright-runtime-role"),
      expectedEnvironment,
    );
    assert.equal(
      nativeHealth.headers.get("x-woodright-database-identity"),
      expectedEnvironment === "public_production"
        ? "public_production_db"
        : "non_public_candidate_db",
    );
    const health = (await api("/api/live/status")).value;
    assert.equal(health.connected, true);
    assert.equal(health.environment, expectedEnvironment);
    owner = await login(ownerEmail, ownerPassword);
    assert.ok(owner);
    const ownerSnapshot = await snapshot(owner);
    assert.equal(ownerSnapshot.access.role, "god");
    assert.equal(
      ownerSnapshot.identity.backendRevision,
      nativeHealth.headers.get("x-woodright-backend-source-sha"),
    );
    report.backendSource = ownerSnapshot.identity.backendRevision;
    for (const role of roles) {
      const email = `qa-${role}-20261021-${run.slice(0, 8)}@example.test`,
        password = randomBytes(24).toString("base64url");
      planned.push(email);
      const invitation = (
        await api("/api/live/team", {
          cookie: owner,
          body: { intent: "invite", email, role, temporary: true },
        })
      ).value;
      const token = decodeURIComponent(
        new URL(invitation.url).hash.split("/").at(-1),
      );
      assert.ok(token);
      const inspected = (
        await api("/api/live/join", { body: { intent: "inspect", token } })
      ).value;
      assert.equal(inspected.email, email);
      assert.equal(inspected.role, role);
      assert.ok(
        Date.parse(inspected.accessExpiresAt) > Date.now() &&
          Date.parse(inspected.accessExpiresAt) < Date.now() + 3601000,
        "QA access must expire within one hour",
      );
      const accepted = await api("/api/live/join", {
        body: {
          intent: "accept",
          token,
          name: `QA · ${role}`,
          password,
          role: "god",
        },
      });
      assert.ok(accepted.cookie);
      await api("/api/live/join", {
        body: { intent: "inspect", token },
        status: 401,
      });
      const cookie = await login(email, password),
        data = await snapshot(cookie);
      assert.equal(
        data.access.role,
        role,
        "role comes from the server invitation, never the acceptance body",
      );
      assert.ok(data.session.id);
      assert.equal(
        data.staff.find((s) => s.id === data.session.id).access.expiresAt,
        inspected.accessExpiresAt,
      );
      const account = { role, email, password, cookie, id: data.session.id };
      accounts.push(account);
      report.accounts.push({
        role,
        email,
        id: account.id,
        expiresAt: inspected.accessExpiresAt,
      });
    }
    pass(
      "five native invitations, one-use acceptance, independent sign-in and server-bound roles",
    );
    const byRole = Object.fromEntries(accounts.map((a) => [a.role, a]));
    const seller = byRole.seller,
      worker = byRole.production,
      director = byRole.director,
      accountant = byRole.accountant,
      god = byRole.god;
    companyId = `company_${run}`;
    personId = `lead_${run}`;
    requestId = `desk_${run}`;
    report.records = { companyId, personId, requestId };
    const companyName = `КОНТРОЛЬНАЯ ПРОВЕРКА · ${run.slice(0, 8)}`;
    await command(seller.cookie, {
      type: "company.create",
      id: companyId,
      company: { name: companyName, notes: `QA employee path ${run}` },
    });
    await command(seller.cookie, {
      type: "person.create",
      id: personId,
      person: {
        name: "Контрольный клиент · QA",
        email: `client-${run}@example.test`,
        comment: "Служебная проверка; не клиентский запрос",
      },
      ownership: { companyId, assigneeId: seller.id },
    });
    const create = {
      type: "request.create",
      id: requestId,
      title: `КОНТРОЛЬНОЕ ОБРАЩЕНИЕ · ${run.slice(0, 8)}`,
      description: "Проверка передачи спецификации между сотрудниками",
      dimensions: "120 × 80 см",
      materials: "Дуб · контрольная спецификация",
      personId,
      ownership: { companyId, assigneeId: seller.id },
      key: randomUUID(),
    };
    await command(seller.cookie, create);
    await command(seller.cookie, create);
    const sellerData = await snapshot(
      await login(seller.email, seller.password),
    );
    find(sellerData, "companies", companyId);
    find(sellerData, "requests", requestId);
    assert.equal(
      sellerData.requests.filter((r) => r.id === requestId).length,
      1,
    );
    find(await snapshot(director.cookie), "requests", requestId);
    find(await snapshot(accountant.cookie), "companies", companyId);
    pass(
      "seller creates company, contact and request; fresh sign-in and colleagues see committed records without duplicate retries",
    );
    const content = Buffer.from(
        `WOODRIGHT · employee flow\n${run}\nПриватная спецификация\n`,
      ),
      fileId = `desk_${randomUUID()}`;
    await command(seller.cookie, {
      type: "attachment.upload",
      id: fileId,
      entityType: "request",
      entityId: requestId,
      filename: "Контрольная спецификация.txt",
      visibility: "assigned",
      content: content.toString("base64"),
    });
    attachments.push(fileId);
    const list = (
      await api(
        `/api/live/attachments?entityType=request&entityId=${requestId}`,
        { cookie: seller.cookie },
      )
    ).value.attachments;
    assert.ok(list.some((f) => f.id === fileId));
    await bytes(director.cookie, fileId, content);
    await bytes(accountant.cookie, fileId, content);
    await bytes(undefined, fileId, null, 401);
    await bytes(worker.cookie, fileId, null, 403);
    assert.equal(
      (await snapshot(worker.cookie)).requests.some((r) => r.id === requestId),
      false,
    );
    pass(
      "private attachment persists byte-for-byte; colleagues can read it; anonymous and unassigned production access are refused",
    );
    const before = find(await snapshot(director.cookie), "requests", requestId);
    await command(director.cookie, {
      type: "record.update",
      id: requestId,
      entityType: "request",
      ownership: { companyId, assigneeId: worker.id },
      expectedVersion: before.assignmentVersion,
    });
    await command(
      seller.cookie,
      {
        type: "record.update",
        id: requestId,
        entityType: "request",
        ownership: { companyId, assigneeId: seller.id },
        expectedVersion: before.assignmentVersion,
      },
      409,
    );
    const workerData = await snapshot(
        await login(worker.email, worker.password),
      ),
      assigned = find(workerData, "requests", requestId);
    assert.equal(assigned.assigneeId, worker.id);
    assert.equal(assigned.budget, "");
    assert.equal(workerData.people.length, 0);
    await bytes(worker.cookie, fileId, content);
    const workerFiles = (
      await api("/api/live/files", { cookie: worker.cookie })
    ).value.attachments;
    assert.ok(workerFiles.some((f) => f.id === fileId));
    await command(
      worker.cookie,
      {
        type: "record.update",
        id: requestId,
        entityType: "request",
        ownership: { companyId, assigneeId: worker.id },
        expectedVersion: assigned.assignmentVersion,
      },
      403,
    );
    await command(
      worker.cookie,
      {
        type: "request.update",
        id: requestId,
        status: "paid",
        notes: "forbidden",
        expectedUpdatedAt: assigned.updatedAt,
      },
      403,
    );
    await command(
      accountant.cookie,
      {
        type: "request.update",
        id: requestId,
        status: "completed",
        notes: "forbidden",
        expectedUpdatedAt: assigned.updatedAt,
      },
      403,
    );
    await command(worker.cookie, {
      type: "request.update",
      id: requestId,
      status: "in_production",
      notes: `QA · производство приняло спецификацию ${run}`,
      expectedUpdatedAt: assigned.updatedAt,
    });
    for (const account of [seller, director, god])
      assert.match(
        find(await snapshot(account.cookie), "requests", requestId)
          .internalNotes,
        /производство приняло/,
      );
    pass(
      "director assigns production; stale assignment is refused; production sees its work and file, updates notes, and cannot confirm payment or reassign work",
    );
    const requestBefore = find(
      await snapshot(seller.cookie),
      "requests",
      requestId,
    );
    await command(seller.cookie, {
      type: "request.update",
      id: requestId,
      status: requestBefore.status,
      notes: requestBefore.internalNotes,
      expectedUpdatedAt: requestBefore.updatedAt,
      details: {
        comment: `КОНТРОЛЬНОЕ ОБРАЩЕНИЕ · ${run}\nУточнено после замера`,
        dimensions: "125 × 85 см",
        materials: "Дуб · уточнённая спецификация",
        budget: "Уточняется",
      },
    });
    assert.equal(
      find(await snapshot(director.cookie), "requests", requestId).dimensions,
      "125 × 85 см",
    );
    await command(
      worker.cookie,
      {
        type: "request.update",
        id: requestId,
        status: "in_production",
        notes: "Запрещённая спецификация",
        expectedUpdatedAt: requestBefore.updatedAt,
        details: { comment: "подмена", budget: "0" },
      },
      403,
    );
    invoiceId = `invoice_${run}`;
    report.records.invoiceId = invoiceId;
    const invoiceFields = {
      sourceType: "request",
      sourceId: requestId,
      companyId,
      payer: { type: "person", name: "КОНТРОЛЬНЫЙ ПЛАТЕЛЬЩИК · QA" },
      lines: [
        {
          name: "Контрольная позиция · QA",
          quantity: "2.5",
          unitPriceMinor: 1999,
        },
      ],
      notes: "Проверка общей базы; не выставленный счёт",
    };
    const draftCommand = {
      type: "invoice.create",
      id: invoiceId,
      invoice: invoiceFields,
      key: randomUUID(),
    };
    await command(seller.cookie, draftCommand);
    await command(seller.cookie, draftCommand);
    for (const account of [seller, accountant, director, god]) {
      const invoice = find(
        await snapshot(await login(account.email, account.password)),
        "invoices",
        invoiceId,
      );
      assert.equal(invoice.totalMinor, 4998);
      assert.equal(invoice.version, 1);
    }
    assert.equal((await snapshot(worker.cookie)).invoices.length, 0);
    await command(
      worker.cookie,
      {
        type: "invoice.create",
        id: `invoice_forbidden_${run}`,
        invoice: invoiceFields,
      },
      403,
    );
    const changedInvoice = await command(accountant.cookie, {
      type: "invoice.update",
      id: invoiceId,
      expectedVersion: 1,
      invoice: { ...invoiceFields, notes: "Уточнение бухгалтерии · QA" },
    });
    assert.equal(changedInvoice.result.invoice.version, 2);
    await command(
      seller.cookie,
      {
        type: "invoice.update",
        id: invoiceId,
        expectedVersion: 1,
        invoice: invoiceFields,
      },
      409,
    );
    const pdfId = `desk_${randomUUID()}`,
      pdf = Buffer.from(
        "%PDF-1.7\nCONTROL QA ONLY - not an accounting document\n%%EOF",
      );
    await command(accountant.cookie, {
      type: "attachment.upload",
      id: pdfId,
      entityType: "invoice",
      entityId: invoiceId,
      filename: "Контрольный документ QA.pdf",
      content: pdf.toString("base64"),
    });
    attachments.push(pdfId);
    await bytes(seller.cookie, pdfId, pdf);
    await bytes(director.cookie, pdfId, pdf);
    await bytes(worker.cookie, pdfId, null, 403);
    const privateId = `desk_${randomUUID()}`;
    await command(seller.cookie, {
      type: "attachment.upload",
      id: privateId,
      entityType: "request",
      entityId: requestId,
      filename: "Закрытое вложение QA.txt",
      visibility: "business",
      content: "YWJj",
    });
    attachments.push(privateId);
    await bytes(worker.cookie, privateId, null, 403);
    const scopedFiles = (
      await api("/api/live/files", { cookie: worker.cookie })
    ).value.attachments;
    assert.ok(!scopedFiles.some((f) => [pdfId, privateId].includes(f.id)));
    await command(
      seller.cookie,
      { type: "invoice.register", id: invoiceId },
      403,
    );
    // Synthetic accounting facts are accepted ONLY inside the disposable test database.
    if (isolated) {
      const registration = {
        type: "invoice.register",
        id: invoiceId,
        expectedVersion: 2,
        number: `QA-${run}`,
        documentDate: "2026-10-23",
        confirmedFrom1C: true,
        documentTotalMinor: 4998,
        attachmentId: pdfId,
      };
      await command(
        accountant.cookie,
        { ...registration, documentTotalMinor: 5000 },
        409,
      );
      await command(accountant.cookie, registration);
      protectedFiles.add(pdfId);
      assert.equal(
        find(await snapshot(director.cookie), "invoices", invoiceId).status,
        "registered",
      );
      await command(
        accountant.cookie,
        { type: "attachment.remove", id: pdfId },
        409,
      );
      await command(
        accountant.cookie,
        {
          type: "invoice.update",
          id: invoiceId,
          expectedVersion: 3,
          invoice: invoiceFields,
        },
        409,
      );
    }
    await command(seller.cookie, { type: "attachment.remove", id: privateId });
    await command(seller.cookie, { type: "attachment.restore", id: privateId });
    await bytes(director.cookie, privateId, Buffer.from("abc"));
    pass(
      "shared invoice drafts persist across independent sign-ins; stale writes fail; accounting PDF stays private; production cannot view finance; archived work files restore with exact bytes",
    );
    if (isolated)
      pass(
        "disposable-only manual 1C registration verifies total and PDF, protects registered document and refuses edits",
      );
    const oldCompany = find(
      await snapshot(accountant.cookie),
      "companies",
      companyId,
    );
    await command(accountant.cookie, {
      type: "company.update",
      id: companyId,
      expectedVersion: oldCompany.version,
      company: {
        name: companyName,
        legalName: "Контрольные реквизиты · QA",
        notes: `QA ${run}`,
      },
    });
    for (const account of [seller, director, god])
      assert.equal(
        find(await snapshot(account.cookie), "companies", companyId).legalName,
        "Контрольные реквизиты · QA",
      );
    for (const account of accounts.filter((a) => a.role !== "god")) {
      await api("/api/live/team", {
        cookie: account.cookie,
        body: {
          intent: "access.update",
          id: account.id,
          role: "god",
          enabled: true,
          expectedVersion: 1,
          key: randomUUID(),
        },
        status: 403,
      });
      const authResponse = await fetch(backend + "/auth/user/emailpass", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
        }),
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(authResponse.status, 200);
      const auth = await authResponse.json();
      const escape = await fetch(`${backend}/admin/users/${account.id}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${auth.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          metadata: {
            woodright_access: { role: "god", enabled: true, version: 99 },
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(escape.status, 403);
      assert.equal((await snapshot(account.cookie)).access.role, account.role);
    }
    pass(
      "accounting updates company details shared with colleagues; every ordinary role is denied self-promotion through both BFF and native Admin API",
    );
    const directorStaff = (await snapshot(god.cookie)).staff.find(
      (s) => s.id === director.id,
    );
    await api("/api/live/team", {
      cookie: god.cookie,
      body: {
        intent: "access.update",
        id: director.id,
        role: "seller",
        enabled: true,
        expectedVersion: directorStaff.access.version,
        key: randomUUID(),
      },
    });
    assert.equal((await snapshot(director.cookie)).access.role, "seller");
    await api("/api/live/team", {
      cookie: god.cookie,
      body: {
        intent: "access.update",
        id: director.id,
        role: "director",
        enabled: true,
        expectedVersion: directorStaff.access.version,
        key: randomUUID(),
      },
      status: 409,
    });
    const changed = (await snapshot(god.cookie)).staff.find(
      (s) => s.id === director.id,
    );
    await api("/api/live/team", {
      cookie: god.cookie,
      body: {
        intent: "access.update",
        id: director.id,
        role: "director",
        enabled: true,
        expectedVersion: changed.access.version,
        key: randomUUID(),
      },
    });
    await api("/api/live/team", {
      cookie: god.cookie,
      body: {
        intent: "access.update",
        id: god.id,
        role: "seller",
        enabled: true,
        expectedVersion: 1,
        key: randomUUID(),
      },
      status: 409,
    });
    const history = (
      await api(`/api/live/history?entityType=request&entityId=${requestId}`, {
        cookie: director.cookie,
      })
    ).value.events;
    assert.ok(history.some((e) => e.actor_id === seller.id));
    assert.ok(history.some((e) => e.actor_id === worker.id));
    report.file = {
      id: fileId,
      sha256: createHash("sha256").update(content).digest("hex"),
      size: content.length,
    };
    pass(
      "role changes affect existing sessions immediately, stale role edits fail, and history identifies the actual employees",
    );
    report.state = "checks_passed";
    if (uiFile) {
      await writeFile(
        uiFile,
        JSON.stringify({
          base,
          accounts: accounts.map(({ role, email, password }) => ({
            role,
            email,
            password,
          })),
          records: report.records,
        }),
        { mode: 0o600, flag: "wx" },
      );
      console.log(
        "WAITING_FOR_UI_REVIEW; profiles will close on input or after 15 minutes",
      );
      await new Promise((resolve) => {
        const finish = () => {
          clearTimeout(timer);
          clearInterval(probe);
          process.stdin.off("data", finish);
          process.stdin.pause();
          resolve();
        };
        const timer = setTimeout(finish, 15 * 60 * 1000);
        const probe = setInterval(
          () => access(uiFile + ".done").then(finish, () => {}),
          500,
        );
        process.stdin.once("data", finish);
      });
    }
  } catch (error) {
    report.state = "failed";
    report.failure = String(error.message);
    throw error;
  } finally {
    if (owner) {
      try {
        if (requestId) {
          const data = await snapshot(owner),
            row = data.requests.find((r) => r.id === requestId);
          if (row)
            await command(owner, {
              type: "request.update",
              id: requestId,
              status: "completed",
              notes: `КОНТРОЛЬНАЯ ПРОВЕРКА ЗАВЕРШЕНА · ${run}`,
              expectedUpdatedAt: row.updatedAt,
            });
        }
        if (invoiceId) {
          const row = (await snapshot(owner)).invoices.find(
            (i) => i.id === invoiceId,
          );
          if (row)
            await command(owner, {
              type: "invoice.archive",
              id: invoiceId,
              expectedVersion: row.version,
              archived: true,
            });
        }
        for (const id of attachments.filter((id) => !protectedFiles.has(id)))
          await command(owner, { type: "attachment.remove", id });
        if (companyId) {
          const row = (await snapshot(owner)).companies.find(
            (c) => c.id === companyId,
          );
          if (row)
            await command(owner, {
              type: "company.update",
              id: companyId,
              expectedVersion: row.version,
              company: {
                name: row.name,
                legalName: row.legalName,
                notes: `КОНТРОЛЬНАЯ ПРОВЕРКА ЗАВЕРШЕНА · ${run}`,
                status: "archived",
              },
            });
        }
        const staff = (await snapshot(owner)).staff;
        const pending = (await api("/api/live/team", { cookie: owner })).value
          .invitations;
        for (const invite of pending.filter((i) => planned.includes(i.email)))
          await api("/api/live/team", {
            cookie: owner,
            body: { intent: "revoke", id: invite.id },
          });
        for (const user of staff.filter((s) => planned.includes(s.email))) {
          await api("/api/live/team", {
            cookie: owner,
            body: {
              intent: "access.update",
              id: user.id,
              role: user.access.role,
              enabled: false,
              expectedVersion: user.access.version,
              key: randomUUID(),
            },
          });
        }
        for (const account of accounts) {
          await api("/api/live/data", { cookie: account.cookie, status: 401 });
          if (attachments.length)
            await bytes(account.cookie, attachments[0], null, 401);
          await api("/api/live/session", {
            body: { email: account.email, password: account.password },
            status: 401,
          });
        }
        report.cleanup = {
          disabledAccounts: staff
            .filter((s) => planned.includes(s.email))
            .map((s) => ({ id: s.id, email: s.email, role: s.access.role })),
          profilesDisabled: true,
          existingSessionsRefused: true,
          companyArchived: true,
          requestCompleted: true,
          attachmentsRemoved: protectedFiles.size === 0,
          registeredPdfRetainedInDisposableDatabase:
            isolated && protectedFiles.size > 0,
          invoiceArchived: Boolean(invoiceId),
        };
      } catch (error) {
        report.cleanup = { failed: String(error.message) };
        report.state = "cleanup_failed";
      }
    }
    if (uiFile) {
      await unlink(uiFile).catch(() => {});
      await unlink(uiFile + ".done").catch(() => {});
    }
    if (reportPath)
      await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", {
        mode: 0o600,
      });
    console.log(`EMPLOYEE_FLOW_RESULT ${report.state}`);
  }
  assert.equal(
    report.cleanup.profilesDisabled,
    true,
    "temporary access must be closed",
  );
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  await verifyEmployeeFlow({
    base: process.env.WOODRIGHT_EMPLOYEE_FLOW_URL,
    backend: process.env.WOODRIGHT_EMPLOYEE_FLOW_BACKEND,
    ownerEmail: process.env.WOODRIGHT_QA_OWNER_EMAIL,
    ownerPassword: process.env.WOODRIGHT_QA_OWNER_PASSWORD,
    expectedEnvironment: process.env.WOODRIGHT_EMPLOYEE_FLOW_ENVIRONMENT,
    productionAuthorization:
      process.env.WOODRIGHT_EMPLOYEE_FLOW_PRODUCTION_AUTHORIZATION,
    reportPath: process.env.WOODRIGHT_EMPLOYEE_FLOW_REPORT,
    uiFile: process.env.WOODRIGHT_EMPLOYEE_FLOW_UI_SESSION_FILE,
  });
