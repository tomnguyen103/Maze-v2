import { can } from "../player/can.js";
import { describeEchoLensVisual } from "../questions/echo-lens-presentation.js";
import { normalizeQuestion } from "../questions/question-contract.js";
import { renderAdminShell } from "./admin-shell.js";
import {
  THEME_CHOICES,
  applyThemeChoice,
  isThemeChoice,
  readThemeChoice
} from "../player/theme.js";

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
 * One entry per tool. `permission` gates whether a signed-in staff member
 * gets a nav link for it at all; `fetch` is the dataset that tool needs,
 * requested only when its panel becomes current — not eagerly for all six
 * on every load (SHELL-04). Membership support has no eager dataset; it is
 * a lookup form.
 *
 * @type {{
 *   id: string,
 *   title: string,
 *   permission: string,
 *   fetch: ((client: AdminClient) => Promise<unknown>) | null,
 *   render: (panel: HTMLElement, value: unknown, access: unknown) => void
 * }[]}
 */
const PANEL_DEFS = [
  {
    id: "metrics",
    title: "Operations pulse",
    permission: "refunds:issue",
    fetch: (client) => client.getAdminMetrics(),
    render: (panel, value) => renderMetrics(panel, value)
  },
  {
    id: "users",
    title: "Explorer directory",
    permission: "users:read",
    fetch: (client) => client.listAdminUsers(),
    render: (panel, value, access) =>
      renderUsers(panel, value, {
        mayChangeRoles: can(access, "users:roles:write"),
        mayExport: can(access, "export:any")
      })
  },
  {
    id: "questions",
    title: "Warden Question bank",
    permission: "questions:read",
    fetch: (client) => client.listAdminQuestions(),
    render: (panel, value, access) => renderQuestions(panel, value, access)
  },
  {
    id: "membership",
    title: "Membership support",
    permission: "refunds:issue",
    fetch: null,
    render: (panel) => renderMembership(panel)
  },
  {
    id: "audit",
    title: "Audit trail",
    permission: "audit:read",
    fetch: (client) => client.listAdminAudit(),
    render: (panel, value) => renderAudit(panel, value)
  },
  {
    id: "dead",
    title: "Dead deliveries",
    permission: "webhooks:read",
    fetch: (client) => client.listDeadWebhooks(),
    render: (panel, value) => renderDeadDeliveries(panel, value)
  },
  {
    // Every staff member who reaches the workbench already holds
    // audit:read — resolveAdminAccess gates the whole route on it — so this
    // is the "no specific tool permission" slot, not actually restricted.
    id: "settings",
    title: "Appearance",
    permission: "audit:read",
    fetch: null,
    render: (panel) => renderAppearanceSettings(panel)
  }
];

/** @param {HTMLElement} panel */
function renderAppearanceSettings(panel) {
  const current = readThemeChoice();
  const fieldset = element("fieldset", "admin-field");
  const legend = document.createElement("legend");
  legend.textContent = "Theme";
  fieldset.append(legend);
  const labels = { system: "System", light: "Light", dark: "Dark" };
  for (const choice of THEME_CHOICES) {
    const label = document.createElement("label");
    label.className = "admin-appearance-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "admin-theme";
    input.value = choice;
    input.checked = choice === current;
    const span = document.createElement("span");
    span.textContent = labels[choice];
    label.append(input, span);
    fieldset.append(label);
  }
  fieldset.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && isThemeChoice(target.value)) {
      applyThemeChoice(target.value);
    }
  });
  panel.append(fieldset);
}

/**
 * @param {HTMLElement} root
 * @param {{
 *   access: unknown,
 *   client: AdminClient
 * }} options
 */
export async function renderAdminWorkbench(root, { access, client }) {
  const { main, rail: railElement } = renderAdminShell(root, {
    state: "allowed",
    eyebrow: "Staff workbench",
    exit: { href: "/play", label: "Return to Maze" },
    withRail: true
  });
  main.innerHTML = `
    <header class="admin-intro">
      <p class="section-label">Operations field guide</p>
      <h2>Keep the Quest safe and moving.</h2>
      <p>Review people, questions, purchases, and delivery failures from one permission-aware workbench.</p>
      <p class="admin-role"></p>
    </header>
    <div class="admin-panels"></div>
    <p class="admin-toast" role="status" aria-live="polite"></p>
  `;
  text(root, ".admin-role", `Signed in as ${roleOf(access)}.`);
  const rail = /** @type {HTMLElement} */ (railElement);
  const panelsContainer = required(root, ".admin-panels");
  const permitted = PANEL_DEFS.filter((def) => can(access, def.permission));
  /** @type {Map<string, unknown>} */
  const cache = new Map();
  /** @type {Map<string, Promise<unknown>>} */
  const inFlight = new Map();
  /** @type {string | null} */
  let currentId = null;

  for (const def of permitted) {
    const link = document.createElement("a");
    link.href = `/admin?panel=${def.id}`;
    link.textContent = def.title;
    link.dataset.panelLink = def.id;
    link.addEventListener("click", (event) => {
      // A modified click (new tab, download, etc.) keeps the browser's own
      // handling; only a plain left click becomes in-app navigation.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      void selectPanel(def.id, { pushHistory: true });
    });
    rail.append(link);
  }

  /**
   * @param {string} id
   * @param {{ pushHistory: boolean }} options
   */
  async function selectPanel(id, { pushHistory }) {
    const def = permitted.find((candidate) => candidate.id === id);
    if (!def) {
      return;
    }
    // Re-clicking the nav link for the panel already showing re-renders it
    // (a legitimate retry after a failed fetch) but does not push a second,
    // identical history entry the back button would have to click through.
    const isSamePanel = id === currentId;
    currentId = id;
    for (const link of rail.querySelectorAll("a")) {
      if (link instanceof HTMLAnchorElement) {
        if (link.dataset.panelLink === id) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      }
    }
    if (pushHistory && !isSamePanel) {
      const url = new URL(window.location.href);
      url.searchParams.set("panel", id);
      window.history.pushState({}, "", url);
    }

    panelsContainer.innerHTML = "";
    const panel = document.createElement("section");
    panel.className = "admin-panel";
    panel.id = `admin-${id}`;
    panel.setAttribute("aria-labelledby", `admin-${id}-title`);
    const heading = document.createElement("h3");
    heading.id = `admin-${id}-title`;
    heading.textContent = def.title;
    panel.append(heading);
    const content = element("div", "admin-panel__content");
    panel.append(content);
    panelsContainer.append(panel);

    if (!def.fetch) {
      def.render(content, undefined, access);
      return;
    }
    if (cache.has(id)) {
      def.render(content, cache.get(id), access);
      return;
    }
    panel.setAttribute("aria-busy", "true");
    content.append(emptyState("Loading…"));
    // A rapid double-click on the same still-loading nav link would
    // otherwise start a second, redundant fetch; both would resolve
    // correctly, but only one needs to run.
    let request = inFlight.get(id);
    if (!request) {
      request = def.fetch(client);
      inFlight.set(id, request);
      // A second, independent consumer of the same promise: rejection is
      // already handled at the `await request` below, but that does not
      // stop *this* chain from reporting its own unhandled rejection.
      void request.catch(() => {}).finally(() => inFlight.delete(id));
    }
    let value;
    try {
      value = await request;
      cache.set(id, value);
    } catch {
      value = null;
    }
    // The Explorer may have already navigated elsewhere while this was in
    // flight; a stale response has nowhere correct left to render.
    if (!panelsContainer.contains(panel)) {
      return;
    }
    panel.removeAttribute("aria-busy");
    content.innerHTML = "";
    if (value === null) {
      content.append(errorState(`${def.title} could not be loaded.`));
      return;
    }
    def.render(content, value, access);
  }

  window.addEventListener("popstate", () => {
    const requested = new URL(window.location.href).searchParams.get(
      "panel"
    );
    if (permitted.some((def) => def.id === requested)) {
      void selectPanel(/** @type {string} */ (requested), {
        pushHistory: false
      });
    }
  });

  const requested = new URL(window.location.href).searchParams.get("panel");
  const initial = permitted.some((def) => def.id === requested)
    ? /** @type {string} */ (requested)
    : permitted[0]?.id;
  if (initial) {
    await selectPanel(initial, { pushHistory: false });
  }

  root.addEventListener("click", (event) => {
    void handleClick(event, root, client);
  });
  root.addEventListener("submit", (event) => {
    void handleSubmit(event, root, client);
  });
}

/**
 * DASH-01: seven identical tiles, no comparison, no primacy, one metrics
 * bag with no dictionary. "Runs started today" — the tool's own name is
 * "Operations pulse" — is the hero: bigger, first, the only tile besides
 * Daily active Explorers with a real vs-yesterday delta, because those are
 * the only two metrics this query has ever computed as period-scoped
 * counts rather than running totals. The other five are lifetime/current
 * snapshots and say so instead of pretending to a trend they don't have.
 *
 * @param {HTMLElement} panel @param {unknown} value
 */
function renderMetrics(panel, value) {
  const metrics = record(value, "metrics");
  if (!metrics) {
    panel.append(errorState("Operational counts could not be loaded."));
    return;
  }
  const grid = element("div", "admin-metrics");
  grid.append(
    metricTile("Runs started today", metrics.runsStartedToday, {
      hero: true,
      comparedTo: metrics.runsStartedYesterday,
      grain: "Today"
    }),
    metricTile(
      "Daily active Explorers",
      metrics.dailyActiveExplorers,
      { comparedTo: metrics.dailyActiveExplorersYesterday, grain: "Today" }
    ),
    metricTile("Explorers", metrics.explorers, { grain: "All-time" }),
    metricTile("Active memberships", metrics.activeMemberships, {
      grain: "Current"
    }),
    metricTile("Lifetime conversions", metrics.lifetimeConversions, {
      grain: "All-time"
    }),
    metricTile("Published questions", metrics.publishedQuestions, {
      grain: "Current"
    }),
    metricTile("Dead deliveries", metrics.deadDeliveries, {
      grain: "Current"
    })
  );
  panel.append(grid);
}

/**
 * @param {string} label
 * @param {unknown} rawValue
 * @param {{ hero?: boolean, comparedTo?: unknown, grain: string }} options
 */
function metricTile(label, rawValue, { hero = false, comparedTo, grain }) {
  const value = Number(rawValue ?? 0);
  const card = element(
    "article",
    hero ? "admin-metric admin-metric--hero" : "admin-metric"
  );
  const number = element("strong");
  number.textContent = value.toLocaleString("en-US");
  const caption = element("span", "admin-metric__caption");
  caption.textContent = label;
  const grainLabel = element("small", "admin-metric__grain");
  grainLabel.textContent = grain;
  card.append(number, caption, grainLabel);
  if (comparedTo !== undefined) {
    const previous = Number(comparedTo ?? 0);
    const delta = value - previous;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const deltaEl = element(
      "span",
      `admin-metric__delta admin-metric__delta--${direction}`
    );
    deltaEl.textContent = `${delta > 0 ? "+" : ""}${delta.toLocaleString("en-US")} vs yesterday (${previous.toLocaleString("en-US")})`;
    card.append(deltaEl);
  }
  return card;
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
    const content = asRecord(latest.content);
    const prompt = document.createElement("p");
    prompt.className = "admin-record__prompt";
    prompt.textContent = String(content.prompt ?? "");
    card.append(header, detail, prompt);
    const echoLensPreview = renderEchoLensPreview(content);
    if (echoLensPreview) {
      card.append(echoLensPreview);
    }
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

/** @param {Record<string, unknown>} content */
function renderEchoLensPreview(content) {
  if (!content.echoLens || !content.reviewedRevisionId) {
    return null;
  }
  try {
    const question = normalizeQuestion(content);
    if (!question.echoLens) {
      return null;
    }
    const details = element("details", "admin-lens-preview");
    details.dataset.echoLensPreview = "";
    const summary = document.createElement("summary");
    summary.textContent = "Preview Echo Lens";
    const title = document.createElement("strong");
    title.textContent = question.echoLens.title;
    const reasoning = document.createElement("p");
    reasoning.textContent = question.echoLens.reasoning;
    const steps = document.createElement("ol");
    for (const step of question.echoLens.steps) {
      const item = document.createElement("li");
      item.textContent = step;
      steps.append(item);
    }
    const visual = document.createElement("p");
    visual.className = "admin-helper";
    visual.textContent = describeEchoLensVisual(question.echoLens);
    details.append(summary, title, reasoning, steps, visual);
    return details;
  } catch {
    return null;
  }
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
    "Use the bundled Warden Question shape. Omit reviewedRevisionId; the server assigns the new immutable revision.";
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
