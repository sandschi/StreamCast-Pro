# Changelog

All notable changes to StreamCast Pro are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows manual [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-08-30

### Added
- In-app changelog viewer, opened from the version number at the bottom of the dashboard sidebar.
- Error handling for KaraFun's `serverUnreacheable` event — the dashboard now shows an actionable message ("Party unreachable...") instead of an infinite loading spinner when the KaraFun app isn't open/connected.

### Fixed
- Manual "Show Now Playing" overlay trigger was silently discarded when the dashboard and the OBS overlay ran on machines with unsynced clocks. The staleness check now only applies to a leftover trigger found on initial overlay load, not to live clicks.
- Nightly Firestore chat-history cleanup cron was broken by a typo and had been failing on every run.
- Removed a duplicate Discord signup notification path (a Cloud Function that overlapped with the existing API-route notification).

### Changed
- Manual "Show Now Playing" popup now stays visible for 10 seconds (was 5).

### Removed
- Unused dead code (`TabButton` component, an always-true conditional) and stale committed files (`lint-results*.txt`, `replace_colors.js`).
