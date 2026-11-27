let requestId = 0;

/**
 * Loaded when the Daily dialog opens. `board` holds the elements; `load`
 * fetches the verified entries; `errorStatus` maps a failure to an HTTP status.
 * @param {{
 *   list: HTMLElement, retry: HTMLElement, status: HTMLElement, date: HTMLElement
 * }} board
 * @param {{
 *   load: () => Promise<{ date: string, entries?: unknown }>,
 *   errorStatus: (error: unknown) => number
 * }} source
 * @param {string} day
 */
export async function refreshVerifiedDailyBoard(board, source, day) {
  const thisRequest = ++requestId;
  try {
    const result = await source.load();
    if (thisRequest !== requestId || board.date.textContent !== day) {
      return;
    }
    if (result.date !== day) {
      board.status.dataset.state = "error";
      board.status.textContent =
        "Verified Daily Board date changed. Reopen Daily to see the current board.";
      return;
    }
    const entries = Array.isArray(result.entries) ? result.entries : [];
    renderVerifiedDailyEntries(board, entries);
  } catch (error) {
    if (thisRequest !== requestId || board.date.textContent !== day) {
      return;
    }
    board.list.replaceChildren();
    board.retry.hidden = false;
    board.status.dataset.state = "error";
    board.status.textContent = source.errorStatus(error) === 0
      ? "Network could not reach the Verified Daily Board. Local Daily play still works."
      : "Verified Daily services are unavailable. Local Daily play still works.";
  }
}

/**
 * @param {{ list: HTMLElement, status: HTMLElement }} board
 * @param {Record<string, unknown>[]} entries
 */
function renderVerifiedDailyEntries(board, entries) {
  board.list.replaceChildren(
    ...entries.slice(0, 10).map((entry, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const username = document.createElement("strong");
      const score = document.createElement("span");
      const moves = document.createElement("span");
      rank.className = "daily-board__rank";
      rank.textContent = `#${entry.rank ?? index + 1}`;
      username.className = "daily-board__username";
      username.textContent = String(entry.username ?? "Explorer");
      score.className = "daily-board__score";
      score.textContent = `${entry.score ?? 0} pts`;
      moves.className = "daily-board__moves";
      moves.textContent = `${entry.moves ?? 0} moves`;
      item.append(rank, username, score, moves);
      return item;
    })
  );
  board.status.dataset.state = entries.length === 0
    ? "empty"
    : "success";
  board.status.textContent = entries.length === 0
    ? "No verified escapes yet. The first checked Gate is waiting."
    : `${entries.length} verified ${entries.length === 1 ? "Explorer" : "Explorers"} ranked today.`;
}

