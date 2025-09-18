const MESSAGE_TYPES = {
  PROCESS_TABS: 'PROCESS_TABS',
  GET_LATEST_GROUPS: 'GET_LATEST_GROUPS',
  SAVE_SESSION: 'SAVE_SESSION'
};

const els = {
  processBtn: document.getElementById('processBtn'),
  saveBtn: document.getElementById('saveBtn'),
  reloadBtn: document.getElementById('reloadBtn'),
  searchInput: document.getElementById('searchInput'),
  groupsContainer: document.getElementById('groupsContainer'),
  emptyState: document.getElementById('emptyState'),
  darkModeToggle: document.getElementById('darkModeToggle')
};

function toggleEmpty(show) {
  els.emptyState.style.display = show ? 'block' : 'none';
}

function createFavicon(url) {
  const img = document.createElement('img');
  img.width = 16;
  img.height = 16;
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  try {
    const u = new URL(url);
    img.src = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    img.src = '';
  }
  return img;
}

function renderGroups(groups) {
  els.groupsContainer.innerHTML = '';
  const groupNames = Object.keys(groups);
  if (groupNames.length === 0) {
    toggleEmpty(true);
    return;
  }
  toggleEmpty(false);

  for (const groupName of groupNames) {
    const items = groups[groupName];
    const groupEl = document.createElement('section');
    groupEl.className = 'group';

    const headerEl = document.createElement('div');
    headerEl.className = 'group-header';
    const titleEl = document.createElement('h2');
    titleEl.textContent = `${groupName} (${items.length})`;
    const chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.className = 'chevron';
    headerEl.appendChild(titleEl);
    headerEl.appendChild(chevron);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'group-body';

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'card';

      const row = document.createElement('div');
      row.className = 'row';
      row.appendChild(createFavicon(item.url));
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title || item.url;
      row.appendChild(title);
      card.appendChild(row);

      const summary = document.createElement('div');
      summary.className = 'summary';
      summary.textContent = item.summary;
      card.appendChild(summary);

      const actions = document.createElement('div');
      actions.className = 'actions';
      const activateBtn = document.createElement('button');
      activateBtn.textContent = 'Switch to tab';
      activateBtn.className = 'btn';
      activateBtn.addEventListener('click', async () => {
        try {
          await chrome.tabs.update(item.tabId, { active: true });
        } catch (e) {
          console.warn('Failed to activate tab', e);
        }
      });
      actions.appendChild(activateBtn);
      card.appendChild(actions);

      bodyEl.appendChild(card);
    }

    headerEl.addEventListener('click', () => {
      groupEl.classList.toggle('collapsed');
      if (groupEl.classList.contains('collapsed')) {
        bodyEl.style.display = 'none';
      } else {
        bodyEl.style.display = '';
      }
    });

    groupEl.appendChild(headerEl);
    groupEl.appendChild(bodyEl);
    els.groupsContainer.appendChild(groupEl);
  }
}

async function request(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response || { ok: false, error: 'No response' });
    });
  });
}

async function loadLatest() {
  const res = await request(MESSAGE_TYPES.GET_LATEST_GROUPS);
  if (res.ok) renderGroups(res.data.groups || {});
}

async function processNow() {
  setLoading(true);
  const res = await request(MESSAGE_TYPES.PROCESS_TABS);
  setLoading(false);
  if (res.ok) renderGroups(res.data.groups || {});
}

async function saveSession() {
  const name = prompt('Name this session (optional):') || undefined;
  const res = await request(MESSAGE_TYPES.SAVE_SESSION, { name });
  if (res.ok) {
    toast('Session saved');
  } else {
    toast('Failed to save');
  }
}

function toast(message) {
  const t = document.createElement('div');
  t.textContent = message;
  t.style.position = 'fixed';
  t.style.bottom = '12px';
  t.style.right = '12px';
  t.style.background = 'rgba(0,0,0,.7)';
  t.style.color = 'white';
  t.style.padding = '8px 10px';
  t.style.borderRadius = '6px';
  t.style.fontSize = '12px';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1500);
}

function setLoading(isLoading) {
  els.processBtn.disabled = isLoading;
  els.processBtn.textContent = isLoading ? 'Processing…' : 'Summarize & Group';
}

function filterGroups(query) {
  query = query.trim().toLowerCase();
  const sections = els.groupsContainer.querySelectorAll('.group');
  sections.forEach((section) => {
    const body = section.querySelector('.group-body');
    const cards = body.querySelectorAll('.card');
    let visibleCount = 0;
    cards.forEach((card) => {
      const title = card.querySelector('.title').textContent.toLowerCase();
      const summary = card.querySelector('.summary').textContent.toLowerCase();
      const show = !query || title.includes(query) || summary.includes(query);
      card.style.display = show ? '' : 'none';
      if (show) visibleCount++;
    });
    section.style.display = visibleCount ? '' : 'none';
  });
}

function initTheme() {
  chrome.storage.local.get('theme', ({ theme }) => {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light', isLight);
    els.darkModeToggle.checked = isLight;
  });

  els.darkModeToggle.addEventListener('change', () => {
    const isLight = els.darkModeToggle.checked;
    document.documentElement.classList.toggle('light', isLight);
    chrome.storage.local.set({ theme: isLight ? 'light' : 'dark' });
  });
}

function init() {
  initTheme();
  loadLatest();
  els.processBtn.addEventListener('click', processNow);
  els.saveBtn.addEventListener('click', saveSession);
  els.reloadBtn.addEventListener('click', loadLatest);
  els.searchInput.addEventListener('input', (e) => filterGroups(e.target.value));
}

document.addEventListener('DOMContentLoaded', init);

