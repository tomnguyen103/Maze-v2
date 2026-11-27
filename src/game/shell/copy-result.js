/**
 * Announces a clipboard write by its own result, so a later failure (such as a
 * chunk that does not load) never reports a failed copy after a good write.
 * @param {Promise<void>} write
 * @param {{ copied: string, failed: string }} messages
 * @param {(message: string) => void} announce
 */
export async function announceCopyResult(write, { copied, failed }, announce) {
  announce(await write.then(() => copied, () => failed));
}
