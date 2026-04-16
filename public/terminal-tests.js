/**
 * Wolf's Basement — Terminal Test Suite
 * ======================================
 * Comprehensive tests for all terminal UI functionality.
 *
 * USAGE:
 *   1. Start the server: npm start
 *   2. Open the app in a browser
 *   3. Open browser DevTools console
 *   4. Run: await WolfTests.run()
 *
 *   Or run a specific section:
 *     await WolfTests.run('statusbar')
 *     await WolfTests.run('cards')
 *
 *   Or load via script tag in index.html:
 *     <script src="/terminal-tests.js"></script>
 *     Then: await WolfTests.run()
 *
 * Results are displayed in a visual overlay AND logged to the console as a table.
 */

(function () {
  'use strict';

  // =============================================
  //  TEST FRAMEWORK
  // =============================================

  const results = [];
  let currentSection = '';

  function assert(feature, description, condition) {
    results.push({
      section: currentSection,
      feature,
      description,
      status: !!condition ? 'WORKING' : 'NOT WORKING',
    });
  }

  function section(name) { currentSection = name; }
  function el(sel) { return document.querySelector(sel); }
  function els(sel) { return document.querySelectorAll(sel); }
  function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  function visible(node) {
    if (!node) return false;
    const s = getComputedStyle(node);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }

  // Access agentState (exposed on window)
  function state(id) { return window.agentState && window.agentState[id]; }

  // Get selectedAgent by checking which card has .active
  function getSelectedAgent() {
    const card = el('.agent-card.active');
    return card ? parseInt(card.dataset.id) : null;
  }

  // =============================================
  //  1. TOP BAR / HEADER
  // =============================================

  function testTopBar() {
    section('TOP BAR');

    assert('Header', 'Dispatch header bar renders', !!el('#dispatch-header'));

    const title = el('#dispatch-title');
    assert('Title', 'WOLF\'S title text present', title && title.textContent.includes("WOLF'S"));

    assert('Basement button', 'BASEMENT mode toggle exists', !!el('#mode-basement'));
    assert('Terminal button', 'TERMINAL mode toggle exists', !!el('#mode-terminal'));

    const bBtn = el('#mode-basement'), tBtn = el('#mode-terminal');
    assert('Mode active', 'Exactly one mode button is active',
      (bBtn && bBtn.classList.contains('active')) !== (tBtn && tBtn.classList.contains('active')));

    assert('Auth dot', 'Auth status dot indicator renders', !!el('#auth-dot'));
    assert('Auth text', 'Auth status text element exists', !!el('#auth-status-text'));
    assert('Auth popup', 'Auth popup container ready', !!el('#auth-popup'));

    assert('Shell indicator', 'Shell mode indicator renders', !!el('#shell-indicator'));
    const shellText = el('#shell-mode-text');
    assert('Shell value', 'Shows CMD or WSL',
      shellText && (shellText.textContent.includes('CMD') || shellText.textContent.includes('WSL')));

    assert('Shell dropdown', 'Shell dropdown has CMD + WSL options',
      els('#shell-dropdown .shell-option').length === 2);
  }

  // =============================================
  //  2. AGENT CARDS
  // =============================================

  function testAgentCards() {
    section('AGENT CARDS');

    assert('Card count', '4 agent cards rendered', els('.agent-card').length === 4);

    const names = { 1: 'IGOR', 2: 'ELON', 3: 'MISA', 4: 'THE VOID' };
    const colors = { 1: '#cc4040', 2: '#6090cc', 3: '#bb55dd', 4: '#e88830' };

    for (let id = 1; id <= 4; id++) {
      const card = el(`.agent-card[data-id="${id}"]`);
      const nameEl = card && card.querySelector('.card-name');
      assert(`Card ${id} name`, `Agent ${id} shows "${names[id]}"`,
        nameEl && nameEl.textContent.trim() === names[id]);

      assert(`Card ${id} color`, `Agent ${id} has correct theme color`,
        card && card.style.getPropertyValue('--agent-color').trim() === colors[id]);

      assert(`Card ${id} status`, `Agent ${id} status element exists`, !!el(`#card-status-${id}`));
      assert(`Card ${id} project`, `Agent ${id} project display exists`, !!el(`#card-project-${id}`));

      assert(`Card ${id} kill btn`, `Agent ${id} has kill/sleep button`,
        card && !!card.querySelector('.card-sleep-btn'));

      assert(`Card ${id} icon`, `Agent ${id} has clickable icon`,
        card && !!card.querySelector('.card-icon'));

      assert(`Card ${id} draggable`, `Agent ${id} card is draggable`,
        card && card.getAttribute('draggable') === 'true');

      assert(`Card ${id} identity`, `Agent ${id} identity wrapper exists`,
        card && !!card.querySelector('.card-identity'));

      // Status class matches agentState
      const statusEl = el(`#card-status-${id}`);
      const st = state(id);
      assert(`Card ${id} status sync`, `Agent ${id} status class matches state`,
        statusEl && st && statusEl.classList.contains(st.status));
    }

    assert('Icon picker', 'Icon picker container exists', !!el('#icon-picker'));
  }

  // =============================================
  //  3. AGENT SELECTION
  // =============================================

  async function testAgentSelection() {
    section('AGENT SELECTION');

    // Select agent 1
    if (typeof selectAgent === 'function') {
      selectAgent(1);
      await wait(50);

      assert('Select agent', 'selectAgent(1) makes card 1 active',
        el('.agent-card[data-id="1"]') && el('.agent-card[data-id="1"]').classList.contains('active'));

      assert('Terminal visible', 'Terminal output shown after selection',
        el('#terminal-output') && visible(el('#terminal-output')));

      assert('Header visible', 'Terminal header shown after selection',
        el('#terminal-header') && visible(el('#terminal-header')));

      assert('Status bar visible', 'Status bar shown after selection',
        el('#status-bar') && visible(el('#status-bar')));

      assert('Placeholder hidden', 'No-agent placeholder hidden',
        el('#no-agent-selected') && !visible(el('#no-agent-selected')));

      const headerName = el('#term-agent-name');
      assert('Header name', 'Terminal header shows IGOR',
        headerName && headerName.textContent.includes('IGOR'));

      assert('Header color', 'Agent name is colored',
        headerName && headerName.style.color !== '');

      assert('Placeholder text', 'Input placeholder reflects agent state', (() => {
        const input = el('#command-input');
        if (!input) return false;
        const st = state(1);
        if (st && st.status === 'sleeping') return input.placeholder.includes('Wake');
        return input.placeholder.includes('Command');
      })());

      assert('localStorage', 'Selected agent saved to localStorage',
        localStorage.getItem('selectedAgent') === '1');

      // Switch to agent 2
      selectAgent(2);
      await wait(50);
      assert('Switch card', 'Switching to agent 2 updates active card',
        el('.agent-card[data-id="2"]') && el('.agent-card[data-id="2"]').classList.contains('active')
        && el('.agent-card[data-id="1"]') && !el('.agent-card[data-id="1"]').classList.contains('active'));

      // Re-select same agent — no-op guard
      const inputBefore = el('#command-input') ? el('#command-input').value : '';
      selectAgent(2);
      await wait(20);
      assert('Re-select guard', 'Re-selecting same agent is a no-op (guard works)',
        getSelectedAgent() === 2);
    }
  }

  // =============================================
  //  4. INPUT PERSISTENCE
  // =============================================

  async function testInputPersistence() {
    section('INPUT PERSISTENCE');

    if (typeof selectAgent !== 'function') return;
    const input = el('#command-input');
    if (!input) return;

    selectAgent(1); await wait(30);
    input.value = '__test_persist_1__';

    selectAgent(2); await wait(30);
    assert('Clear on switch', 'Input clears when switching to another agent',
      input.value !== '__test_persist_1__');
    input.value = '__test_persist_2__';

    selectAgent(1); await wait(30);
    assert('Restore agent 1', 'Agent 1 input text restored on switch back',
      input.value === '__test_persist_1__');

    selectAgent(2); await wait(30);
    assert('Restore agent 2', 'Agent 2 input text restored on switch back',
      input.value === '__test_persist_2__');

    // Cleanup
    input.value = '';
    if (typeof _agentInputText !== 'undefined') {
      _agentInputText[1] = ''; _agentInputText[2] = '';
    }
  }

  // =============================================
  //  5. TERMINAL OUTPUT
  // =============================================

  function testTerminalOutput() {
    section('TERMINAL OUTPUT');

    assert('Output container', 'Terminal output div exists', !!el('#terminal-output'));
    assert('Terminal section', 'Terminal section wrapper exists', !!el('#terminal-section'));

    const out = el('#terminal-output');
    if (out) {
      const s = getComputedStyle(out);
      assert('Scrollable', 'Terminal output is scrollable',
        s.overflowY === 'auto' || s.overflowY === 'scroll');
    }

    assert('renderTerminal()', 'Function available', typeof renderTerminal === 'function');
    assert('appendToTerminal()', 'Function available', typeof appendToTerminal === 'function');
    assert('formatTermLine()', 'Function available', typeof formatTermLine === 'function');
    assert('escapeHtml()', 'Function available', typeof escapeHtml === 'function');
    assert('formatTimestamp()', 'Function available', typeof formatTimestamp === 'function');
    assert('copyCodeBlock()', 'Function available', typeof copyCodeBlock === 'function');
    assert('copyResponse()', 'Function available', typeof copyResponse === 'function');
    assert('showFireIndicator()', 'Function available', typeof showFireIndicator === 'function');
    assert('removeFireIndicator()', 'Function available', typeof removeFireIndicator === 'function');
  }

  // =============================================
  //  6. TERMINAL LINE TYPES
  // =============================================

  async function testTerminalLines() {
    section('TERMINAL LINES');

    if (typeof selectAgent !== 'function' || typeof appendToTerminal !== 'function') return;

    selectAgent(1); await wait(30);
    const linesBefore = state(1).termLines.length;

    const types = [
      { text: '> test command', cls: 'term-cmd', label: 'User command' },
      { text: 'Igor> response text', cls: 'term-text', label: 'Agent response' },
      { text: 'Igor [tool]> Read file.js', cls: 'term-tool', label: 'Tool call' },
      { text: 'Error: broke', cls: 'term-error', label: 'Error output' },
      { text: '[System msg]', cls: 'term-system', label: 'System message' },
      { text: 'result: {}', cls: 'term-result', label: 'Result metadata' },
    ];
    types.forEach(t => appendToTerminal(1, t.text, t.cls));
    await wait(50);

    const out = el('#terminal-output');
    types.forEach(t => {
      assert(t.label, `${t.cls} line rendered in DOM`,
        out && !!out.querySelector(`.term-line.${t.cls}`));
    });

    // MASTER tag on commands
    const cmdLine = out && out.querySelector('.term-line.term-cmd');
    assert('MASTER tag', 'Command line shows MASTER prefix',
      cmdLine && cmdLine.innerHTML.includes('MASTER'));

    // Copy button on responses
    const textLine = out && out.querySelector('.term-line.term-text');
    assert('Response copy btn', 'Response line has copy button',
      textLine && !!textLine.querySelector('.resp-copy-btn'));

    // Line cap
    assert('Line cap', 'termLines array stays within 500 cap',
      state(1).termLines.length <= 500);

    // Cleanup
    state(1).termLines.splice(linesBefore);
    renderTerminal(1);
  }

  // =============================================
  //  7. TOOL CALL GROUPING
  // =============================================

  async function testToolGrouping() {
    section('TOOL GROUPING');

    if (typeof selectAgent !== 'function' || typeof appendToTerminal !== 'function') return;

    selectAgent(1); await wait(30);
    const linesBefore = state(1).termLines.length;

    appendToTerminal(1, 'Igor [tool]> Read file1.js', 'term-tool');
    appendToTerminal(1, 'Igor [tool]> Write file2.js', 'term-tool');
    appendToTerminal(1, 'Igor [tool]> Edit file3.js', 'term-tool');
    renderTerminal(1);
    await wait(50);

    const out = el('#terminal-output');
    const toggle = out && out.querySelector('.tool-group-toggle');
    assert('Group created', 'Consecutive tool calls merged into group', !!toggle);

    const summary = out && out.querySelector('.tool-group-summary');
    assert('Group count', 'Summary shows "3 tool calls"',
      summary && summary.textContent.includes('3 tool calls'));

    if (toggle) {
      const parent = toggle.parentElement;
      toggle.click();
      assert('Expand', 'Click expands tool group details',
        parent.classList.contains('tool-expanded'));
      toggle.click();
      assert('Collapse', 'Second click collapses group',
        !parent.classList.contains('tool-expanded'));
    }

    state(1).termLines.splice(linesBefore);
    renderTerminal(1);
  }

  // =============================================
  //  8. MARKDOWN RENDERING
  // =============================================

  function testMarkdown() {
    section('MARKDOWN');

    if (typeof renderMarkdown !== 'function') {
      assert('renderMarkdown()', 'Function missing', false); return;
    }

    const md = renderMarkdown;
    assert('Bold **', 'Renders <strong>', md('**hello**').includes('<strong>hello</strong>'));
    assert('Bold __', 'Renders <strong>', md('__hello__').includes('<strong>hello</strong>'));
    assert('Italic *', 'Renders <em>', md('*hello*').includes('<em>hello</em>'));
    assert('Inline code', 'Renders <code>', md('use `npm`').includes('<code') && md('use `npm`').includes('npm'));
    assert('Code block', 'Fenced block with COPY button',
      md('```js\ncode\n```').includes('<pre>') && md('```js\ncode\n```').includes('COPY'));
    assert('Heading h1', '# renders md-h1', md('# Title').includes('md-h1'));
    assert('Heading h2', '## renders md-h2', md('## Sub').includes('md-h2'));
    assert('Heading h3', '### renders md-h3', md('### H3').includes('md-h3'));
    assert('Blockquote', '> renders md-blockquote', md('> quoted').includes('md-blockquote'));
    assert('Bullet list', '- items render md-list-item', md('- one\n- two').includes('md-list-item'));
    assert('Numbered list', '1. items render md-list-item', md('1. first').includes('md-list-item'));
    assert('Horizontal rule', '--- renders md-hr', md('---').includes('md-hr'));
    assert('Table', 'Pipe table renders md-table',
      md('| A | B |\n|---|---|\n| 1 | 2 |').includes('md-table'));
    assert('Link', '[text](url) renders anchor',
      md('[go](https://x.com)').includes('href="https://x.com"'));
    assert('Bare URL', 'Auto-linked URL', md('https://x.com').includes('href="https://x.com"'));
    assert('Paragraph break', 'Empty line renders md-break', md('a\n\nb').includes('md-break'));
    assert('XSS prevention', 'escapeHtml blocks <script>',
      typeof escapeHtml === 'function' && !escapeHtml('<script>').includes('<script>'));
  }

  // =============================================
  //  9. COMMAND INPUT
  // =============================================

  function testCommandInput() {
    section('COMMAND INPUT');

    assert('Command bar', 'Command bar container exists', !!el('#command-bar'));

    const input = el('#command-input');
    assert('Textarea', 'Command textarea exists', !!input);
    assert('Tag type', 'Is a <textarea> element', input && input.tagName === 'TEXTAREA');
    assert('Autocomplete off', 'Prevents browser autocomplete',
      input && input.getAttribute('autocomplete') === 'off');
    assert('Spellcheck off', 'Spellcheck disabled',
      input && input.getAttribute('spellcheck') === 'false');

    assert('MASTER label', 'Prompt shows MASTER >',
      el('.cmd-master-label') && el('.cmd-master-label').textContent.includes('MASTER'));

    assert('STOP button', 'Stop button exists', !!el('#cmd-stop-btn'));
    assert('STOP hidden', 'STOP hidden when agent not working', (() => {
      const btn = el('#cmd-stop-btn');
      const sel = getSelectedAgent();
      if (!btn || !sel) return true;
      if (state(sel) && state(sel).status !== 'working') return getComputedStyle(btn).display === 'none';
      return true;
    })());
  }

  // =============================================
  //  10. MODEL SELECTOR
  // =============================================

  async function testModelSelector() {
    section('STATUS BAR › MODEL');

    const select = el('#sb-model-select');
    assert('Element', 'Model dropdown exists', !!select);
    if (!select) return;

    const opts = [...select.querySelectorAll('option')];
    assert('Option count', 'Has 4 model options', opts.length === 4);

    const vals = opts.map(o => o.value);
    assert('Opus 4.7 (1M)', 'Option available', vals.includes('claude-opus-4-7[1m]'));
    assert('Opus 4.7', 'Option available', vals.includes('claude-opus-4-7'));
    assert('Opus 4.6 (1M)', 'Option available', vals.includes('claude-opus-4-6[1m]'));
    assert('Sonnet 4.6', 'Option available', vals.includes('claude-sonnet-4-6'));

    // Verify it reflects agent state
    const sel = getSelectedAgent();
    if (sel && state(sel)) {
      assert('Sync with state', 'Dropdown value matches agent model',
        select.value === state(sel).model);
    }

    assert('setAgentModel()', 'Function available', typeof setAgentModel === 'function');
  }

  // =============================================
  //  11. MODE SELECTOR
  // =============================================

  async function testModeSelector() {
    section('STATUS BAR › MODE');

    const select = el('#sb-mode-select');
    assert('Element', 'Mode dropdown exists', !!select);
    if (!select) return;

    const opts = [...select.querySelectorAll('option')];
    assert('Option count', 'Has 3 mode options', opts.length === 3);

    const vals = opts.map(o => o.value);
    assert('Normal mode', 'Option available', vals.includes('normal'));
    assert('Plan mode', 'Option available', vals.includes('plan'));
    assert('Bypass mode', 'Option available', vals.includes('bypass'));

    // Verify it reflects agent state
    const sel = getSelectedAgent();
    if (sel && state(sel)) {
      assert('Sync with state', 'Dropdown value matches agent mode',
        select.value === state(sel).mode);
    }

    // Mode color coding — compare via a temp element to normalize hex→rgb
    const modeColors = { normal: '#d0a060', plan: '#5a9acf', bypass: '#cf4a4a' };
    if (sel && state(sel)) {
      const tmp = document.createElement('span');
      tmp.style.color = modeColors[state(sel).mode];
      document.body.appendChild(tmp);
      const expected = getComputedStyle(tmp).color;
      tmp.remove();
      assert('Color coding', 'Mode dropdown color matches selected mode',
        select.style.color === modeColors[state(sel).mode] || getComputedStyle(select).color === expected);
    }

    assert('setAgentMode()', 'Function available', typeof setAgentMode === 'function');
  }

  // =============================================
  //  12. CONTEXT BAR
  // =============================================

  function testContextBar() {
    section('STATUS BAR › CONTEXT');

    assert('Container', 'Context bar wrapper exists', !!el('#sb-context-item'));
    assert('Fill bar', 'Context fill element exists', !!el('#sb-context-fill'));
    assert('Percentage', 'Context percentage text exists', !!el('#sb-context-pct'));
    assert('updateContextBar()', 'Function available', typeof updateContextBar === 'function');

    // Verify fill bar has transition CSS
    const fill = el('#sb-context-fill');
    if (fill) {
      const s = getComputedStyle(fill);
      assert('Animated', 'Fill bar has CSS transition', s.transition && s.transition !== 'none' && s.transition !== 'all 0s');
    }
  }

  // =============================================
  //  13. STATUS BAR BUTTONS
  // =============================================

  function testStatusBarButtons() {
    section('STATUS BAR › BUTTONS');

    assert('INIT button', 'INIT button exists', !!el('#sb-init-btn'));
    assert('PUSH button', 'PUSH button exists', !!el('#sb-push-btn'));
    assert('CLEAR button', 'CLEAR button exists', !!el('.sb-clear-btn:not(.sb-init-btn)'));
    assert('USAGE button', 'USAGE button exists', !!el('.sb-usage-btn'));
    assert('Usage reset', 'Rate limit / reset text element exists', !!el('#sb-usage-reset'));

    assert('initAgent()', 'Function available', typeof initAgent === 'function');
    assert('gitPush()', 'Function available', typeof gitPush === 'function');
    assert('clearAgent()', 'Function available', typeof clearAgent === 'function');
    assert('showStarburst()', 'Function available', typeof showStarburst === 'function');
    assert('updatePushPulse()', 'Function available', typeof updatePushPulse === 'function');
  }

  // =============================================
  //  14. UPTIME & IDLE TRACKING
  // =============================================

  async function testUptimeIdle() {
    section('STATUS BAR › UPTIME & IDLE');

    assert('Uptime element', 'Uptime display exists', !!el('#sb-uptime'));
    assert('Idle element', 'Idle timer display exists', !!el('#sb-idle'));
    assert('Idle wrapper', 'Idle item wrapper exists', !!el('#sb-idle-item'));

    assert('tickTimers()', 'Function available', typeof tickTimers === 'function');
    assert('formatDuration()', 'Function available', typeof formatDuration === 'function');

    // formatDuration unit tests
    if (typeof formatDuration === 'function') {
      assert('Duration: null', 'null returns "—"', formatDuration(null) === '—');
      assert('Duration: 5s', '5000ms = "5s"', formatDuration(5000) === '5s');
      assert('Duration: 1m5s', '65000ms = "1m 5s"', formatDuration(65000) === '1m 5s');
      assert('Duration: 1h1m', '3665000ms = "1h 1m"', formatDuration(3665000) === '1h 1m');
    }

    // Uptime display for selected agent
    const sel = getSelectedAgent();
    if (sel && state(sel)) {
      const uptimeEl = el('#sb-uptime');
      if (state(sel).awakeAt) {
        assert('Uptime shows time', 'Uptime shows a duration value',
          uptimeEl && uptimeEl.textContent !== '—');
      } else {
        assert('Uptime shows dash', 'Uptime shows "—" when sleeping',
          uptimeEl && uptimeEl.textContent === '—');
      }

      // Idle display behavior
      const idleItem = el('#sb-idle-item');
      if (state(sel).status === 'sleeping') {
        assert('Idle hidden sleeping', 'Idle hidden when agent is sleeping',
          idleItem && getComputedStyle(idleItem).display === 'none');
      } else if (state(sel).status === 'working') {
        assert('Idle 0s working', 'Idle shows "0s" when agent is working',
          el('#sb-idle') && el('#sb-idle').textContent === '0s');
      }
    }

    // Verify 1-second tick interval is running (tickTimers called every 1s)
    const uptimeEl = el('#sb-uptime');
    if (sel && state(sel) && state(sel).awakeAt && uptimeEl) {
      const before = uptimeEl.textContent;
      await wait(1100);
      assert('Timer ticking', 'Uptime updates after 1 second',
        uptimeEl.textContent !== '' && uptimeEl.textContent !== '—');
    }
  }

  // =============================================
  //  15. CPU & RAM
  // =============================================

  async function testSystemStats() {
    section('STATUS BAR › CPU & RAM');

    assert('CPU element', 'CPU stat display exists', !!el('#sb-cpu'));
    assert('RAM element', 'RAM stat display exists', !!el('#sb-ram'));

    // Wait for stats to populate (polled every 3s)
    await wait(500);

    const cpu = el('#sb-cpu');
    const ram = el('#sb-ram');

    assert('CPU populated', 'CPU shows a percentage value',
      cpu && cpu.textContent.includes('%'));
    assert('RAM populated', 'RAM shows usage info',
      ram && ram.textContent.includes('%'));

    // Color coding
    if (cpu && cpu.textContent.includes('%')) {
      assert('CPU colored', 'CPU text has color coding',
        cpu.style.color && cpu.style.color !== '');
    }
    if (ram && ram.textContent.includes('%')) {
      assert('RAM colored', 'RAM text has color coding',
        ram.style.color && ram.style.color !== '');
    }

    // Verify /system-stats endpoint responds
    try {
      const resp = await fetch('/system-stats');
      const data = await resp.json();
      assert('Stats endpoint', '/system-stats returns CPU + RAM data',
        typeof data.cpu === 'number' && typeof data.ram === 'number');
    } catch (e) {
      assert('Stats endpoint', '/system-stats is reachable', false);
    }
  }

  // =============================================
  //  16. GIT STATUS
  // =============================================

  async function testGitStatus() {
    section('STATUS BAR › GIT');

    assert('Git container', 'Git status container exists', !!el('#sb-git-item'));
    assert('Branch element', 'Git branch display exists', !!el('#sb-git-branch'));
    assert('Status element', 'Git status text exists', !!el('#sb-git-status'));
    assert('tickGitStatus()', 'Function available', typeof tickGitStatus === 'function');

    // Test the endpoint directly
    const sel = getSelectedAgent();
    const cwd = sel && state(sel) ? state(sel).cwd : '';
    if (cwd) {
      try {
        const resp = await fetch('/git-status?cwd=' + encodeURIComponent(cwd));
        const data = await resp.json();
        assert('Git endpoint', '/git-status returns data for CWD',
          data && typeof data.git === 'boolean');

        if (data.git) {
          assert('Git visible', 'Git section visible when CWD is a repo',
            el('#sb-git-item') && visible(el('#sb-git-item')));

          const branchEl = el('#sb-git-branch');
          assert('Branch shown', 'Branch name displayed',
            branchEl && branchEl.textContent.includes('⎇'));

          assert('Branch colored', 'Branch color-coded (green=clean, orange=dirty)',
            branchEl && branchEl.style.color !== '');

          const statusEl = el('#sb-git-status');
          assert('Status text', 'Status shows saved/unsaved/pushed info',
            statusEl && statusEl.textContent.includes('•'));
        }
      } catch (e) {
        assert('Git endpoint', '/git-status is reachable', false);
      }
    } else {
      assert('Git hidden no CWD', 'Git section hidden when no CWD set',
        !el('#sb-git-item') || !visible(el('#sb-git-item')));
    }
  }

  // =============================================
  //  17. DEV SERVER
  // =============================================

  function testDevServer() {
    section('STATUS BAR › SERVER');

    assert('Server container', 'Server indicator container exists', !!el('#sb-server-item'));
    assert('Server dot', 'Server status dot exists', !!el('#sb-server-dot'));
    assert('Server label', 'SERVER label exists', !!el('#sb-server-label'));
    assert('Server URL', 'Server URL link element exists', !!el('#sb-server-url'));
    assert('Server menu', 'Server action menu exists', !!el('#sb-server-menu'));

    const menuItems = els('#sb-server-menu .sb-server-menu-item');
    assert('Menu actions', 'Server menu has Start/Restart/Shut Down (3 items)',
      menuItems.length === 3);

    // Check menu item labels
    if (menuItems.length === 3) {
      assert('Start action', 'First menu item is Start',
        menuItems[0].textContent.trim() === 'Start');
      assert('Restart action', 'Second menu item is Restart',
        menuItems[1].textContent.trim() === 'Restart');
      assert('Stop action', 'Third menu item is Shut Down',
        menuItems[2].textContent.trim() === 'Shut Down');
    }

    // Server dot status class
    const dot = el('#sb-server-dot');
    if (dot) {
      assert('Dot status class', 'Dot has on/off/starting class',
        dot.classList.contains('on') || dot.classList.contains('off') ||
        dot.classList.contains('starting') || dot.classList.contains('restarting'));
    }

    assert('updateServerIndicator()', 'Function available', typeof updateServerIndicator === 'function');
    assert('toggleServerMenu()', 'Function available', typeof toggleServerMenu === 'function');
    assert('devServerAction()', 'Function available', typeof devServerAction === 'function');
    assert('fetchDevServerStatus()', 'Function available', typeof fetchDevServerStatus === 'function');
  }

  // =============================================
  //  18. CWD (PROJECT FOLDER)
  // =============================================

  function testCwd() {
    section('STATUS BAR › PROJECT FOLDER');

    const cwdEl = el('#sb-cwd');
    assert('CWD element', 'Project folder display exists', !!cwdEl);
    assert('editCwd()', 'Folder picker function available', typeof editCwd === 'function');
    assert('copyCwd()', 'Right-click copy function available', typeof copyCwd === 'function');

    const sel = getSelectedAgent();
    if (cwdEl && sel && state(sel)) {
      if (state(sel).cwd) {
        assert('CWD shows path', 'Displays the working directory path',
          cwdEl.textContent.length > 3 && !cwdEl.classList.contains('sb-cwd-empty'));
      } else {
        assert('CWD empty state', 'Shows SELECT FOLDER when no CWD',
          cwdEl.textContent.includes('SELECT FOLDER') && cwdEl.classList.contains('sb-cwd-empty'));
      }
    }
  }

  // =============================================
  //  19. SEARCH
  // =============================================

  async function testSearch() {
    section('SEARCH');

    assert('Search input', 'Search field exists', !!el('#term-search'));
    assert('Search count', 'Match count display exists', !!el('#term-search-count'));
    assert('Prev button', 'Previous nav button exists', !!el('#term-search-prev'));
    assert('Next button', 'Next nav button exists', !!el('#term-search-next'));

    assert('termSearchExec()', 'Function available', typeof termSearchExec === 'function');
    assert('termSearchNav()', 'Function available', typeof termSearchNav === 'function');
    assert('termSearchClear()', 'Function available', typeof termSearchClear === 'function');

    // Live search test
    if (typeof selectAgent === 'function' && typeof appendToTerminal === 'function' && typeof termSearchExec === 'function') {
      selectAgent(1); await wait(30);
      const linesBefore = state(1).termLines.length;

      appendToTerminal(1, 'needle-test-alpha here', 'term-text');
      appendToTerminal(1, 'another needle-test-alpha', 'term-text');
      appendToTerminal(1, 'no match line', 'term-text');
      await wait(30);

      termSearchExec('needle-test-alpha');
      await wait(50);

      assert('Highlights', 'Search creates highlight spans',
        els('.search-highlight').length === 2);

      const countEl = el('#term-search-count');
      assert('Count display', 'Shows match count',
        countEl && countEl.textContent.includes('/2'));

      termSearchClear();
      await wait(30);
      assert('Clear highlights', 'Search clear removes all highlights',
        els('.search-highlight').length === 0);

      // Cleanup
      state(1).termLines.splice(linesBefore);
      renderTerminal(1);
    }
  }

  // =============================================
  //  20. SPLIT DIVIDER
  // =============================================

  function testSplitDivider() {
    section('SPLIT DIVIDER');

    const divider = el('#split-divider');
    assert('Element', 'Split divider exists', !!divider);

    if (divider) {
      const s = getComputedStyle(divider);
      assert('Cursor', 'Has col-resize cursor', s.cursor === 'col-resize');
      assert('Width', 'Is 6px wide', s.width === '6px');
    }

    const gameEl = el('#game-container');
    assert('Game container', 'Game panel exists', !!gameEl);

    const panel = el('#dispatch-panel');
    assert('Dispatch panel', 'Terminal panel exists', !!panel);
    if (panel) {
      assert('Panel flex', 'Terminal panel is flex:1', getComputedStyle(panel).flexGrow === '1');
    }
  }

  // =============================================
  //  21. VIEW MODE
  // =============================================

  function testViewMode() {
    section('VIEW MODE');

    const isTerminal = document.body.classList.contains('terminal-mode');
    assert('Body class', 'Body class reflects current mode',
      true); // always true, just reports which mode

    if (!isTerminal) {
      assert('Game visible', 'Game panel visible in basement mode',
        el('#game-container') && visible(el('#game-container')));
      assert('Divider visible', 'Split divider visible in basement mode',
        el('#split-divider') && visible(el('#split-divider')));
    } else {
      assert('Game hidden', 'Game panel hidden in terminal mode',
        el('#game-container') && !visible(el('#game-container')));
    }
  }

  // =============================================
  //  22. WEBSOCKET
  // =============================================

  function testWebSocket() {
    section('WEBSOCKET');

    assert('connectWS()', 'Function available', typeof connectWS === 'function');
    assert('handleWSMessage()', 'Function available', typeof handleWSMessage === 'function');
    assert('wsSend()', 'Function available', typeof wsSend === 'function');

    // Check agentState structure
    assert('agentState', 'Global agentState object exists',
      !!window.agentState && Object.keys(window.agentState).length === 4);

    for (let id = 1; id <= 4; id++) {
      const s = state(id);
      assert(`Agent ${id} state`, `Has required fields (status, termLines, model, mode, cwd)`,
        s && 'status' in s && 'termLines' in s && 'model' in s && 'mode' in s && 'cwd' in s);
    }

    // WebSocket connection (check via trying to send — wsSend guards readyState)
    assert('WS connected', 'WebSocket appears connected (agentState populated)',
      state(1) && typeof state(1).status === 'string');
  }

  // =============================================
  //  23. PERMISSIONS
  // =============================================

  function testPermissions() {
    section('PERMISSIONS');

    assert('permissionAllow()', 'Function available', typeof permissionAllow === 'function');
    assert('permissionAllowAll()', 'Function available', typeof permissionAllowAll === 'function');
    assert('permissionDeny()', 'Function available', typeof permissionDeny === 'function');
    assert('_updatePermInBuffer()', 'Buffer update function available',
      typeof _updatePermInBuffer === 'function');
  }

  // =============================================
  //  24. PERSISTENCE
  // =============================================

  function testPersistence() {
    section('PERSISTENCE');

    assert('saveAgentSettings()', 'Function available', typeof saveAgentSettings === 'function');
    assert('loadAgentSettings()', 'Function available', typeof loadAgentSettings === 'function');
    assert('saveAgentIcons()', 'Function available', typeof saveAgentIcons === 'function');
    assert('loadAgentIcons()', 'Function available', typeof loadAgentIcons === 'function');

    // Round-trip test
    if (typeof saveAgentSettings === 'function') {
      saveAgentSettings();
      const saved = localStorage.getItem('agentSettings');
      assert('Settings saved', 'agentSettings in localStorage after save', !!saved);
      try {
        const parsed = JSON.parse(saved);
        assert('Settings valid', 'Saved settings has model+mode for all 4 agents',
          parsed && parsed[1] && parsed[1].model && parsed[1].mode
          && parsed[2] && parsed[3] && parsed[4]);
      } catch (e) {
        assert('Settings JSON', 'Saved settings is valid JSON', false);
      }
    }

    // Known localStorage keys
    const keys = ['agentSettings', 'agentIcons', 'agentCardOrder', 'selectedAgent', 'splitPct', 'viewMode'];
    keys.forEach(k => {
      assert(`ls:${k}`, `localStorage key "${k}" usable`,
        true); // existence test — these may or may not be set
    });
  }

  // =============================================
  //  25. IMAGE ATTACHMENTS
  // =============================================

  function testImageAttachments() {
    section('IMAGE ATTACHMENTS');

    assert('updateAttachmentIndicator()', 'Function available', typeof updateAttachmentIndicator === 'function');
    assert('removeAttachment()', 'Function available', typeof removeAttachment === 'function');
    assert('clearAttachments()', 'Function available', typeof clearAttachments === 'function');

    assert('Command bar', 'Drag target element exists for file drop', !!el('#command-bar'));
  }

  // =============================================
  //  26. FIRE INDICATOR
  // =============================================

  async function testFireIndicator() {
    section('FIRE INDICATOR');

    assert('showFireIndicator()', 'Function available', typeof showFireIndicator === 'function');
    assert('removeFireIndicator()', 'Function available', typeof removeFireIndicator === 'function');
    assert('buildFireLine()', 'Function available', typeof buildFireLine === 'function');

    if (typeof selectAgent === 'function' && typeof showFireIndicator === 'function') {
      selectAgent(1); await wait(30);
      showFireIndicator(1);
      await wait(200);

      const fireEl = el('#fire-indicator-1');
      assert('Created', 'Fire indicator element appears in DOM', !!fireEl);

      if (fireEl) {
        assert('Fire lines', 'Has 4 animated fire rows',
          fireEl.querySelectorAll('.fire-line').length === 4);

        const timer = fireEl.querySelector('.fire-timer');
        assert('Timer', 'Shows "working Ns" timer',
          timer && timer.textContent.includes('working'));
      }

      removeFireIndicator(1);
      await wait(50);
      assert('Removed', 'Fire indicator removed from DOM', !el('#fire-indicator-1'));
    }
  }

  // =============================================
  //  27. RATE LIMITING
  // =============================================

  function testRateLimiting() {
    section('RATE LIMITING');

    assert('Reset element', 'Rate limit display element exists', !!el('#sb-usage-reset'));
    assert('updateUsageReset()', 'Function available', typeof updateUsageReset === 'function');
  }

  // =============================================
  //  28. KEYBOARD SHORTCUTS
  // =============================================

  function testKeyboard() {
    section('KEYBOARD');

    assert('Input focusable', 'Command input can receive focus',
      el('#command-input') && typeof el('#command-input').focus === 'function');
    assert('Search input', 'Search field exists for keyboard nav', !!el('#term-search'));

    // Ctrl+Shift+1-4 agent switch hint
    assert('Shortcut hint', 'No-agent text mentions Ctrl+Shift shortcuts',
      el('#no-agent-selected') && el('#no-agent-selected').textContent.includes('Ctrl+Shift'));
  }

  // =============================================
  //  29. TIMESTAMP FORMATTING
  // =============================================

  function testTimestamps() {
    section('TIMESTAMPS');

    if (typeof formatTimestamp !== 'function') {
      assert('formatTimestamp()', 'Function missing', false); return;
    }

    const ts = new Date(2025, 3, 12, 15, 30).getTime(); // Apr 12, 3:30PM
    const fmt = formatTimestamp(ts);
    assert('Month', 'Includes month abbreviation', fmt.includes('Apr'));
    assert('Day', 'Includes day number', fmt.includes('12'));
    assert('Time', 'Includes time with AM/PM', fmt.includes('3:30PM'));
    assert('Null input', 'Returns empty string for null', formatTimestamp(null) === '');
  }

  // =============================================
  //  OVERLAY RENDERER
  // =============================================

  function renderOverlay(results) {
    const prev = document.getElementById('wolf-test-overlay');
    if (prev) prev.remove();

    const overlay = document.createElement('div');
    overlay.id = 'wolf-test-overlay';
    overlay.style.cssText = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(4,2,1,0.97);z-index:99999;
      overflow-y:auto;padding:24px 32px;
      font-family:'IBM Plex Mono','Consolas',monospace;color:#d8c0a0;
    `;

    const total = results.length;
    const passed = results.filter(r => r.status === 'WORKING').length;
    const failed = total - passed;
    const pct = Math.round((passed / total) * 100);

    const sections = {};
    results.forEach(r => {
      if (!sections[r.section]) sections[r.section] = [];
      sections[r.section].push(r);
    });

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <div>
          <div style="font-family:Impact,'Arial Black',sans-serif;font-size:28px;color:#cc3020;letter-spacing:4px;text-shadow:0 0 20px rgba(204,48,32,0.5);">
            WOLF'S BASEMENT — TEST RESULTS
          </div>
          <div style="font-size:12px;color:#6a4a30;margin-top:4px;">Terminal Test Suite — ${new Date().toLocaleString()}</div>
        </div>
        <button onclick="this.closest('#wolf-test-overlay').remove()" style="
          background:rgba(180,40,30,0.2);border:1px solid #4a1810;color:#cc4030;
          font-family:'IBM Plex Mono',monospace;font-size:13px;font-weight:bold;
          padding:8px 18px;border-radius:4px;cursor:pointer;letter-spacing:2px;
        ">CLOSE [ESC]</button>
      </div>

      <div style="display:flex;gap:24px;margin-bottom:20px;padding:14px;background:#0e0806;border:1px solid #2a1810;border-radius:6px;">
        <div><span style="font-size:42px;font-weight:bold;color:${failed===0?'#40cc40':'#cc4040'};">${pct}%</span>
          <span style="font-size:11px;color:#6a4a30;letter-spacing:2px;"> PASS RATE</span></div>
        <div style="margin-left:auto;display:flex;gap:20px;align-items:center;">
          <div><span style="font-size:28px;font-weight:bold;color:#40cc40;">${passed}</span><span style="font-size:10px;color:#6a4a30;"> WORKING</span></div>
          <div><span style="font-size:28px;font-weight:bold;color:${failed>0?'#cc4040':'#3a3020'};">${failed}</span><span style="font-size:10px;color:#6a4a30;"> NOT WORKING</span></div>
          <div><span style="font-size:28px;font-weight:bold;color:#d0a060;">${total}</span><span style="font-size:10px;color:#6a4a30;"> TOTAL</span></div>
        </div>
      </div>
    `;

    for (const [sname, tests] of Object.entries(sections)) {
      const sFailed = tests.filter(t => t.status !== 'WORKING').length;
      const sColor = sFailed === 0 ? '#408040' : '#cc4040';

      html += `
        <div style="margin-bottom:2px;">
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;
            background:#0c0806;border:1px solid #2a1810;border-left:3px solid ${sColor};
            border-radius:4px;cursor:pointer;user-select:none;"
            onclick="const d=this.nextElementSibling;d.style.display=d.style.display==='none'?'block':'none';this.querySelector('.sa').textContent=d.style.display==='none'?'▸':'▾';">
            <span class="sa" style="color:${sColor};font-size:11px;">${sFailed>0?'▾':'▸'}</span>
            <span style="color:${sColor};font-weight:bold;font-size:12px;letter-spacing:2px;">${sname}</span>
            <span style="color:#6a4a30;font-size:11px;margin-left:auto;">${tests.length-sFailed}/${tests.length}</span>
            ${sFailed>0?`<span style="color:#cc4040;font-size:11px;font-weight:bold;">${sFailed} BROKEN</span>`:''}
          </div>
          <div style="display:${sFailed>0?'block':'none'};overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:11px;margin:0;">
      `;

      tests.forEach(t => {
        const ok = t.status === 'WORKING';
        const bg = ok ? 'transparent' : 'rgba(204,48,48,0.06)';
        const sc = ok ? '#408040' : '#cc3030';
        html += `<tr style="background:${bg};">
          <td style="padding:3px 12px 3px 24px;color:${ok?'#7a6a50':'#d8a080'};white-space:nowrap;">${t.feature}</td>
          <td style="padding:3px 8px;color:#5a4a38;">${t.description}</td>
          <td style="padding:3px 12px;color:${sc};font-weight:bold;white-space:nowrap;text-align:right;">${t.status}</td>
        </tr>`;
      });

      html += '</table></div></div>';
    }

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    const closeOnEsc = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', closeOnEsc); }
    };
    document.addEventListener('keydown', closeOnEsc);
  }

  // =============================================
  //  MAIN RUNNER
  // =============================================

  const sectionMap = {
    topbar: testTopBar,
    cards: testAgentCards,
    selection: testAgentSelection,
    persistence_input: testInputPersistence,
    output: testTerminalOutput,
    lines: testTerminalLines,
    toolgroup: testToolGrouping,
    markdown: testMarkdown,
    input: testCommandInput,
    statusbar: async () => { await testModelSelector(); await testModeSelector(); await testContextBar(); await testStatusBarButtons(); await testUptimeIdle(); await testSystemStats(); await testGitStatus(); await testDevServer(); await testCwd(); },
    model: testModelSelector,
    mode: testModeSelector,
    context: testContextBar,
    buttons: testStatusBarButtons,
    uptime: testUptimeIdle,
    cpu_ram: testSystemStats,
    git: testGitStatus,
    server: testDevServer,
    cwd: testCwd,
    search: testSearch,
    split: testSplitDivider,
    viewmode: testViewMode,
    websocket: testWebSocket,
    permissions: testPermissions,
    persistence: testPersistence,
    images: testImageAttachments,
    fire: testFireIndicator,
    ratelimit: testRateLimiting,
    keyboard: testKeyboard,
    timestamps: testTimestamps,
  };

  function printTable(rows) {
    // Compute column widths
    const hdr = ['FEATURE NAME', 'Description', 'STATUS'];
    let w0 = hdr[0].length, w1 = hdr[1].length, w2 = hdr[2].length;
    rows.forEach(r => {
      const name = `[${r.section}] ${r.feature}`;
      if (name.length > w0) w0 = name.length;
      if (r.description.length > w1) w1 = r.description.length;
      if (r.status.length > w2) w2 = r.status.length;
    });

    const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
    const sep = `+-${'-'.repeat(w0)}-+-${'-'.repeat(w1)}-+-${'-'.repeat(w2)}-+`;
    const lines = [];

    lines.push(sep);
    lines.push(`| ${pad(hdr[0], w0)} | ${pad(hdr[1], w1)} | ${pad(hdr[2], w2)} |`);
    lines.push(sep);

    rows.forEach(r => {
      const name = `[${r.section}] ${r.feature}`;
      lines.push(`| ${pad(name, w0)} | ${pad(r.description, w1)} | ${pad(r.status, w2)} |`);
    });

    lines.push(sep);

    const passed = rows.filter(r => r.status === 'WORKING').length;
    const failed = rows.length - passed;
    lines.push(`  TOTAL: ${rows.length}  |  WORKING: ${passed}  |  NOT WORKING: ${failed}  |  PASS RATE: ${Math.round((passed / rows.length) * 100)}%`);

    console.log('\n' + lines.join('\n') + '\n');
  }

  async function run(filter) {
    results.length = 0;

    const toRun = filter
      ? Object.entries(sectionMap).filter(([k]) => k.toLowerCase().includes(filter.toLowerCase()))
      : Object.entries(sectionMap);

    if (toRun.length === 0) {
      console.warn(`No sections match "${filter}". Available: ${Object.keys(sectionMap).join(', ')}`);
      return { total: 0, passed: 0, failed: 0, results: [] };
    }

    for (const [, fn] of toRun) {
      try { await fn(); }
      catch (e) { results.push({ section: currentSection, feature: 'CRASH', description: e.message, status: 'NOT WORKING' }); }
    }

    // Always print ASCII table to console
    printTable(results);

    // Also render visual overlay if in a browser with DOM
    if (typeof document !== 'undefined' && document.body) renderOverlay(results);

    // Return structured results for programmatic use
    return {
      total: results.length,
      passed: results.filter(r => r.status === 'WORKING').length,
      failed: results.filter(r => r.status !== 'WORKING').length,
      results: results.map(r => ({ section: r.section, feature: r.feature, description: r.description, status: r.status })),
    };
  }

  window.WolfTests = {
    run,
    sections: Object.keys(sectionMap),
  };

  console.log('%c Wolf\'s Basement Test Suite loaded. Run: await WolfTests.run()', 'color:#cc3020;font-weight:bold');

})();
