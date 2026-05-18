# US-agents-md

## Goal

Create an AGENTS.md that gives AI coding agents the context they need to work on vimcode. Three sections: OpenCode plugin development guidance, vimcode-specific architecture, and general TS/JS code quality conventions.

## Definition of Done
- [x] `AGENTS.md` exists at project root
- [x] **Section 1 — OpenCode plugin development**: references official plugin docs (https://opencode.ai/docs/plugins/), the tui-plugins spec, the smoke test plugin as a reference, lists the TuiPluginApi surface, notes that `opencode-workspaces` is a good reference for a TUI plugin with slots/keymap/routes
- [x] **Section 2 — vimcode architecture**: describes the intercept + pure handler + action pattern, file structure with one-line descriptions, how to add a keybinding, how to add an operator+motion combo, the Action type flow, known limitations (lineTracker drift, g vs gg, no cursor access, setTimeout dispatch)
- [x] **Section 3 — code conventions**: single-responsibility files, pure functions over side effects, no classes (plain objects + functions), mutation only in state objects passed by reference, comments explain why not what, test every handler branch, prefer discriminated unions, TypeScript strict mode
- [x] Documents how to test (`bun test`) and develop (`just dev`)
- [x] Under 200 lines total (114 lines)

## Cross-Cutting Concerns
- Concise. Agents don't need a novel — link to external docs instead of restating them.
- Focus on what's non-obvious and what agents get wrong.
- The conventions section should be prescriptive, not aspirational.
