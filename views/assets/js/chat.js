/* InvisiProxy Live Chat — shared mini chat widget.
 *
 * Messages are stored in a Supabase (Postgres) table so every visitor on the
 * site can read and reply. The table is wiped every day at 12:00 PM Eastern
 * by a scheduled job on Supabase (pg_cron), so no client cleanup is needed.
 *
 * Setup: paste your project URL + anon key into the two constants below,
 * then run the SQL from CHAT_SETUP.md in the Supabase SQL editor.
 */
(() => {
  // ── Configuration ──────────────────────────────────────────────────────
  const SUPABASE_URL = 'https://uigmxogewcaksotxkhji.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_rqgnsYMn_Pvus4uS5NmdBA_jJYxdrHM';

  const POLL_MS = 3000; // how often to check for new messages
  const MAX_MESSAGES = 60; // how many recent messages to display
  const NAME_KEY = 'ivChatName';
  const OPEN_KEY = 'ivChatOpen'; // legacy (pre-dock) state key
  const STATE_KEY = 'ivChatState';
  // ────────────────────────────────────────────────────────────────────────

  // Tolerate trailing slashes, /rest/v1 suffixes, or stray whitespace.
  const SB_URL = SUPABASE_URL.trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/, '');
  const SB_KEY = SUPABASE_ANON_KEY.trim();

  const isConfigured =
    /^https:\/\/[\w-]+\.supabase\.(co|in)$/.test(SB_URL) &&
    SB_KEY.length > 20 &&
    !SB_KEY.includes('YOUR_');

  const apiHeaders = {
    apikey: SB_KEY,
    Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
  };

  // The site's loader re-executes head scripts on every page navigation.
  // Clear any previous instance's polling timer before re-initializing.
  if (window.__ivChatTimer) clearInterval(window.__ivChatTimer);
  window.__ivChatTimer = null;

  const stopPolling = () => {
    if (window.__ivChatTimer) clearInterval(window.__ivChatTimer);
    window.__ivChatTimer = null;
  };

  const init = () => {
    // Remove any leftover markup from a previous instance.
    document.querySelectorAll('#iv-chat-root').forEach((node) => node.remove());

    // ── Build the widget DOM (all text set via textContent — no HTML injection) ──
    const root = document.createElement('div');
    root.id = 'iv-chat-root';

    const toggle = document.createElement('button');
    toggle.id = 'iv-chat-toggle';
    toggle.type = 'button';
    toggle.title = 'Toggle live chat';
    toggle.setAttribute('aria-label', 'Toggle live chat');
    toggle.textContent = '💬';

    const panel = document.createElement('div');
    panel.id = 'iv-chat-panel';

    const header = document.createElement('div');
    header.className = 'iv-chat-header';
    const title = document.createElement('span');
    title.className = 'iv-chat-title';
    title.textContent = 'Live Chat';
    const clearInfo = document.createElement('span');
    clearInfo.className = 'iv-chat-clear';
    clearInfo.textContent = 'clears daily 12pm ET';
    const hide = document.createElement('button');
    hide.id = 'iv-chat-hide';
    hide.type = 'button';
    hide.title = 'Hide to the side';
    hide.setAttribute('aria-label', 'Hide chat to the side');
    hide.textContent = '\u276e';

    header.appendChild(title);
    header.appendChild(clearInfo);
    header.appendChild(hide);

    const list = document.createElement('div');
    list.id = 'iv-chat-messages';

    const compose = document.createElement('div');
    compose.className = 'iv-chat-compose';

    const nameInput = document.createElement('input');
    nameInput.id = 'iv-chat-name';
    nameInput.className = 'iv-chat-name';
    nameInput.type = 'text';
    nameInput.maxLength = 32;
    nameInput.placeholder = 'Name';
    nameInput.setAttribute('aria-label', 'Your name');

    const row = document.createElement('div');
    row.className = 'iv-chat-row';

    const msgInput = document.createElement('input');
    msgInput.id = 'iv-chat-input';
    msgInput.type = 'text';
    msgInput.maxLength = 500;
    msgInput.placeholder = 'Type a message…';
    msgInput.setAttribute('aria-label', 'Chat message');
    msgInput.autocomplete = 'off';

    const send = document.createElement('button');
    send.id = 'iv-chat-send';
    send.type = 'button';
    send.textContent = 'Send';

    const hint = document.createElement('div');
    hint.className = 'iv-chat-hint';
    hint.textContent = isConfigured
      ? 'Everyone on this site can read and reply.'
      : 'Chat not configured yet — add Supabase keys in chat.js.';

    row.appendChild(msgInput);
    row.appendChild(send);
    compose.appendChild(nameInput);
    compose.appendChild(row);
    compose.appendChild(hint);
    const dock = document.createElement('button');
    dock.id = 'iv-chat-dock';
    dock.type = 'button';
    dock.title = 'Open live chat';
    dock.setAttribute('aria-label', 'Open live chat');
    dock.textContent = '\u276f';

    panel.appendChild(header);
    panel.appendChild(list);
    panel.appendChild(compose);
    root.appendChild(panel);
    root.appendChild(toggle);
    root.appendChild(dock);
    document.body.appendChild(root);

    // ── State ──
    const savedName = () => localStorage.getItem(NAME_KEY) || '';

    nameInput.value = savedName();

    const setState = (state, focus = false) => {
      root.classList.toggle('iv-chat-open', state === 'open');
      root.classList.toggle('iv-chat-docked', state === 'docked');
      localStorage.setItem(STATE_KEY, state);
      if (state === 'open') {
        fetchMessages();
        if (focus) (msgInput.value ? msgInput : nameInput).focus();
      }
    };

    toggle.addEventListener('click', () =>
      setState(
        root.classList.contains('iv-chat-open') ? 'closed' : 'open',
        true
      )
    );

    hide.addEventListener('click', () => setState('docked'));

    dock.addEventListener('click', () => setState('open', true));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && root.classList.contains('iv-chat-open'))
        setState('closed');
    });

    nameInput.addEventListener('input', () => {
      localStorage.setItem(NAME_KEY, nameInput.value.trim().slice(0, 32));
    });

    msgInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    // ── Rendering ──
    const renderMessages = (messages) => {
      list.textContent = '';
      const myName = savedName().toLowerCase();
      for (const entry of messages) {
        const bubble = document.createElement('div');
        const isOwn = !!myName && entry.name.toLowerCase() === myName;
        bubble.className = 'iv-chat-msg' + (isOwn ? ' iv-chat-own' : '');
        if (entry.created_at)
          bubble.title = new Date(entry.created_at).toLocaleString();

        const author = document.createElement('b');
        author.textContent = entry.name;
        bubble.appendChild(author);
        bubble.appendChild(document.createTextNode(' ' + entry.message));
        list.appendChild(bubble);
      }
      list.scrollTop = list.scrollHeight;
    };

    // ── Data (Supabase REST) ──
    let fetching = false;
    const fetchMessages = async () => {
      if (!isConfigured || fetching) return;
      fetching = true;
      try {
        const response = await fetch(
          SB_URL +
            '/rest/v1/iv_chat?select=id,created_at,name,message&order=id.desc&limit=' +
            MAX_MESSAGES,
          { headers: apiHeaders }
        );
        if (response.ok) {
          const data = await response.json();
          renderMessages(data.reverse());
          hint.textContent =
            'Everyone on this site can read and reply.';
        } else {
          hint.textContent =
            'Could not load messages (HTTP ' + response.status + ').';
        }
      } catch (error) {
        hint.textContent = 'Chat is offline right now.';
      } finally {
        fetching = false;
      }
    };

    let sending = false;
    const sendMessage = async () => {
      const name = nameInput.value.trim().slice(0, 32) || 'Anonymous';
      const message = msgInput.value.trim().slice(0, 500);
      if (!message || sending) return;

      if (!isConfigured) {
        hint.textContent =
          'Chat not configured yet — add Supabase keys in chat.js.';
        return;
      }

      sending = true;
      send.disabled = true;
      try {
        const response = await fetch(SB_URL + '/rest/v1/iv_chat', {
          method: 'POST',
          headers: { ...apiHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ name, message }),
        });
        if (response.ok) {
          msgInput.value = '';
          await fetchMessages();
        } else {
          hint.textContent =
            'Could not send (HTTP ' + response.status + ').';
        }
      } catch (error) {
        hint.textContent = 'Could not send — chat is offline.';
      } finally {
        sending = false;
        send.disabled = false;
      }
    };

    send.addEventListener('click', sendMessage);

    // ── Polling loop ──
    fetchMessages();
    stopPolling();
    window.__ivChatTimer = setInterval(() => {
      if (!document.hidden) fetchMessages();
    }, POLL_MS);

    // Restore the previous state (open / closed / docked to the side), then
    // mark ready so CSS reveals the widget.
    const savedState = (() => {
      const s = localStorage.getItem(STATE_KEY);
      if (s === 'open' || s === 'closed' || s === 'docked') return s;
      return localStorage.getItem(OPEN_KEY) === '1' ? 'open' : 'closed';
    })();
    setState(savedState);
    root.classList.add('iv-chat-ready');
  };

  if ('loading' === document.readyState)
    document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
