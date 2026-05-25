# fix-git-install

## Context

Installing vimcode via git URL in `tui.json` (`"vimcode@git+https://github.com/oribarilan/vimcode.git"`) fails at runtime. Local dev (`just dev` with `"plugin": ["."]`) works fine.

**Value delivered**: Users can install vimcode from git in their `tui.json` without it silently failing.

## Root Cause

When opencode installs vimcode from git, Bun auto-installs peer dependencies (`@opentui/solid`, `@opentui/core`, etc.) into the plugin's own `node_modules/`. Specifically, the `./jsx-runtime` and `./jsx-dev-runtime` subpath exports in `@opentui/solid` point to `.d.ts` files (type declarations only, no runtime code).

When Bun loads the plugin, it resolves `@opentui/solid/jsx-runtime` from the plugin's local `node_modules/` (the type-only stub) instead of from opencode's host runtime (which has the real implementation). This causes:

```
SyntaxError: Export named 'jsxDEV' not found in module
  '.../node_modules/@opentui/solid/jsx-runtime.d.ts'
```

In local dev (`just dev`), this doesn't happen because there's no `node_modules` with peer deps installed — opencode resolves them from its own runtime.

## Related Files
- `package.json` — dependency declarations
- `src/index.tsx` — JSX pragma `@jsxImportSource @opentui/solid`
- `src/indicator.tsx` — JSX pragma `@jsxImportSource @opentui/solid`

## Fix Applied

**Moved peer dependencies to devDependencies.** Dev deps are never installed for downstream consumers (npm, bun, and yarn all skip them). The type stubs remain available during local development for editor autocompletion and type checking, but won't land in `node_modules/` when someone installs vimcode from git. The host runtime's copies resolve naturally.

Also removed the unnecessary `"."` export — only `"./tui"` matters for the plugin loader.

### Fallback if this doesn't work

If Bun's git installer does install devDeps (it shouldn't), the fallback is a build step:
1. Change `tsconfig.json` `jsx` from `"preserve"` to `"react-jsx"` so tsc compiles JSX to function calls
2. Add `"build": "tsc"` script
3. Update exports to `"./tui": "./dist/index.js"`
4. Commit `dist/` to git (git installs don't run lifecycle scripts like `prepublishOnly`)

Note: even with a build step, the compiled JS still imports from `@opentui/solid/jsx-runtime` — the fix works because `dist/` has no local `node_modules/` with stubs, so Bun resolves from the host.

### Approaches ruled out
- **Postinstall script to delete stubs** — OpenCode installs with `--ignore-scripts`, so postinstall never runs.
- **Host-side install flags (`--omit=peer`)** — not in our control.

## Acceptance Criteria
- [ ] `"plugin": ["vimcode@git+https://github.com/oribarilan/vimcode.git"]` in a `tui.json` loads successfully (no errors in opencode log)
- [ ] Vim mode indicator appears in the prompt area
- [ ] `just dev` still works as before
- [ ] Fresh install from git URL works (not just cached)

## Verification
- Install from git URL in tui.json, restart opencode, check log at `~/.local/share/opencode/log/` for `service=tui.plugin` lines — should see successful load, no errors
- Run `just dev` from the vimcode repo and confirm vim mode works
- `bun test` passes (already verified — 49/49 pass)
