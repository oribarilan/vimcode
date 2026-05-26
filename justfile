# vimcode — vim mode for OpenCode

# Install dependencies
install:
    npm install

# Run all tests
test:
    bun test

# Launch OpenCode with the vimcode plugin active
dev:
    OPENCODE_TUI_CONFIG=dev-tui.json opencode


