# package-json

## Context
Update package.json for distribution. Users need to install vimcode either from npm or from git.

**Value delivered**: Users can `npm install vimcode` or add a git URL to their tui.json.

## Dependencies
- `1-changelog.md` and `2-contributing.md` should be done first (version is decided there)

## Related Files
- `package.json`

## Acceptance Criteria
- [ ] Version bumped to `0.1.0`
- [ ] Decision made and documented: keep `private: true` (git install only) or remove it (npm publish)
- [ ] `files` field added to control what's published: `["src/"]` (exclude test/, docs/, dev-tui.json)
- [ ] `description` field added
- [ ] `repository` field added pointing to the GitHub repo
- [ ] `license` field added (MIT or whatever the author chooses)
- [ ] `keywords` field added for npm discoverability (if publishing)

## Verification
- `npm pack --dry-run` shows only intended files
- package.json is valid JSON
