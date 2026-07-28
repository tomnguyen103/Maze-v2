import "./classroom.css";
import { createClerkBrowser } from "../player/clerk-browser.js";
import { createPlayerApiClient } from "../player/player-client.js";
import {
  clearSelectedClassroom,
  loadSelectedClassroom,
  saveSelectedClassroom
} from "./classroom-selection.js";

const CLASSROOM_ID_PATTERN = /^org_[A-Za-z0-9_-]{3,120}$/;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   role: "teacher" | "student"
 * }} Classroom
 */

/**
 * @param {HTMLElement} root
 * @param {{
 *   clerk?: {
 *     initialize: () => Promise<boolean>,
 *     getToken: () => Promise<string | null>,
 *     user: { id?: string } | null,
 *     openSignIn: () => Promise<boolean>,
 *     openSignUp: () => Promise<boolean>,
 *     signOut: () => Promise<void>
 *   },
 *   client?: {
 *     listClassrooms: () => Promise<{ classrooms?: unknown }>,
 *     createClassroom: (name: string) => Promise<{
 *       classroom: { id: string, name: string }
 *     }>,
     *     getClassroomProgress: (classroomId: string) => Promise<{
     *       progress?: Record<string, unknown>[],
     *       truncated?: boolean
     *     }>,
 *     getClassroomDomain: (classroomId: string) => Promise<{
 *       domain: string | null
 *     }>,
 *     registerClassroomDomain: (
 *       classroomId: string,
 *       domain: string
 *     ) => Promise<{ domain: string }>,
 *     inviteClassroomStudent: (
 *       classroomId: string,
 *       email: string
 *     ) => Promise<{
 *       invitation: {
 *         id: string,
 *         emailAddress: string,
 *         status: string,
 *         url: string | null
 *       }
 *     }>
 *   },
 *   navigate?: (path: string) => void,
 *   clipboard?: { writeText: (value: string) => Promise<void> },
 *   storage?: {
 *     getItem: (key: string) => string | null,
 *     setItem: (key: string, value: string) => unknown,
 *     removeItem: (key: string) => unknown
 *   }
 * }} [dependencies]
 */
export async function renderClassroom(root, dependencies = {}) {
  let initialized = false;
  const clerk =
    dependencies.clerk ??
    createClerkBrowser({
      onChange: () => {
        if (initialized) {
          void loadWorkspace();
        }
      }
    });
  const client =
    dependencies.client ??
    createPlayerApiClient({ getToken: clerk.getToken });
  const navigate =
    dependencies.navigate ?? ((path) => window.location.assign(path));
  const clipboard = Object.hasOwn(dependencies, "clipboard")
    ? dependencies.clipboard
    : globalThis.navigator?.clipboard;
  const storage = dependencies.storage ?? globalThis.localStorage;
  /** @type {Classroom[] | null} */
  let lastClassrooms = null;
  /** @type {string | null} */
  let lastUserId = null;
  let workspaceEpoch = 0;

  root.innerHTML = `
    <a class="skip-link" href="#classroom-main">Skip to Classroom</a>
    <nav class="classroom-nav" aria-label="Classroom navigation">
      <a class="wordmark" href="/">Echo Maze</a>
      <p>Classroom field guide</p>
      <div class="classroom-nav__actions">
        <button class="control-button" data-action="refresh" type="button">Refresh</button>
        <a class="control-link" href="/play">Play</a>
        <button class="control-button" data-action="sign-out" type="button" hidden>Sign out</button>
      </div>
    </nav>
    <main class="classroom-workbench" id="classroom-main" tabindex="-1">
      <header class="classroom-heading">
        <div>
          <p class="section-label">Classroom</p>
          <h1>Choose where this Quest belongs.</h1>
        </div>
        <p>
          Personal Play stays yours. Class Play shares only objective counts
          with your Teacher—never prompts, answers, or question timelines.
        </p>
      </header>
      <p class="classroom-status" id="classroom-status" role="status" aria-live="polite">
        Opening the field guide…
      </p>
      <div id="classroom-content" aria-busy="true"></div>
    </main>
  `;

  const content = requiredElement(root, "classroom-content", HTMLElement);
  const status = requiredElement(root, "classroom-status", HTMLElement);
  const refresh = root.querySelector("[data-action='refresh']");
  const signOut = root.querySelector("[data-action='sign-out']");
  refresh?.addEventListener("click", () => void loadWorkspace());
  signOut?.addEventListener("click", async () => {
    await clerk.signOut();
    await loadWorkspace();
  });

  let clerkReady;
  try {
    clerkReady = await clerk.initialize();
  } catch {
    clerkReady = false;
  }
  initialized = true;
  if (!clerkReady) {
    renderUnavailable();
    return;
  }
  await loadWorkspace();

  async function loadWorkspace() {
    const requestEpoch = ++workspaceEpoch;
    const userId = clerk.user?.id;
    if (!userId) {
      lastClassrooms = null;
      lastUserId = null;
      renderSignedOut();
      return;
    }
    if (lastUserId !== userId) {
      lastClassrooms = null;
      lastUserId = userId;
    }
    if (signOut instanceof HTMLButtonElement) {
      signOut.hidden = false;
    }
    root.dataset.classroomState = "loading";
    status.textContent = "Loading synchronized Classroom Memberships…";
    content.setAttribute("aria-busy", "true");
    if (lastClassrooms === null) {
      content.innerHTML = loadingMarkup();
    }
    try {
      const result = await client.listClassrooms();
      if (
        requestEpoch !== workspaceEpoch ||
        clerk.user?.id !== userId
      ) {
        return;
      }
      const classrooms = normalizeClassrooms(result.classrooms);
      const selectedClassroom = loadSelectedClassroom(storage, userId);
      const selectionWasRemoved =
        selectedClassroom !== null &&
        !classrooms.some((entry) => entry.id === selectedClassroom);
      if (selectionWasRemoved) {
        clearSelectedClassroom(storage, userId);
        root.dataset.classroomSelectionFallback = "true";
      } else {
        delete root.dataset.classroomSelectionFallback;
      }
      lastClassrooms = classrooms;
      root.dataset.classroomState = "ready";
      status.textContent =
        selectionWasRemoved
          ? "The selected Classroom Membership is no longer available. Personal Play is active."
          : classrooms.length === 0
          ? "No synchronized Classroom Memberships yet."
          : `${classrooms.length} synchronized Classroom${
              classrooms.length === 1 ? "" : "s"
            }.`;
      content.removeAttribute("aria-busy");
      renderReady(classrooms);
    } catch {
      if (
        requestEpoch !== workspaceEpoch ||
        clerk.user?.id !== userId
      ) {
        return;
      }
      content.removeAttribute("aria-busy");
      if (lastClassrooms !== null) {
        root.dataset.classroomState = "stale";
        status.textContent =
          "Showing the last loaded view. Refresh when the connection returns.";
        renderReady(lastClassrooms);
        return;
      }
      root.dataset.classroomState = "error";
      status.textContent = "Classroom data could not load.";
      content.innerHTML = `
        <section class="classroom-message classroom-message--error" role="alert">
          <p class="section-label">Connection lost</p>
          <h2>Your Classroom view is unavailable.</h2>
          <p>Try again. Personal Play is still ready.</p>
          <button class="primary-button" data-action="retry" type="button">Try again</button>
        </section>
      `;
      content
        .querySelector("[data-action='retry']")
        ?.addEventListener("click", () => void loadWorkspace());
    }
  }

  function renderSignedOut() {
    root.dataset.classroomState = "signed-out";
    if (signOut instanceof HTMLButtonElement) {
      signOut.hidden = true;
    }
    status.textContent = "Sign in is required for Classroom Memberships.";
    content.removeAttribute("aria-busy");
    content.innerHTML = `
      <section class="classroom-message">
        <p class="section-label">Signed out</p>
        <h2>Sign in to open your Classroom.</h2>
        <p>Guest and Personal Play still work without a Classroom.</p>
        <div class="classroom-actions">
          <button class="primary-button" data-action="sign-in" type="button">Sign in</button>
          <button class="control-button" data-action="sign-up" type="button">Create account</button>
          <a class="control-link" href="/play">Personal Play</a>
        </div>
      </section>
    `;
    content
      .querySelector("[data-action='sign-in']")
      ?.addEventListener("click", () => void clerk.openSignIn());
    content
      .querySelector("[data-action='sign-up']")
      ?.addEventListener("click", () => void clerk.openSignUp());
  }

  function renderUnavailable() {
    root.dataset.classroomState = "unavailable";
    status.textContent = "Classroom sign-in is unavailable.";
    content.removeAttribute("aria-busy");
    content.innerHTML = `
      <section class="classroom-message classroom-message--error" role="alert">
        <p class="section-label">Classroom unavailable</p>
        <h2>Sign-in services could not open.</h2>
        <p>Reload to retry, or keep exploring in Personal Play.</p>
        <div class="classroom-actions">
          <a class="primary-button" href="/class">Reload</a>
          <a class="control-link" href="/play">Personal Play</a>
        </div>
      </section>
    `;
  }

  /** @param {Classroom[]} classrooms */
  function renderReady(classrooms) {
    content.replaceChildren();
    const grid = document.createElement("div");
    grid.className = "classroom-grid";
    const memberships = document.createElement("section");
    memberships.className = "classroom-panel classroom-panel--memberships";
    memberships.innerHTML = `
      <div class="classroom-panel__heading">
        <div>
          <p class="section-label">Play context</p>
          <h2>Your synchronized Classrooms</h2>
        </div>
        <button class="control-button" data-action="personal-play" type="button">
          Personal Play
        </button>
      </div>
      <div class="classroom-list"></div>
    `;
    memberships
      .querySelector("[data-action='personal-play']")
      ?.addEventListener("click", () => {
        clearSelectedClassroom(storage, clerk.user?.id);
        navigate("/play");
      });
    const list = /** @type {HTMLElement} */ (
      memberships.querySelector(".classroom-list")
    );
    if (classrooms.length === 0) {
      const empty = document.createElement("div");
      empty.className = "classroom-empty";
      empty.innerHTML = `
        <p class="section-label">No Membership yet</p>
        <h3>Start a Classroom, or accept an invitation.</h3>
        <p>After Clerk confirms it, refresh this page to see it here.</p>
      `;
      list.append(empty);
    } else {
      for (const entry of classrooms) {
        list.append(classroomCard(entry));
      }
    }
    grid.append(memberships, createClassroomPanel());
    for (const teacherClassroom of classrooms.filter(
      (entry) => entry.role === "teacher"
    )) {
      grid.append(teacherPanel(teacherClassroom));
    }
    content.append(grid);
  }

  /** @param {Classroom} entry */
  function classroomCard(entry) {
    const card = document.createElement("article");
    card.className = "classroom-card";
    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = entry.role === "teacher" ? "Teacher" : "Student";
    const heading = document.createElement("h3");
    heading.textContent = entry.name;
    const copy = document.createElement("p");
    copy.textContent =
      entry.role === "teacher"
        ? "Guide this class or enter its Maze."
        : "Enter this class without changing the Quest rules.";
    const play = document.createElement("button");
    play.className = "primary-button";
    play.type = "button";
    play.dataset.classPlay = entry.id;
    play.textContent = "Class Play";
    play.addEventListener("click", () => {
      if (saveSelectedClassroom(entry.id, storage, clerk.user?.id)) {
        navigate("/play");
        return;
      }
      status.textContent =
        "This browser could not save the Class Play choice. Personal Play remains active.";
    });
    card.append(label, heading, copy, play);
    return card;
  }

  function createClassroomPanel() {
    const panel = document.createElement("section");
    panel.className = "classroom-panel classroom-panel--create";
    panel.innerHTML = `
      <p class="section-label">New Classroom</p>
      <h2>Open a field guide for your group.</h2>
      <p>
        Clerk creates the Classroom first. It appears here only after the
        signed webhook synchronizes your Teacher Membership.
      </p>
      <form class="classroom-form" id="classroom-create-form">
        <label for="classroom-name">Classroom name</label>
        <div class="classroom-form__row">
          <input
            id="classroom-name"
            name="name"
            type="text"
            minlength="1"
            maxlength="120"
            autocomplete="organization"
            required
          />
          <button class="primary-button" type="submit">Create</button>
        </div>
        <p class="classroom-form__status" role="status" aria-live="polite"></p>
      </form>
    `;
    const form = /** @type {HTMLFormElement} */ (
      panel.querySelector("#classroom-create-form")
    );
    const input = /** @type {HTMLInputElement} */ (
      panel.querySelector("#classroom-name")
    );
    const formStatus = /** @type {HTMLElement} */ (
      panel.querySelector(".classroom-form__status")
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      formStatus.textContent = "Creating in Clerk…";
      try {
        const result = await client.createClassroom(input.value);
        input.value = "";
        formStatus.textContent = `${result.classroom.name} was created. Waiting for signed webhook synchronization—use Refresh shortly.`;
      } catch (error) {
        formStatus.textContent = readableError(
          error,
          "Classroom creation failed. Check the name and try again."
        );
      } finally {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
    return panel;
  }

  /** @param {Classroom} entry */
  function teacherPanel(entry) {
    const panel = document.createElement("section");
    let progressEpoch = 0;
    let domainEpoch = 0;
    panel.className = "classroom-panel classroom-panel--teacher";
    panel.dataset.teacherClassroom = entry.id;
    const inviteInputId = `classroom-invite-email-${entry.id}`;
    const domainInputId = `classroom-domain-${entry.id}`;
    const domainStatusId = `classroom-domain-status-${entry.id}`;
    panel.innerHTML = `
      <div class="classroom-panel__heading">
        <div>
          <p class="section-label">Teacher tools</p>
          <h2></h2>
        </div>
        <span class="classroom-privacy">Counts only</span>
      </div>
      <div class="classroom-domain">
        <p class="section-label">Automatic roster</p>
        <h3>Verified school domain</h3>
        <p class="classroom-domain__copy">
          Students can join after Clerk verifies a primary email on this exact
          domain. Public email domains are not accepted.
        </p>
        <form
          class="classroom-form"
          data-classroom-domain="${entry.id}"
          aria-busy="true"
        >
          <label for="${domainInputId}">School email domain</label>
          <div class="classroom-form__row">
            <input
              id="${domainInputId}"
              name="domain"
              type="text"
              inputmode="url"
              autocapitalize="none"
              autocomplete="off"
              spellcheck="false"
              placeholder="students.school.example"
              pattern="(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}"
              aria-describedby="${domainStatusId}"
              required
            />
            <button class="primary-button" type="submit" disabled>
              Save domain
            </button>
          </div>
          <p
            class="classroom-form__status"
            id="${domainStatusId}"
            role="status"
            aria-live="polite"
          >Checking the current domain...</p>
        </form>
      </div>
      <form class="classroom-form" data-classroom-invite="${entry.id}">
        <label for="${inviteInputId}">Student email</label>
        <div class="classroom-form__row">
          <input
            id="${inviteInputId}"
            name="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            required
          />
          <button class="primary-button" type="submit">Send invite</button>
        </div>
        <p class="classroom-form__status" role="status" aria-live="polite"></p>
        <div class="classroom-invitation-result"></div>
      </form>
      <div class="classroom-progress">
        <div class="classroom-progress__heading">
          <div>
            <p class="section-label">Objective progress</p>
            <h3>Student practice counts</h3>
          </div>
          <button class="control-button" data-action="refresh-progress" type="button">
            Refresh counts
          </button>
        </div>
        <div class="classroom-progress__content" aria-busy="true">
          ${loadingMarkup()}
        </div>
      </div>
    `;
    const title = panel.querySelector("h2");
    if (title) title.textContent = entry.name;
    const domainForm = /** @type {HTMLFormElement} */ (
      panel.querySelector("[data-classroom-domain]")
    );
    const domainInput = /** @type {HTMLInputElement} */ (
      domainForm.querySelector("input[name='domain']")
    );
    const domainSubmit = /** @type {HTMLButtonElement} */ (
      domainForm.querySelector("button[type='submit']")
    );
    const domainStatus = /** @type {HTMLElement} */ (
      domainForm.querySelector(".classroom-form__status")
    );
    let domainWasEdited = false;
    domainInput.addEventListener("input", () => {
      domainWasEdited = true;
      domainInput.removeAttribute("aria-invalid");
      if (domainForm.dataset.state === "error") {
        delete domainForm.dataset.state;
        domainStatus.setAttribute("role", "status");
        domainStatus.textContent =
          "Use the domain after @ in your verified school email.";
      }
    });
    domainInput.addEventListener("blur", () => {
      if (domainInput.value && !domainInput.checkValidity()) {
        showDomainError(
          "Enter a full school domain, such as students.school.example."
        );
      }
    });
    domainForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!domainInput.checkValidity()) {
        showDomainError(
          "Enter a full school domain, such as students.school.example."
        );
        domainInput.focus();
        return;
      }
      domainSubmit.disabled = true;
      domainSubmit.textContent = "Saving...";
      domainForm.dataset.state = "loading";
      domainForm.setAttribute("aria-busy", "true");
      domainStatus.setAttribute("role", "status");
      domainStatus.textContent = "Verifying your Clerk primary email...";
      try {
        const result = await client.registerClassroomDomain(
          entry.id,
          domainInput.value
        );
        domainInput.value = result.domain;
        domainWasEdited = false;
        domainForm.dataset.state = "success";
        domainStatus.textContent =
          `${result.domain} is ready for verified student accounts.`;
      } catch (error) {
        showDomainError(
          readableError(
            error,
            "Domain registration failed. Check the domain and try again."
          )
        );
      } finally {
        domainForm.removeAttribute("aria-busy");
        domainSubmit.disabled = false;
        domainSubmit.textContent = "Save domain";
      }
    });
    const form = /** @type {HTMLFormElement} */ (
      panel.querySelector("[data-classroom-invite]")
    );
    const email = /** @type {HTMLInputElement} */ (
      panel.querySelector("input[name='email']")
    );
    const formStatus = /** @type {HTMLElement} */ (
      form.querySelector(".classroom-form__status")
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = form.querySelector("button[type='submit']");
      if (submit instanceof HTMLButtonElement) submit.disabled = true;
      formStatus.textContent = "Sending through Clerk…";
      try {
        const result = await client.inviteClassroomStudent(
          entry.id,
          email.value
        );
        formStatus.textContent = `Invitation sent to ${result.invitation.emailAddress}.`;
        renderInvitationResult(
          /** @type {HTMLElement} */ (
            form.querySelector(".classroom-invitation-result")
          ),
          result.invitation
        );
        email.value = "";
      } catch (error) {
        formStatus.textContent = readableError(
          error,
          "Invitation failed. Confirm the email and try again."
        );
      } finally {
        if (submit instanceof HTMLButtonElement) submit.disabled = false;
      }
    });
    panel
      .querySelector("[data-action='refresh-progress']")
      ?.addEventListener("click", () => void loadProgress());
    void loadDomain();
    void loadProgress();
    return panel;

    /** @param {string} message */
    function showDomainError(message) {
      domainForm.dataset.state = "error";
      domainInput.setAttribute("aria-invalid", "true");
      domainStatus.setAttribute("role", "alert");
      domainStatus.textContent = message;
    }

    async function loadDomain() {
      const requestEpoch = ++domainEpoch;
      try {
        const result = await client.getClassroomDomain(entry.id);
        if (requestEpoch !== domainEpoch) return;
        if (!domainWasEdited && typeof result.domain === "string") {
          domainInput.value = result.domain;
        }
        domainForm.dataset.state =
          typeof result.domain === "string" ? "success" : "ready";
        domainStatus.textContent =
          typeof result.domain === "string"
            ? `${result.domain} is the verified automatic-join domain.`
            : "Use the domain after @ in your verified school email.";
      } catch (error) {
        if (requestEpoch !== domainEpoch) return;
        showDomainError(
          readableError(
            error,
            "The current domain could not load. You can still try to save it."
          )
        );
      } finally {
        if (requestEpoch === domainEpoch) {
          domainForm.removeAttribute("aria-busy");
          domainSubmit.disabled = false;
        }
      }
    }

    async function loadProgress() {
      const requestEpoch = ++progressEpoch;
      const progressContent = /** @type {HTMLElement} */ (
        panel.querySelector(".classroom-progress__content")
      );
      progressContent.setAttribute("aria-busy", "true");
      try {
        const result = await client.getClassroomProgress(entry.id);
        if (requestEpoch !== progressEpoch) return;
        progressContent.removeAttribute("aria-busy");
        progressContent.replaceChildren();
        const progress = Array.isArray(result.progress) ? result.progress : [];
        if (progress.length === 0) {
          progressContent.innerHTML = `
            <div class="classroom-empty">
              <p class="section-label">No counts yet</p>
              <h3>Class Play practice has not synced yet.</h3>
              <p>Counts appear after Students answer Warden challenges.</p>
            </div>
          `;
          return;
        }
        const list = document.createElement("div");
        list.className = "progress-list";
        for (const row of progress) {
          list.append(progressCard(row));
        }
        if (result.truncated === true) {
          const note = document.createElement("p");
          note.className = "classroom-inline-note";
          note.textContent =
            "Showing the first 500 Student and objective count rows. Narrow the Classroom roster before using this view for a complete review.";
          progressContent.append(note);
        }
        progressContent.append(list);
      } catch (error) {
        if (requestEpoch !== progressEpoch) return;
        progressContent.removeAttribute("aria-busy");
        progressContent.innerHTML = `
          <p class="classroom-inline-error" role="alert">
            ${escapeHtml(
              readableError(
                error,
                "Progress counts are unavailable. Try again."
              )
            )}
          </p>
        `;
      }
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {{ emailAddress: string, url: string | null }} invitation
   */
  function renderInvitationResult(container, invitation) {
    container.replaceChildren();
    if (!invitation.url) {
      const note = document.createElement("p");
      note.textContent = "Clerk sent the invitation email.";
      container.append(note);
      return;
    }
    const invitationUrl = invitation.url;
    const mail = document.createElement("a");
    mail.className = "control-link";
    mail.textContent = "Open email draft";
    mail.href = `mailto:${encodeURIComponent(
      invitation.emailAddress
    )}?subject=${encodeURIComponent(
      "Your Echo Maze Classroom invitation"
    )}&body=${encodeURIComponent(
      `Join our Echo Maze Classroom: ${invitationUrl}`
    )}`;
    if (typeof clipboard?.writeText === "function") {
      const copy = document.createElement("button");
      copy.className = "control-button";
      copy.type = "button";
      copy.dataset.action = "copy-invitation";
      copy.textContent = "Copy invitation";
      copy.addEventListener("click", async () => {
        try {
          await clipboard.writeText(invitationUrl);
          copy.textContent = "Copied";
        } catch {
          copy.textContent = "Copy unavailable";
        }
      });
      container.append(copy);
    }
    container.append(mail);
  }
}

/** @param {unknown} value */
function normalizeClassrooms(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        CLASSROOM_ID_PATTERN.test(entry.id) &&
        typeof entry.name === "string" &&
        entry.name.length >= 1 &&
        entry.name.length <= 120 &&
        (entry.role === "teacher" || entry.role === "student")
    )
    .slice(0, 100);
}

/** @param {Record<string, unknown>} row */
function progressCard(row) {
  const card = document.createElement("article");
  card.className = "progress-card";
  const student = document.createElement("h4");
  student.textContent =
    typeof row.studentName === "string" ? row.studentName : "Explorer";
  const objective = document.createElement("p");
  objective.className = "progress-card__objective";
  objective.textContent =
    typeof row.objectiveId === "string"
      ? row.objectiveId.replaceAll("-", " ")
      : "Learning objective";
  const counts = document.createElement("ul");
  for (const [label, value] of [
    ["correct", row.correct],
    ["wrong", row.wrong],
    ["hints", row.hints],
    ["skips", row.skips]
  ]) {
    const item = document.createElement("li");
    item.textContent = `${Number(value) || 0} ${label}`;
    counts.append(item);
  }
  card.append(student, objective, counts);
  return card;
}

function loadingMarkup() {
  return `
    <div class="classroom-loading" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
  `;
}

/** @param {unknown} error @param {string} fallback */
function readableError(error, fallback) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return fallback;
}

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * @template {typeof HTMLElement} T
 * @param {ParentNode} root
 * @param {string} id
 * @param {T} type
 * @returns {InstanceType<T>}
 */
function requiredElement(root, id, type) {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof type)) {
    throw new Error(`Missing Classroom element: ${id}`);
  }
  return /** @type {InstanceType<T>} */ (element);
}
