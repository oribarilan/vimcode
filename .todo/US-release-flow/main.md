# US-release-flow

## Goal

Set up a distribution and release workflow for vimcode: semver versioning, a changelog, and a CONTRIBUTING.md that explains how releases work. Users should be able to install vimcode as an npm package and track what changed between versions.

## Definition of Done
- [ ] `CHANGELOG.md` exists with a v0.1.0 entry covering everything built so far
- [ ] `CONTRIBUTING.md` exists explaining the release process (bump version, update changelog, npm publish)
- [ ] `package.json` updated: version bumped to 0.1.0, `private: true` removed (or kept if not publishing to npm yet — decide)
- [ ] `package.json` has `files` field to control what gets published (src/, not test/)
- [ ] Clear decision documented: npm publish vs git-based install vs both

## Task Priority
1. `changelog.md` — define what v0.1.0 includes
2. `contributing.md` — document the release process
3. `package-json.md` — update package.json for distribution

## Cross-Cutting Concerns
- Changelog format: keep-a-changelog style, grouped by Added/Changed/Fixed
- Semver: 0.x.y until the plugin API stabilizes. Breaking changes bump minor.
- The plugin currently needs OpenCode's peer deps at runtime. Document this clearly.
