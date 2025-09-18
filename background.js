// Background service worker for Tab Whisperer (MV3)
// Mocked AI integrations for summaries and grouping.

// Message types
const MESSAGE_TYPES = {
  PROCESS_TABS: 'PROCESS_TABS',
  GET_LATEST_GROUPS: 'GET_LATEST_GROUPS',
  SAVE_SESSION: 'SAVE_SESSION'
};

// Mock: Summarize a tab using its title
async function summarizeTabMock(tab) {
  const title = tab.title || 'Untitled';
  return `Summary for ${title}`;
}

// Mock: Group summaries using a pretend LLM
async function groupSummariesMock(summaries) {
  // Simple heuristic grouping by keywords in title for now
  const groups = {
    Research: [],
    Shopping: [],
    Entertainment: [],
    Work: [],
    Other: []
  };

  for (const item of summaries) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (/(paper|research|arxiv|wiki|docs|guide)/.test(text)) groups.Research.push(item);
    else if (/(amazon|ebay|shop|price|deal|buy|cart)/.test(text)) groups.Shopping.push(item);
    else if (/(youtube|netflix|spotify|game|movie|music)/.test(text)) groups.Entertainment.push(item);
    else if (/(jira|github|gitlab|slack|notion|figma|drive)/.test(text)) groups.Work.push(item);
    else groups.Other.push(item);
  }

  // Remove empty groups
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length));
}

async function fetchAllTabs() {
  return await chrome.tabs.query({});
}

async function processTabsAndStore() {
  const tabs = await fetchAllTabs();
  const summaries = [];

  for (const tab of tabs) {
    if (!tab.id || tab.pendingUrl === 'chrome://newtab/') continue;
    summaries.push({
      tabId: tab.id,
      url: tab.url || '',
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      summary: await summarizeTabMock(tab)
    });
  }

  const grouped = await groupSummariesMock(summaries);
  const payload = {
    generatedAt: Date.now(),
    groups: grouped
  };

  await chrome.storage.local.set({ latestGroups: payload });
  return payload;
}

async function getLatestGroups() {
  const result = await chrome.storage.local.get('latestGroups');
  return result.latestGroups || { generatedAt: null, groups: {} };
}

async function saveSession(sessionName) {
  const latest = await getLatestGroups();
  const key = 'savedSessions';
  const { [key]: existing = [] } = await chrome.storage.local.get(key);
  const session = {
    id: `${Date.now()}`,
    name: sessionName || `Session ${new Date().toLocaleString()}`,
    ...latest
  };
  const updated = [...existing, session];
  await chrome.storage.local.set({ [key]: updated });
  return session;
}

chrome.runtime.onInstalled.addListener(() => {
  // Initialize storage
  chrome.storage.local.set({ latestGroups: { generatedAt: null, groups: {} }, savedSessions: [] });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case MESSAGE_TYPES.PROCESS_TABS: {
          const data = await processTabsAndStore();
          sendResponse({ ok: true, data });
          break;
        }
        case MESSAGE_TYPES.GET_LATEST_GROUPS: {
          const data = await getLatestGroups();
          sendResponse({ ok: true, data });
          break;
        }
        case MESSAGE_TYPES.SAVE_SESSION: {
          const data = await saveSession(message?.name);
          sendResponse({ ok: true, data });
          break;
        }
        default:
          sendResponse({ ok: false, error: 'Unknown message type' });
      }
    } catch (error) {
      sendResponse({ ok: false, error: error?.message || String(error) });
    }
  })();
  return true; // keep port open for async
});

// Expose mock functions for potential unit tests in dev
export { summarizeTabMock, groupSummariesMock };

