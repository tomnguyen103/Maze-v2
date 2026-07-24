/**
 * @param {{
 *   onChange?: () => void,
 *   env?: { VITE_CLERK_PUBLISHABLE_KEY?: string },
 *   loadClerkModule?: () => Promise<{ Clerk: any }>
 * }} [options]
 */
export function createClerkBrowser({
  onChange = () => {},
  env = /** @type {{ VITE_CLERK_PUBLISHABLE_KEY?: string }} */ (import.meta.env),
  loadClerkModule = () => import("@clerk/clerk-js")
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
    async signOut() {
      if (!clerk) {
        return;
      }
      await clerk.signOut();
      onChange();
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
      const { Clerk } = await loadClerkModule();
      const nextClerk = new Clerk(publishableKey);
      await loadClerk(nextClerk);
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

/** @param {import("@clerk/clerk-js").Clerk} clerk */
async function loadClerk(clerk) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Clerk initialization timed out."));
    }, 8000);
  });
  try {
    await Promise.race([
      clerk.load({
        appearance: {
          variables: readAppearanceVariables()
        }
      }),
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function readAppearanceVariables() {
  const styles = getComputedStyle(document.documentElement);
  /** @param {string} token */
  const readToken = (token) => styles.getPropertyValue(token).trim();
  return {
    colorBackground: readToken("--color-paper"),
    colorDanger: readToken("--color-warden"),
    colorForeground: readToken("--color-ink"),
    colorInputBackground: readToken("--color-stone"),
    colorInputText: readToken("--color-ink"),
    colorPrimary: readToken("--color-signal-deep"),
    colorSuccess: readToken("--color-gate"),
    colorWarning: readToken("--color-explorer-gold"),
    borderRadius: readToken("--radius-md"),
    fontFamily: readToken("--font-body")
  };
}
