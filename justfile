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

# Launch OpenCode with the vimcode plugin active.
# Unset OPENCODE_CONFIG_DIR so dev-tui.json keybinds aren't
# overridden by the global dotfiles config (which is level 4).
dev:
    OPENCODE_TUI_CONFIG=dev-tui.json OPENCODE_CONFIG_DIR= opencode


