# Tab Whisperer (Chrome Extension)

Turn messy Chrome sessions with dozens of tabs into a clean, AI-powered dashboard that summarizes and groups tabs.

## Features

- Summarizes open tabs (mocked now; plug in Chrome AI later)
- Groups tabs by category (Research, Shopping, Entertainment, etc.)
- Clean popup UI with search and dark mode
- Save sessions to revisit later

## Install (Developer Mode)

1. Build/prepare files (this project is plain HTML/CSS/JS, no build step).
2. Open Chrome and go to `chrome://extensions/`.
3. Toggle on "Developer mode" (top-right).
4. Click "Load unpacked" and select this project directory.
5. The extension icon will appear; click it to open the popup.

## Files

- `manifest.json`: MV3 manifest with permissions and background service worker
- `background.js`: Service worker; mocks summarization and grouping, stores results
- `popup.html`, `popup.css`, `popup.js`: Popup UI and interactions

## How it works

1. Click the toolbar icon → popup opens.
2. Click "Summarize & Group".
3. Background worker fetches all tabs, creates summaries (mock), then groups them (mock).
4. Results are saved in `chrome.storage.local` and rendered in the popup.

## Future integration points

- Replace mocks with Chrome's built-in AI:
  - Summaries: `chrome.ai.summarizer`
  - Grouping: `chrome.ai.prompt`
- Offline mode: cache summaries and reuse when tabs revisit
- Reload saved sessions and manage them in the popup

## Permissions

- `tabs`, `storage`, `scripting`

## Notes

- Some sites disallow favicon hotlinking; a Google favicon service is used for display only.
- This is a Manifest V3 extension; background logic runs in a service worker.

