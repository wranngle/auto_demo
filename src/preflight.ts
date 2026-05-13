// Pre-flight reachability check. Capture/author should refuse to spin up
// Playwright + the agent against a dead target — that path wastes ~30s and
// 20k+ tokens on a useless recording of an error page.

export interface PreflightResult {
  ok: boolean;
  status?: number;
  detail?: string;
}

export async function preflight(url: string, timeoutMs = 5000): Promise<PreflightResult> {
  if (url.startsWith('file://')) return {ok: true};
  // Relative paths are resolved later by the runner — skip the probe.
  if (!/^https?:\/\//.test(url)) return {ok: true};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // GET, not HEAD: many dev servers return 404/405 on HEAD even when GET works.
    // Stream the response so we don't pull the whole body into memory.
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {accept: 'text/html,*/*;q=0.8'},
    });
    if (res.body) {
      // Drain & close — we only care about the status.
      try {
        await res.body.cancel();
      } catch {
        /* ignore */
      }
    }
    if (res.status >= 500) {
      return {ok: false, status: res.status, detail: `server returned ${res.status}`};
    }
    if (res.status === 404) {
      return {ok: false, status: res.status, detail: 'target URL returned 404'};
    }
    return {ok: true, status: res.status};
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('aborted')) {
      return {ok: false, detail: `target unreachable within ${timeoutMs}ms`};
    }
    return {ok: false, detail: `connection failed: ${msg}`};
  } finally {
    clearTimeout(timer);
  }
}
