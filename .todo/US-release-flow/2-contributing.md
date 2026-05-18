# contributing

## Context
Document the release process so contributors (including future-you) know how to ship a new version.

**Value delivered**: Anyone can release a new version without tribal knowledge.

## Related Files
- `CONTRIBUTING.md` (create)

## Acceptance Criteria
- [ ] `CONTRIBUTING.md` exists at project root
- [ ] Explains development setup (npm install, just dev, bun test)
- [ ] Explains how to add a keybinding (add to vim.ts, write test, verify with just dev)
- [ ] Documents the release process: update CHANGELOG, bump version in package.json, git tag, npm publish (if applicable)
- [ ] Documents commit message conventions (feat:/fix:/refactor:/chore:/test:)
- [ ] Short — under 100 lines

## Verification
- File exists and covers all criteria
- Release steps are concrete (not "update the version" but "edit package.json version field")
