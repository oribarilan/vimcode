# vimcode — vim mode for OpenCode

# Install dependencies
install:
    npm install

# Run all tests and checks
test:
    bunx biome check .
    bun test

# Auto-fix lint and formatting
fix:
    bunx biome check --write .

# Launch OpenCode with the vimcode plugin active
dev:
    OPENCODE_TUI_CONFIG=dev-tui.json opencode


