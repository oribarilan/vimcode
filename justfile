# vimcode — vim mode for OpenCode

# Install dependencies
install:
    npm install

# Run tests
test:
    bun test

# Check formatting and lint
lint:
    bunx biome check .

# Auto-fix formatting and lint
format:
    bunx biome check --write .

# Run lint + tests
check:
    just lint
    just test

# Launch OpenCode with the vimcode plugin active
dev:
    OPENCODE_TUI_CONFIG=dev-tui.json opencode


