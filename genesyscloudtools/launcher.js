// ==UserScript==
// @name         Genesys Cloud Admin Launcher (Helpers)
// @namespace    local.gc.tools
// @version      2.1
// @description  Unified launcher using shared helpers (Alt+L to reopen)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function buildLauncher() {
    // Wait for DOM to be visible (uses helpers)
    if (window.GCHelpers?.waitForBody) {
      await window.GCHelpers.waitForBody();
    }

    const tokenObj = localStorage.getItem('gcucc-ui-auth-token');
    if (!tokenObj) {
      console.warn("🔒 No Genesys Cloud auth token found. Launcher will not render.");
      return;
    }

    // Remove any existing panel
    const existing = document.querySelector('#gcLauncherPanel');
    if (existing) existing.remove();

    // Use helper-based panel
    const { createPanel } = window.GCHelpers || {};
    let content;
    if (typeof createPanel === 'function') {
      content = createPanel('⚙️ Genesys Cloud Admin Tools', 360, true);
      content.parentElement.id = 'gcLauncherPanel';
    } else {
      // fallback if helpers.js fails to load
      const p = document.createElement('div');
      Object.assign(p.style, {
        position: 'fixed', bottom: '20px', right: '20px',
        background: '#1f1f1f', color: '#fff', padding: '15px',
        borderRadius: '10px', boxShadow: '0 0 12px rgba(0,0,0,0.6)',
        zIndex: '2147483647', fontFamily: 'sans-serif', width: '360px',
      });
      p.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <h4 style="margin:0;">⚙️ Genesys Cloud Admin Tools</h4>
        <button id="closeLauncher" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✖</button>
      </div><div id="launcherContent" style="font-size:12px;color:#bbb;">Loading tools…</div>`;
      (document.documentElement || document.body).appendChild(p);
      content = p.querySelector('#launcherContent');
      p.querySelector('#closeLauncher').onclick = () => p.remove();
    }

    try {
      const token = JSON.parse(tokenObj).token;
      const region = window.location.hostname.match(/(?:apps|login|mypurecloud|apps2|apps3)\.(.+)$/)[1];
      const apiBase = `https://api.${region}`;
      const orgResp = await fetch(`${apiBase}/api/v2/organizations/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const orgInfo = await orgResp.json();
      const tools = window.registeredGcTools || [];

      // Build the inner launcher content
      content.innerHTML = `
        <div style="font-size:12px;margin-bottom:8px;color:#ccc;">
          Org: <strong>${orgInfo.thirdPartyOrgName || orgInfo.name || orgInfo.id}</strong>
        </div>
        <label>Select a Tool:</label>
        <select id="toolSelect" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:#fff;border:1px solid #555;border-radius:5px;padding:6px;"></select>
        <button id="launchTool" style="width:100%;padding:8px;background:#0078d4;color:#fff;border:none;border-radius:5px;cursor:pointer;">Launch Tool</button>
        <p style="font-size:12px;color:#aaa;margin-top:8px;text-align:center;">🧩 Tools loaded dynamically from GitHub</p>
      `;

      const sel = content.querySelector('#toolSelect');
      const btn = content.querySelector('#launchTool');
      tools.forEach(t => sel.add(new Option(`${t.name} (${t.version || 'v1'})`, t.name)));

      btn.onclick = () => {
        const chosen = sel.value;
        const tool = tools.find(t => t.name === chosen);
        if (!tool) return alert('Tool not found.');
        content.parentElement.remove();
        tool.run({ token, apiBase, orgInfo });
      };
    } catch (e) {
      console.error('❌ Launcher initialization failed:', e);
      content.innerHTML = `<div style="color:#ff6666;">Error loading launcher (see console).</div>`;
    }
  }

  // ⬇️ Export globally for manual or hotkey use
  window.buildLauncher = buildLauncher;

  // Auto-run on load
  window.addEventListener('load', () => setTimeout(buildLauncher, 3000));

  console.log('%c[GC Launcher v2.1 Loaded — uses shared helpers, Alt+L to reopen]', 'color: limegreen; font-weight:bold;');
})();
