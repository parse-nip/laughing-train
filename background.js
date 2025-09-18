// Background service worker for Tab Whisperer (MV3)
// Mocked AI integrations for summaries and grouping.

// Message types
const MESSAGE_TYPES = {
  PROCESS_TABS: 'PROCESS_TABS',
  GET_LATEST_GROUPS: 'GET_LATEST_GROUPS',
  SAVE_SESSION: 'SAVE_SESSION'
};

// Resolve AI APIs (Summarizer and Language Model) across environments
function resolveAISummarizerAPI() {
  // Prefer built-in AI if available (extension worker global is self)
  const aiGlobal = typeof self !== 'undefined' ? (self.ai || undefined) : undefined;
  if (aiGlobal?.summarizer) return aiGlobal.summarizer;
  if (typeof chrome !== 'undefined' && chrome.aiOriginTrial?.summarizer) return chrome.aiOriginTrial.summarizer;
  return null;
}

function resolveAILanguageModelAPI() {
  const aiGlobal = typeof self !== 'undefined' ? (self.ai || undefined) : undefined;
  if (aiGlobal?.languageModel) return aiGlobal.languageModel;
  if (typeof chrome !== 'undefined' && chrome.aiOriginTrial?.languageModel) return chrome.aiOriginTrial.languageModel;
  return null;
}

async function tryCreateSummarizer() {
  const api = resolveAISummarizerAPI();
  if (!api) return null;
  try {
    if (typeof api.capabilities === 'function') {
      const caps = await api.capabilities();
      if (caps?.available === 'no') return null;
    }
    // Options are best-effort; different channels may support different values
    const options = { type: 'paragraph', length: 'short' };
    return await api.create(options);
  } catch {
    return null;
  }
}

async function tryCreateLanguageModel() {
  const api = resolveAILanguageModelAPI();
  if (!api) return null;
  try {
    if (typeof api.capabilities === 'function') {
      const caps = await api.capabilities();
      if (caps?.available === 'no') return null;
    }
    return await api.create({
      systemPrompt: 'You are Tab Whisperer, an assistant that groups browser tabs by intent.'
    });
  } catch {
    return null;
  }
}

async function fetchTabTextContent(tabId) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        const collect = () => {
          const parts = [];
          const title = document.title || '';
          const metaDesc = document.querySelector('meta[name="description"]')?.content || '';
          const body = document.body ? document.body.innerText || '' : '';
          parts.push(title);
          if (metaDesc) parts.push(metaDesc);
          if (body) parts.push(body);
          return parts.join('\n\n');
        };
        return collect();
      }
    });
    if (typeof result === 'string') {
      // Trim overly long content to keep model input reasonable
      return result.slice(0, 12000);
    }
  } catch {}
  return '';
}

// Summarize a tab using built-in AI if available; fallback to title
async function summarizeTab(tab, summarizer, languageModel) {
  const title = tab.title || 'Untitled';
  // Prefer summarizer API
  if (summarizer) {
    try {
      const content = await fetchTabTextContent(tab.id);
      if (content) {
        const text = `Title: ${title}\n\n${content}`;
        const res = await summarizer.summarize(text);
        if (typeof res === 'string') return res;
        if (res?.summary) return res.summary;
      }
    } catch {}
  }
  // Fallback: prompt API to summarize
  if (languageModel) {
    try {
      const content = await fetchTabTextContent(tab.id);
      const prompt = `Summarize in one concise sentence for a tab dashboard. Title: "${title}". Content:\n\n${content?.slice(0, 6000) || ''}`;
      const res = await languageModel.prompt(prompt);
      if (typeof res === 'string') return res.trim();
      if (res?.output) return String(res.output).trim();
    } catch {}
  }
  // Final fallback: placeholder
  return `Summary for ${title}`;
}

// Group summaries using built-in AI if available; fallback to heuristic
async function groupSummaries(summaries, languageModel) {
  if (languageModel && summaries.length) {
    try {
      const items = summaries.map((s) => ({
        title: s.title,
        summary: (s.summary || '').slice(0, 400),
        url: s.url
      }));
      const instruction = [
        'You are organizing browser tabs into human-friendly categories like Research, Shopping, Entertainment, Work, etc.',
        'Return ONLY compact JSON with this shape: {"groups": {"Category": [{"title": string, "summary": string, "url": string}]}}',
        'No explanations or markdown. Ensure valid JSON and avoid code fences.'
      ].join(' ');
      const prompt = `${instruction}\nTabs:\n${JSON.stringify(items)}`;
      const raw = await languageModel.prompt(prompt);
      const text = typeof raw === 'string' ? raw : (raw?.output ? String(raw.output) : '');
      const jsonText = text.replace(/^```(?:json)?|```$/g, '');
      const parsed = JSON.parse(jsonText);
      if (parsed && parsed.groups && typeof parsed.groups === 'object') {
        // Validate groups entries are arrays
        const cleaned = {};
        for (const [k, v] of Object.entries(parsed.groups)) {
          if (Array.isArray(v)) {
            // Map back to original items including tabId and favicon
            cleaned[k] = v.map((item) => {
              const match = summaries.find((s) => s.url === item.url || s.title === item.title);
              return match || {
                tabId: null,
                url: item.url || '',
                title: item.title || '',
                favIconUrl: '',
                summary: item.summary || ''
              };
            });
          }
        }
        if (Object.keys(cleaned).length) return cleaned;
      }
    } catch {}
  }

  // Heuristic fallback
  const groups = { Research: [], Shopping: [], Entertainment: [], Work: [], Other: [] };
  for (const item of summaries) {
    const text = `${item.title} ${item.summary}`.toLowerCase();
    if (/(paper|research|arxiv|wiki|docs|guide)/.test(text)) groups.Research.push(item);
    else if (/(amazon|ebay|shop|price|deal|buy|cart)/.test(text)) groups.Shopping.push(item);
    else if (/(youtube|netflix|spotify|game|movie|music)/.test(text)) groups.Entertainment.push(item);
    else if (/(jira|github|gitlab|slack|notion|figma|drive)/.test(text)) groups.Work.push(item);
    else groups.Other.push(item);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length));
}

async function fetchAllTabs() {
  return await chrome.tabs.query({});
}

async function processTabsAndStore() {
  const tabs = await fetchAllTabs();
  // Create AI instances once per run
  const [summarizer, languageModel] = await Promise.all([
    tryCreateSummarizer(),
    tryCreateLanguageModel()
  ]);

  const summaries = [];
  for (const tab of tabs) {
    if (!tab.id || tab.pendingUrl === 'chrome://newtab/' || tab.url?.startsWith('chrome://')) continue;
    const summary = await summarizeTab(tab, summarizer, languageModel);
    summaries.push({
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url || '',
      title: tab.title || '',
      favIconUrl: tab.favIconUrl || '',
      summary
    });
  }

  const grouped = await groupSummaries(summaries, languageModel);
  const payload = { generatedAt: Date.now(), groups: grouped };
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

// Expose functions for potential unit tests in dev
export { summarizeTab, groupSummaries, tryCreateSummarizer, tryCreateLanguageModel };

