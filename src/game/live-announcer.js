/** @type {WeakMap<HTMLElement, { parent: Node, next: Node | null }>} */
const homes = new WeakMap();

/** @type {WeakMap<HTMLElement, number>} */
const calls = new WeakMap();

/**
 * Write one polite status to the live region. `showModal()` makes the rest of
 * the page inert, so while a modal dialog is open the region moves inside it.
 * It returns to its first place once no dialog is open. The move waits one
 * frame, because the caller opens or closes the Challenge dialog after the
 * announcement in the same task. The text waits one more frame, because a
 * screen reader can drop a change made in the same frame as the move.
 * A deferred step does nothing once a newer call for the same region has started.
 * So the older message is dropped, not queued. Join messages at the call site to speak both.
 * In a hidden tab the browser stops animation frames, so each step uses a timer instead.
 *
 * @param {HTMLElement} region
 * @param {string} message
 */
export function announceInto(region, message) {
  if (!homes.has(region) && region.parentNode) {
    homes.set(region, { parent: region.parentNode, next: region.nextSibling });
  }
  const call = (calls.get(region) ?? 0) + 1;
  calls.set(region, call);
  const frame = (/** @type {() => void} */ cb) => {
    if (region.ownerDocument.hidden) {
      setTimeout(cb, 0);
    } else {
      requestAnimationFrame(cb);
    }
  };
  region.textContent = "";
  frame(() => {
    if (calls.get(region) !== call) return;
    place(region);
    frame(() => {
      if (calls.get(region) !== call) return;
      region.textContent = message;
    });
  });
}

/**
 * Move the region into the active open dialog, else back to its first place.
 *
 * @param {HTMLElement} region
 */
function place(region) {
  const host = activeDialog(region.ownerDocument);
  if (host) {
    if (region.parentElement !== host) {
      host.append(region);
    }
    return;
  }
  const home = homes.get(region);
  if (home && region.parentNode !== home.parent) {
    const next = home.next?.parentNode === home.parent ? home.next : null;
    home.parent.insertBefore(region, next);
  }
}

/**
 * The open dialog that holds focus, else the last open dialog.
 *
 * @param {Document} document
 */
function activeDialog(document) {
  const focused = document.activeElement?.closest("dialog[open]");
  if (focused) {
    return /** @type {HTMLDialogElement} */ (focused);
  }
  const dialogs = document.querySelectorAll("dialog[open]");
  return dialogs.item(dialogs.length - 1);
}
