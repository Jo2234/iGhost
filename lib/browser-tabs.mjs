// A click may open a new tab (including rel=noopener links). Each ghost owns an
// isolated browser, so a newly created page belongs to that one active action.
export async function followOpenedPage(session, previousIds, createClient) {
  const { targetInfos } = await session.cdp.send("Target.getTargets");
  const opened = targetInfos.filter(target => target.type === "page" && !previousIds.has(target.targetId));
  if (!opened.length) return false;
  const target = opened.at(-1);
  const response = await fetch(`${session.debugOrigin}/json/list`);
  if (!response.ok) throw new Error("Unable to inspect the opened browser tab.");
  const pages = await response.json();
  const page = pages.find(page => page.id === target.targetId);
  if (!page?.webSocketDebuggerUrl) throw new Error("Opened browser tab has no debugging endpoint.");
  const next = createClient(page.webSocketDebuggerUrl);
  try {
    await next.ready();
    await next.send("Page.enable");
    await next.send("Runtime.enable");
    await next.send("Page.bringToFront");
  } catch (error) {
    next.close();
    throw error;
  }
  session.cdp.close();
  session.cdp = next;
  return true;
}
