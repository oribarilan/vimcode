// Keep in sync with package.json on each release.
export const VERSION = "0.4.0"

// GitHub API returns fresh content immediately; raw.githubusercontent.com
// is CDN-cached for up to 5 minutes which delays update detection.
const LATEST_VERSION_URL =
  "https://api.github.com/repos/oribarilan/vimcode/contents/package.json?ref=main"

type Toast = (opts: { message: string; variant: string; duration: number }) => void

export function checkForUpdate(toast: Toast) {
  fetch(LATEST_VERSION_URL, {
    headers: { Accept: "application/vnd.github.v3.raw" },
    signal: AbortSignal.timeout(3000),
  })
    .then((r) => r.json())
    .then((pkg: any) => {
      const latest = pkg?.version
      if (latest && latest !== VERSION) {
        toast({ message: `vimcode update available: v${VERSION} → v${latest}`, variant: "info", duration: 5000 })
      }
    })
    .catch(() => {})
}
