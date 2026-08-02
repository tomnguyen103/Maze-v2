/**
 * @param {{
 *   onChange?: () => void | Promise<unknown>,
 *   env?: { VITE_CLERK_PUBLISHABLE_KEY?: string },
 *   loadClerkModule?: () => Promise<{ Clerk: any }>,
 *   loadClerkUi?: (publishableKey: string) => Promise<any>
 * }} [options]
 */
export function createClerkBrowser({
  onChange = () => {},
  env = /** @type {{ VITE_CLERK_PUBLISHABLE_KEY?: string }} */ (import.meta.env),
  loadClerkModule = () => import("@clerk/clerk-js"),
  loadClerkUi = loadClerkUiBundle
} = {}) {
  /** @type {import("@clerk/clerk-js").Clerk | null} */
  let clerk = null;
  /** @type {Promise<boolean> | null} */
  let initialization = null;

  return {
    initialize,
    getToken: async () => clerk?.session?.getToken() ?? null,
    get user() {
      return clerk?.user ?? null;
    },
    /**
     * The role ADR 0015 mirrors into `publicMetadata` on every change. It is
     * the only role signal available before a profile fetch resolves, which is
     * what the `/admin` guard denies on. Never an authority: the database row
     * is, and every admin route re-checks it server-side.
     */
    get mirroredRole() {
      return clerk?.user?.publicMetadata?.role ?? null;
    },
    async openSignIn() {
      if (!(await initialize())) {
        return false;
      }
      try {
        clerk?.openSignIn();
        return true;
      } catch {
        return false;
      }
    },
    async openSignUp() {
      if (!(await initialize())) {
        return false;
      }
      try {
        clerk?.openSignUp();
        return true;
      } catch {
        return false;
      }
    },
    async openUserProfile() {
      if (!(await initialize())) {
        return false;
      }
      try {
        clerk?.openUserProfile();
        return true;
      } catch {
        return false;
      }
    },
    signOut() {
      if (!clerk) {
        return;
      }
      return clerk.signOut().then(onChange);
    }
  };

  async function initialize() {
    if (initialization) {
      return initialization;
    }
    initialization = initializeClerk();
    return initialization;
  }

  async function initializeClerk() {
    const publishableKey = env.VITE_CLERK_PUBLISHABLE_KEY;
    if (!publishableKey) {
      return false;
    }
    try {
      const deadline = Date.now() + CLERK_INITIALIZATION_TIMEOUT_MS;
      const { Clerk } = await waitForClerkInitialization(
        loadClerkModule(),
        deadline
      );
      const ClerkUI = await waitForClerkInitialization(
        loadClerkUi(publishableKey),
        deadline
      );
      const nextClerk = new Clerk(publishableKey);
      await loadClerk(nextClerk, ClerkUI, deadline);
      nextClerk.addListener(onChange);
      clerk = nextClerk;
      onChange();
      return true;
    } catch {
      clerk = null;
      return false;
    }
  }
}

const CLERK_INITIALIZATION_TIMEOUT_MS = 8000;

/**
 * @param {import("@clerk/clerk-js").Clerk} clerk
 * @param {any} ClerkUI
 * @param {number} deadline
 */
async function loadClerk(clerk, ClerkUI, deadline) {
  await waitForClerkInitialization(
    clerk.load({
      ui: { ClerkUI },
      appearance: {
        variables: readAppearanceVariables()
      }
    }),
    deadline
  );
}

/**
 * @template T
 * @param {Promise<T>} operation
 * @param {number} deadline
 * @returns {Promise<T>}
 */
async function waitForClerkInitialization(operation, deadline) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Clerk initialization timed out."));
    }, Math.max(0, deadline - Date.now()));
  });
  try {
    return /** @type {T} */ (await Promise.race([operation, timeoutPromise]));
  } finally {
    clearTimeout(timeout);
  }
}

/** @param {string} publishableKey */
async function loadClerkUiBundle(publishableKey) {
  const existingClerkUI = getClerkUiConstructor();
  if (existingClerkUI) {
    return existingClerkUI;
  }
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://${decodeClerkDomain(publishableKey)}/npm/@clerk/ui@1/dist/ui.browser.js`;
  const ClerkUI = await new Promise((resolve, reject) => {
    script.addEventListener("load", () => {
      const ClerkUI = getClerkUiConstructor();
      if (ClerkUI) {
        resolve(ClerkUI);
        return;
      }
      reject(new Error("Clerk UI did not initialize."));
    });
    script.addEventListener("error", () => reject(new Error("Clerk UI could not load.")));
    document.head.append(script);
  });
  return ClerkUI;
}

function getClerkUiConstructor() {
  return Reflect.get(window, "__internal_ClerkUICtor");
}

/** @param {string} publishableKey */
function decodeClerkDomain(publishableKey) {
  const encodedDomain = publishableKey.split("_")[2];
  if (!encodedDomain) {
    throw new Error("Clerk publishable key is invalid.");
  }
  return atob(encodedDomain).replace(/\$$/, "");
}

function readAppearanceVariables() {
  const styles = getComputedStyle(document.documentElement);
  /** @param {string} token */
  const readToken = (token) => styles.getPropertyValue(token).trim();
  return {
    colorBackground: readToken("--color-paper"),
    colorBorder: readToken("--color-ink"),
    colorDanger: readToken("--color-warden"),
    colorForeground: readToken("--color-ink"),
    colorInput: readToken("--color-stone"),
    colorInputForeground: readToken("--color-ink"),
    colorPrimary: readToken("--color-signal-deep"),
    colorRing: readToken("--color-signal-deep"),
    colorSuccess: readToken("--color-gate"),
    colorWarning: readToken("--color-explorer-gold"),
    borderRadius: readToken("--radius-md"),
    fontFamily: readToken("--font-body")
  };
}
