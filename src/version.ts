// Keep in sync with package.json on each release.
export const VERSION = "0.12.0";

// GitHub API returns fresh content immediately; raw.githubusercontent.com
// is CDN-cached for up to 5 minutes which delays update detection.
const LATEST_VERSION_URL = "https://api.github.com/repos/oribarilan/vimcode/contents/package.json?ref=main";

type Toast = (opts: { message: string; variant: string; duration: number }) => void;
type KV = { get(key: string): Promise<string | undefined>; set(key: string, value: string): Promise<void> };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function checkForUpdate(toast: Toast, kv?: KV) {
  try {
    const last = kv?.get("lastUpdateCheck");
    if (last && typeof last.then === "function") {
      last
        .then((ts: string | undefined) => {
          if (ts && Date.now() - Number(ts) < ONE_DAY_MS) return;
          fetchLatest(toast, kv);
        })
        .catch(() => {});
    } else {
      fetchLatest(toast, kv);
    }
  } catch {
    fetchLatest(toast);
  }
}

function fetchLatest(toast: Toast, kv?: KV) {
  fetch(LATEST_VERSION_URL, {
    headers: { Accept: "application/vnd.github.v3.raw" },
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.json())
    // biome-ignore lint/suspicious/noExplicitAny: untyped JSON response
    .then((pkg: any) => {
      kv?.set("lastUpdateCheck", Date.now().toString());
      const latest = pkg?.version;
      if (latest && latest !== VERSION) {
        toast({ message: `vimcode update available: v${VERSION} → v${latest}`, variant: "info", duration: 5000 });
      }
    })
    .catch(() => {});
}
