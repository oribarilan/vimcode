# vimcode — vim mode for OpenCode

# Install dependencies
install:
    bun install

# Run tests
test:
    bun test

# Check formatting and lint (warnings are errors)
lint:
    bunx biome ci --error-on-warnings .

# Auto-fix formatting and lint
lint-fix:
    bunx biome check --write .

# Run lint + tests
check:
    just lint
    just test

# Optional real-host check: use an empty output dir outside any checkout.
compat host binary version output:
    python3 test/compat/run.py --host "{{host}}" --binary "{{binary}}" --expect-version "{{version}}" --output "{{output}}"

# Harness integration checks and parser helpers; local runs are on demand.
test-int:
    bun --env-file=/dev/null run test:int

# Both pinned hosts by default; optionally select one or supply all explicit paths.
test-e2e host="" binary="" version="" output="":
    bun --env-file=/dev/null run test:e2e "{{host}}" "{{binary}}" "{{version}}" "{{output}}"

# Pure comparison checks for the optional real-host harness.
compat-unit:
    python3 -B -m unittest discover -s test/compat -p 'test_*.py'

# Launch OpenCode with the vimcode plugin active.
# Unset OPENCODE_CONFIG_DIR so dev-tui.json keybinds aren't
# overridden by the global dotfiles config (which is level 4).
dev:
    OPENCODE_TUI_CONFIG=dev-tui.json OPENCODE_CONFIG_DIR= opencode

# Launch local source in an isolated v2 instance; optionally supply a v2 binary.
dev2 binary="":
    bun run scripts/dev2.ts "{{binary}}"


