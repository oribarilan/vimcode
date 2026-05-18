# changelog

## Context
Create the initial CHANGELOG.md covering everything built in v0.1.0.

**Value delivered**: Users and contributors can see what the first release includes.

## Related Files
- `CHANGELOG.md` (create)
- `git log` for commit history

## Acceptance Criteria
- [ ] `CHANGELOG.md` exists at project root
- [ ] Uses keep-a-changelog format (## [0.1.0] header, ### Added section)
- [ ] Lists all features: modal editing, motions, operators (d/c/y), counts, yy/p, insert entries, mode indicator, extra keys (:, X, J)
- [ ] Lists insert-mode behavior (Enter = newline, Tab blocked, Escape switches mode)
- [ ] Notes known limitations

## Verification
- File exists and is valid markdown
- Content matches the actual feature set (cross-reference with src/vim.ts MOTIONS, DELETE_MOTION tables)
