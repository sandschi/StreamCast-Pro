# Changelog

## [0.5.0] - 2026-09-03

### Added
- Rebuilt the broadcaster dashboard as desktop-app chrome: a title bar, menu bar, and status bar replace the old web-page header, with four selectable visual treatments (Carbon, Graphite, Slate, Phosphor) and three navigation styles (tabs, icon rail, sidebar), plus a density and UI-scale setting — all live, per-broadcaster preferences.
- Every dashboard pane (Chat, History, Users, KaraFun, Broadcasters, Remote, Settings) rebuilt around dense, treatment-aware rows and panels instead of card grids, including a real on-stream preview and Quick Actions panel on the Chat tab.
- Settings reorganized into Dashboard / Overlay appearance / Sound & integrations subtabs instead of one long scrolling list.

### Changed
- The version number (and changelog viewer) moved from the bottom of the dashboard sidebar into the top title bar, next to your connection status.
- The Remote tab is now framed around Touch Portal rather than Stream Deck, which was never the intended focus.
- The KaraFun tab's queue/now-playing visibility toggles now sit side by side instead of stacked.

### Fixed
- Master-admin status could silently fail to detect the real admin account on a page refresh (Firebase's Twitch login integration doesn't reliably populate the field the check used to rely on).
- A Firestore privacy gap that let a spoofed admin flag fetch every broadcaster's profile data, and a bug where a returning broadcaster's approval status could be reset to "waiting" on login.
- The Twitch Identity field in Settings is no longer editable (it never should have been) and has been removed from view since it exposed no real control.
- Assorted visual inconsistencies across the new dashboard chrome — mismatched corner shapes, fonts, and spacing that didn't follow the selected treatment.

## [0.2.0] - 2026-08-30

### Added
- In-app changelog viewer, opened from the version number.
- Error handling for KaraFun's `serverUnreacheable` event — the dashboard now shows an actionable message ("Party unreachable...") instead of an infinite loading spinner when the KaraFun app isn't open/connected.

### Fixed
- Manual "Show Now Playing" overlay trigger was silently discarded when the dashboard and the OBS overlay ran on machines with unsynced clocks. The staleness check now only applies to a leftover trigger found on initial overlay load, not to live clicks.
- Nightly Firestore chat-history cleanup cron was broken by a typo and had been failing on every run.
- Removed a duplicate Discord signup notification path (a Cloud Function that overlapped with the existing API-route notification).

### Changed
- Manual "Show Now Playing" popup now stays visible for 10 seconds (was 5).

### Removed
- Unused dead code (`TabButton` component, an always-true conditional) and stale committed files (`lint-results*.txt`, `replace_colors.js`).
