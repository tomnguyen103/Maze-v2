import { can } from "../player/can.js";

/**
 * @typedef {{
 *   listAdminUsers: () => Promise<unknown>,
 *   exportAdminUser: (userId: string) => Promise<unknown>,
 *   updateAdminRole: (userId: string, role: string) => Promise<unknown>,
 *   listAdminQuestions: () => Promise<unknown>,
 *   saveAdminQuestion: (questionId: string, draft: unknown) => Promise<unknown>,
 *   publishAdminQuestion: (questionId: string, version: number) => Promise<unknown>,
 *   deleteAdminQuestion: (questionId: string) => Promise<unknown>,
 *   getAdminMembership: (userId: string) => Promise<unknown>,
 *   issueAdminRefund: (userId: string) => Promise<unknown>,
 *   listAdminAudit: (before?: number | null) => Promise<unknown>,
 *   getAdminMetrics: () => Promise<unknown>,
 *   listDeadWebhooks: () => Promise<unknown>
 * }} AdminClient
 */

/**
 * @param {HTMLElement} root
 * @param {{
 *   access: unknown,
 *   client: AdminClient,
 *   data: Record<string, unknown>
 * }} options
 */
export function renderAdminWorkbench(root, { access, client, data }) {
  root.dataset.adminState = "allowed";
  root.innerHTML = `
    <a class="skip-link" href="#admin-main">Skip to the admin area</a>
    <header class="admin-command">
      <a class="wordmark" href="/" aria-label="Echo Maze home">Echo Maze</a>
      <div>
        <p class="admin-command__eyebrow">Staff workbench</p>
        <h1>Admin</h1>
      </div>
      <a class="admin-command__exit" href="/play">Return to Maze</a>
    </header>
    <div class="admin-layout">
      <nav class="admin-rail" aria-label="Admin tools"></nav>
      <main class="admin-main" id="admin-main">
        <header class="admin-intro">
          <p class="section-label">Operations field guide</p>
          <h2>Keep the Quest safe and moving.</h2>
          <p>Review people, questions, purchases, and delivery failures from one permission-aware workbench.</p>
          <p class="admin-role"></p>
        </header>
        <div class="admin-panels"></div>
        <p class="admin-toast" role="status" aria-live="polite"></p>
      </main>
    </div>
  `;
  text(root, ".admin-role", `Signed in as ${roleOf(access)}.`);
  const rail = required(root, ".admin-rail");
  const panels = required(root, ".admin-panels");

  if (can(access, "refunds:issue")) {
    addPanel(rail, panels, "metrics", "Operations pulse", (panel) =>
      renderMetrics(panel, data.metrics)
    );
  }
  if (can(access, "users:read")) {
    addPanel(rail, panels, "users", "Explorer directory", (panel) =>
      renderUsers(panel, data.users, {
        mayChangeRoles: can(access, "users:roles:write"),
        mayExport: can(access, "export:any")
      })
    );
  }
  if (can(access, "questions:read")) {
    addPanel(rail, panels, "questions", "Warden Question bank", (panel) =>
      renderQuestions(panel, data.questions, access)
    );
  }
  if (can(access, "refunds:issue")) {
    addPanel(rail, panels, "membership", "Membership support", (panel) =>
      renderMembership(panel)
    );
  }
  if (can(access, "audit:read")) {
    addPanel(rail, panels, "audit", "Audit trail", (panel) =>
      renderAudit(panel, data.audit)
    );
  }
  if (can(access, "webhooks:read")) {
    addPanel(rail, panels, "dead", "Dead deliveries", (panel) =>
      renderDeadDeliveries(panel, data.dead)
    );
  }

  root.addEventListener("click", (event) => {
    void handleClick(event, root, client);
  });
  root.addEventListener("submit", (event) => {
    void handleSubmit(event, root, client);
  });
}

/**
 * @param {HTMLElement} rail
 * @param {HTMLElement} panels
 * @param {string} id
 * @param {string} title
 * @param {(panel: HTMLElement) => void} render
 */
function addPanel(rail, panels, id, title, render) {
  const link = document.createElement("a");
  link.href = `#admin-${id}`;
  link.textContent = title;
  rail.append(link);

  const panel = document.createElement("section");
  panel.className = "admin-panel";
  panel.id = `admin-${id}`;
  panel.setAttribute("aria-labelledby", `admin-${id}-title`);
  const heading = document.createElement("h3");
  heading.id = `admin-${id}-title`;
  heading.textContent = title;
  panel.append(heading);
  render(panel);
  panels.append(panel);
}

/** @param {HTMLElement} panel @param {unknown} value */
function renderMetrics(panel, value) {
  const metrics = record(value, "metrics");
  if (!metrics) {
    panel.append(errorState("Operational counts could not be loaded."));
    return;
  }
  const grid = element("div", "admin-metrics");
  /** @type {[string, unknown][]} */
  const values = [
    ["Daily active Explorers", metrics.dailyActiveExplorers],
    ["Runs started today", metrics.runsStartedToday],
    ["Lifetime conversions", metrics.lifetimeConversions],
    ["Explorers", metrics.explorers],
    ["Active memberships", metrics.activeMemberships],
    ["Published questions", metrics.publishedQuestions],
    ["Dead deliveries", metrics.deadDeliveries]
  ];
  for (const [label, count] of values) {
    const card = element("article", "admin-metric");
    const number = element("strong");
    number.textContent = String(Number(count ?? 0));
    const caption = element("span");
    caption.textContent = label;
    card.append(number, caption);
    grid.append(card);
  }
  panel.append(grid);
}

/**
 * @param {HTMLElement} panel
 * @param {unknown} value
 * @param {{ mayChangeRoles: boolean, mayExport: boolean }} permissions
 */
function renderUsers(panel, value, { mayChangeRoles, mayExport }) {
  const users = list(value, "users");
  if (users === null) {
    panel.append(errorState("The Explorer directory could not be loaded."));
    return;
  }
  if (users.length === 0) {
    panel.append(emptyState("No Explorer accounts have reached this database."));
    return;
  }
  const table = tableWithHeaders([
    "Explorer",
    "Role",
    "Membership",
    "Actions"
  ]);
  const body = table.tBodies[0];
  for (const userValue of users) {
    const user = asRecord(userValue);
    const userId = String(user.userId ?? "");
    const row = body.insertRow();
    dataCell(row, "Explorer", String(user.username ?? userId));
    dataCell(row, "Role", String(user.role ?? "player"));
    dataCell(
      row,
      "Membership",
      String(user.membershipState ?? "none")
    );
    const action = row.insertCell();
    action.dataset.label = "Actions";
    const field = element("div", "admin-inline-action");
    if (mayChangeRoles) {
      const label = document.createElement("label");
      label.className = "visually-hidden";
      label.htmlFor = `role-${userId}`;
      label.textContent = `Role for ${String(user.username ?? userId)}`;
      const select = document.createElement("select");
      select.id = `role-${userId}`;
      select.dataset.roleUser = userId;
      for (const role of ["player", "moderator", "admin"]) {
        const option = document.createElement("option");
        option.value = role;
        option.textContent = role;
        option.selected = role === user.role;
        select.append(option);
      }
      const saveRoleButton = document.createElement("button");
      saveRoleButton.type = "button";
      saveRoleButton.dataset.saveRole = userId;
      saveRoleButton.textContent = "Save role";
      field.append(label, select, saveRoleButton);
    }
    if (mayExport) {
      const exportButton = button("Export data");
      exportButton.dataset.action = "export-user";
      exportButton.dataset.userId = userId;
      field.append(exportButton);
    }
    if (field.childElementCount > 0) {
      action.append(field);
    } else {
      action.textContent = "Read only";
    }
  }
  panel.append(table);
  if (asRecord(value).hasMore === true) {
    const notice = document.createElement("p");
    notice.textContent =
      "Showing the first 500 Explorers. Additional accounts are not shown in this directory.";
    panel.append(notice);
  }
}

/**
 * @param {HTMLElement} panel
 * @param {unknown} value
 * @param {unknown} access
 */
function renderQuestions(panel, value, access) {
  const questions = list(value, "questions");
  if (questions === null) {
    panel.append(errorState("The Warden Question bank could not be loaded."));
    return;
  }
  if (can(access, "questions:write")) {
    panel.append(questionEditor());
  }
  const stack = element("div", "admin-records");
  if (questions.length === 0) {
    stack.append(emptyState("No database questions yet. Save the first draft."));
  }
  for (const questionValue of questions) {
    const question = asRecord(questionValue);
    const versions = Array.isArray(question.versions)
      ? question.versions.map(asRecord)
      : [];
    const latest = versions[0] ?? {};
    const card = element("article", "admin-record");
    const header = element("div", "admin-record__header");
    const title = document.createElement("h4");
    title.textContent = String(question.id ?? "Unnamed question");
    const status = element("span", "admin-badge");
    status.textContent = String(latest.status ?? "no versions");
    header.append(title, status);
    const detail = document.createElement("p");
    detail.textContent = [
      question.levelId,
      question.difficultyBand,
      `slot ${Number(question.questionOrdinal ?? 0)}`
    ]
      .filter(Boolean)
      .join(" · ");
    const prompt = document.createElement("p");
    prompt.className = "admin-record__prompt";
    prompt.textContent = String(asRecord(latest.content).prompt ?? "");
    card.append(header, detail, prompt);
    const actions = element("div", "admin-record__actions");
    if (can(access, "questions:publish") && latest.version) {
      const publish = document.createElement("button");
      publish.type = "button";
      publish.dataset.action = "publish-question";
      publish.dataset.questionId = String(question.id ?? "");
      publish.dataset.version = String(latest.version);
      publish.textContent = "Publish version";
      actions.append(publish);
    }
    if (can(access, "questions:publish")) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "admin-danger";
      remove.dataset.action = "delete-question";
      remove.dataset.questionId = String(question.id ?? "");
      remove.textContent = "Delete";
      actions.append(remove);
    }
    if (actions.childElementCount > 0) {
      card.append(actions);
    }
    stack.append(card);
  }
  panel.append(stack);
}

function questionEditor() {
  const details = document.createElement("details");
  details.className = "admin-editor";
  const summary = document.createElement("summary");
  summary.textContent = "Write a new draft";
  const form = document.createElement("form");
  form.dataset.form = "question";
  const grid = element("div", "admin-form-grid");
  grid.append(
    field("Question id", "question-id", "text", "math-bright-01"),
    selectField("Quest Level", "question-level", [
      "bright-start",
      "trail-scout",
      "maze-master"
    ]),
    selectField("Difficulty band", "question-band", [
      "foundation",
      "developing",
      "capable",
      "advanced",
      "mastery"
    ]),
    field("Deck slot", "question-ordinal", "number", "0")
  );
  const contentField = element("div", "admin-field admin-field--wide");
  const label = document.createElement("label");
  label.htmlFor = "question-content";
  label.textContent = "Reviewed question JSON";
  const textarea = document.createElement("textarea");
  textarea.id = "question-content";
  textarea.name = "content";
  textarea.rows = 12;
  textarea.required = true;
  textarea.placeholder =
    '{"id":"math-bright-01","prompt":"...","choices":[...]}';
  const helper = element("p", "admin-helper");
  helper.textContent =
    "Use the same reviewed shape as the bundled Warden Question bank.";
  contentField.append(label, textarea, helper);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.className = "admin-primary";
  submit.textContent = "Save draft";
  form.append(grid, contentField, submit);
  details.append(summary, form);
  return details;
}

/** @param {HTMLElement} panel */
function renderMembership(panel) {
  const form = document.createElement("form");
  form.className = "admin-lookup";
  form.dataset.form = "membership";
  form.append(
    field("Explorer id", "membership-user", "text", "user_..."),
    button("Look up", "submit")
  );
  const result = element("div", "admin-support-result");
  result.dataset.membershipResult = "";
  result.append(emptyState("Enter an Explorer id to inspect membership state."));
  panel.append(form, result);
}

/** @param {HTMLElement} panel @param {unknown} value */
function renderAudit(panel, value) {
  const envelope = asRecord(value);
  const events = Array.isArray(envelope.events) ? envelope.events : null;
  if (events === null) {
    panel.append(errorState("The audit trail could not be loaded."));
    return;
  }
  const listElement = element("ol", "admin-audit");
  listElement.dataset.auditList = "";
  appendAuditEvents(listElement, events);
  panel.append(listElement);
  const before = Number(envelope.nextBefore);
  if (before > 0) {
    const more = button("Load older events");
    more.dataset.action = "load-audit";
    more.dataset.before = String(before);
    panel.append(more);
  }
}

/** @param {HTMLElement} target @param {unknown[]} events */
function appendAuditEvents(target, events) {
  if (events.length === 0 && target.childElementCount === 0) {
    const item = document.createElement("li");
    item.append(emptyState("No audit events have been recorded."));
    target.append(item);
    return;
  }
  for (const eventValue of events) {
    const event = asRecord(eventValue);
    const item = document.createElement("li");
    const action = document.createElement("strong");
    action.textContent = String(event.action ?? "unknown action");
    const detail = document.createElement("span");
    detail.textContent = `${String(event.actorId ?? "unknown")} · ${String(event.resourceType ?? "resource")}${event.resourceId ? `:${String(event.resourceId)}` : ""}`;
    const time = document.createElement("time");
    time.dateTime = String(event.createdAt ?? "");
    time.textContent = formatDate(event.createdAt);
    item.append(action, detail, time);
    target.append(item);
  }
}

/** @param {HTMLElement} panel @param {unknown} value */
function renderDeadDeliveries(panel, value) {
  const deliveries = list(value, "deliveries");
  if (deliveries === null) {
    panel.append(errorState("Dead deliveries could not be loaded."));
    return;
  }
  if (deliveries.length === 0) {
    panel.append(emptyState("No dead webhook deliveries. The retry inbox is clear."));
    return;
  }
  const table = tableWithHeaders([
    "Provider",
    "Event",
    "Attempts",
    "Last error",
    "Received"
  ]);
  for (const deliveryValue of deliveries) {
    const delivery = asRecord(deliveryValue);
    const row = table.tBodies[0].insertRow();
    dataCell(row, "Provider", String(delivery.provider ?? ""));
    dataCell(
      row,
      "Event",
      `${String(delivery.eventType ?? "")} · ${String(delivery.eventId ?? "")}`
    );
    dataCell(row, "Attempts", String(Number(delivery.attempts ?? 0)));
    dataCell(row, "Last error", String(delivery.lastError ?? "Unknown"));
    dataCell(row, "Received", formatDate(delivery.receivedAt));
  }
  panel.append(table);
}

/**
 * @param {Event} event
 * @param {HTMLElement} root
 * @param {AdminClient} client
 */
async function handleClick(event, root, client) {
  const buttonTarget =
    event.target instanceof Element ? event.target.closest("button") : null;
  if (!(buttonTarget instanceof HTMLButtonElement)) {
    return;
  }
  const userId = buttonTarget.dataset.saveRole;
  if (userId) {
    const select = [...root.querySelectorAll("[data-role-user]")].find(
      (candidate) =>
        candidate instanceof HTMLSelectElement &&
        candidate.dataset.roleUser === userId
    );
    if (select instanceof HTMLSelectElement) {
      await action(
        root,
        buttonTarget,
        () => client.updateAdminRole(userId, select.value),
        `Role saved for ${userId}.`
      );
    }
    return;
  }
  const actionName = buttonTarget.dataset.action;
  const questionId = buttonTarget.dataset.questionId ?? "";
  if (actionName === "publish-question") {
    await action(
      root,
      buttonTarget,
      () =>
        client.publishAdminQuestion(
          questionId,
          Number(buttonTarget.dataset.version)
        ),
      `${questionId} is published.`
    );
  } else if (
    actionName === "delete-question" &&
    window.confirm(`Delete ${questionId} and every version?`)
  ) {
    const result = await action(
      root,
      buttonTarget,
      () => client.deleteAdminQuestion(questionId),
      `${questionId} was deleted.`
    );
    if (result !== null) {
      buttonTarget.closest(".admin-record")?.remove();
    }
  } else if (actionName === "export-user") {
    const exportUser = buttonTarget.dataset.userId ?? "";
    const exported = await action(
      root,
      buttonTarget,
      () => client.exportAdminUser(exportUser),
      `Export prepared for ${exportUser}.`
    );
    if (exported !== null) {
      downloadJson(exported, `echo-maze-export-${exportUser}.json`);
    }
  } else if (actionName === "issue-refund") {
    const refundUser = buttonTarget.dataset.userId ?? "";
    if (
      window.confirm(
        `Issue the full Lifetime Membership refund for ${refundUser}?`
      )
    ) {
      await action(
        root,
        buttonTarget,
        () => client.issueAdminRefund(refundUser),
        "Refund started. Entitlement changes after Stripe confirms it."
      );
    }
  } else if (actionName === "load-audit") {
    const page = asRecord(
      await action(
        root,
        buttonTarget,
        () => client.listAdminAudit(Number(buttonTarget.dataset.before)),
        "Older audit events loaded."
      )
    );
    const listElement = root.querySelector("[data-audit-list]");
    if (listElement instanceof HTMLOListElement && Array.isArray(page.events)) {
      appendAuditEvents(listElement, page.events);
      const next = Number(page.nextBefore);
      if (next > 0) {
        buttonTarget.dataset.before = String(next);
      } else {
        buttonTarget.remove();
      }
    }
  }
}

/**
 * @param {Event} event
 * @param {HTMLElement} root
 * @param {AdminClient} client
 */
async function handleSubmit(event, root, client) {
  if (!(event.target instanceof HTMLFormElement)) {
    return;
  }
  const form = event.target;
  if (form.dataset.form === "membership") {
    event.preventDefault();
    const userId = String(new FormData(form).get("membership-user") ?? "").trim();
    const loaded = await action(root, submitter(form), () =>
      client.getAdminMembership(userId)
    );
    if (loaded === null) {
      return;
    }
    const result = asRecord(loaded);
    renderMembershipResult(root, asRecord(result.membership), userId);
  } else if (form.dataset.form === "question") {
    event.preventDefault();
    const values = new FormData(form);
    const questionId = String(values.get("question-id") ?? "").trim();
    let content;
    try {
      content = JSON.parse(String(values.get("content") ?? ""));
    } catch {
      announce(root, "Question JSON is not valid.");
      return;
    }
    await action(
      root,
      submitter(form),
      () =>
        client.saveAdminQuestion(questionId, {
          levelId: String(values.get("question-level") ?? ""),
          difficultyBand: String(values.get("question-band") ?? ""),
          questionOrdinal: Number(values.get("question-ordinal")),
          content
        }),
      `${questionId} draft saved.`
    );
  }
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, unknown>} membership
 * @param {string} userId
 */
function renderMembershipResult(root, membership, userId) {
  const target = root.querySelector("[data-membership-result]");
  if (!(target instanceof HTMLElement)) {
    return;
  }
  target.replaceChildren();
  if (!membership.userId) {
    target.append(emptyState("No membership record exists for that Explorer."));
    return;
  }
  const title = document.createElement("h4");
  title.textContent = userId;
  const state = document.createElement("p");
  state.textContent = `Entitlement: ${String(membership.membershipState ?? "none")} · Purchase: ${String(membership.purchaseStatus ?? "none")}`;
  target.append(title, state);
  if (
    membership.membershipState === "active" &&
    membership.purchaseStatus === "paid"
  ) {
    const refund = button("Issue full refund");
    refund.className = "admin-danger";
    refund.dataset.action = "issue-refund";
    refund.dataset.userId = userId;
    target.append(refund);
  }
}

/**
 * @param {HTMLElement} root
 * @param {HTMLButtonElement} control
 * @param {() => Promise<unknown>} run
 * @param {string} [success]
 */
async function action(root, control, run, success = "") {
  control.disabled = true;
  control.setAttribute("aria-busy", "true");
  try {
    const result = await run();
    announce(root, success);
    return result;
  } catch (error) {
    announce(
      root,
      error instanceof Error ? error.message : "That admin action failed."
    );
    return null;
  } finally {
    control.disabled = false;
    control.removeAttribute("aria-busy");
  }
}

/** @param {unknown} value @param {string} filename */
function downloadJson(value, filename) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 0);
}

/** @param {HTMLElement} root @param {string} message */
function announce(root, message) {
  text(root, ".admin-toast", message);
}

/** @param {HTMLFormElement} form */
function submitter(form) {
  const control = form.querySelector("button[type='submit']");
  if (!(control instanceof HTMLButtonElement)) {
    throw new Error("Admin form is missing its submit button.");
  }
  return control;
}

/**
 * @param {string} labelText
 * @param {string} name
 * @param {string} type
 * @param {string} placeholder
 */
function field(labelText, name, type, placeholder) {
  const wrapper = element("div", "admin-field");
  const label = document.createElement("label");
  label.htmlFor = name;
  label.textContent = labelText;
  const input = document.createElement("input");
  input.id = name;
  input.name = name;
  input.type = type;
  input.placeholder = placeholder;
  input.required = true;
  if (type === "number") {
    input.min = "0";
    input.step = "1";
    input.value = "0";
  }
  wrapper.append(label, input);
  return wrapper;
}

/**
 * @param {string} labelText
 * @param {string} name
 * @param {string[]} options
 */
function selectField(labelText, name, options) {
  const wrapper = element("div", "admin-field");
  const label = document.createElement("label");
  label.htmlFor = name;
  label.textContent = labelText;
  const select = document.createElement("select");
  select.id = name;
  select.name = name;
  for (const value of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  }
  wrapper.append(label, select);
  return wrapper;
}

/** @param {string[]} labels */
function tableWithHeaders(labels) {
  const table = document.createElement("table");
  table.className = "admin-table";
  const head = table.createTHead().insertRow();
  for (const label of labels) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    head.append(cell);
  }
  table.createTBody();
  return table;
}

/**
 * @param {HTMLTableRowElement} row
 * @param {string} label
 * @param {string} value
 */
function dataCell(row, label, value) {
  const cell = row.insertCell();
  cell.dataset.label = label;
  cell.textContent = value;
}

/** @param {string} message */
function emptyState(message) {
  const state = element("p", "admin-empty");
  state.textContent = message;
  return state;
}

/** @param {string} message */
function errorState(message) {
  const state = element("p", "admin-error");
  state.setAttribute("role", "alert");
  state.textContent = message;
  return state;
}

/**
 * @param {string} label
 * @param {"button" | "reset" | "submit"} [type]
 */
function button(label, type = "button") {
  const result = document.createElement("button");
  result.type = type;
  result.textContent = label;
  return result;
}

/** @param {string} tagName @param {string} [className] */
function element(tagName, className = "") {
  const result = document.createElement(tagName);
  result.className = className;
  return result;
}

/** @param {HTMLElement} root @param {string} selector */
function required(root, selector) {
  const result = root.querySelector(selector);
  if (!(result instanceof HTMLElement)) {
    throw new Error(`Admin view is missing ${selector}.`);
  }
  return result;
}

/**
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {string} value
 */
function text(root, selector, value) {
  const target = root.querySelector(selector);
  if (target) {
    target.textContent = value;
  }
}

/** @param {unknown} value @param {string} key */
function list(value, key) {
  const result = asRecord(value)[key];
  return Array.isArray(result) ? result : null;
}

/** @param {unknown} value @param {string} key */
function record(value, key) {
  const result = asRecord(value)[key];
  return result && typeof result === "object" && !Array.isArray(result)
    ? asRecord(result)
    : null;
}

/** @param {unknown} value */
function asRecord(value) {
  return value && typeof value === "object"
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {unknown} access */
function roleOf(access) {
  return String(asRecord(access).role ?? "staff");
}

/** @param {unknown} value */
function formatDate(value) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.valueOf())
    ? "Unknown time"
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(date);
}
