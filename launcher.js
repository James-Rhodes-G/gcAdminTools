// ==UserScript==
// @name         Genesys Cloud Admin Launcher
// @namespace    local.gc.tools
// @version      1.0
// @description  Unified launcher for Genesys Cloud admin tools
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function buildLauncher() {
    const token = localStorage.getItem('gcucc-ui-auth-token')
      ? JSON.parse(localStorage.getItem('gcucc-ui-auth-token')).token
      : null;
    if (!token) return;

    const region = window.location.hostname.match(/(?:apps|login|mypurecloud|apps2|apps3)\.(.+)$/)[1];
    const apiBase = `https://api.${region}`;
    const orgResp = await fetch(`${apiBase}/api/v2/organizations/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const orgInfo = await orgResp.json();

    window.registeredGcTools = window.registeredGcTools || [];

    const panel = document.createElement('div');
    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#1f1f1f',
      color: '#fff',
      padding: '15px',
      borderRadius: '10px',
      boxShadow: '0 0 10px rgba(0,0,0,0.4)',
      zIndex: 999999,
      fontFamily: 'sans-serif',
      width: '360px'
    });

    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <h4 style="margin:0;">⚙️ Genesys Cloud Admin Tools</h4>
        <button id="closeLauncher" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✖</button>
      </div>
      <div style="font-size:12px;margin-bottom:8px;color:#bbb;">
        Org: <strong>${orgInfo.thirdPartyOrgId || orgInfo.name || orgInfo.id}</strong>
      </div>
      <label>Select a Tool:</label>
      <select id="toolSelect" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:#fff;border:1px solid #555;border-radius:5px;padding:6px;"></select>
      <button id="launchTool" style="width:100%;padding:8px;background:#0078d4;color:#fff;border:none;border-radius:5px;cursor:pointer;">Launch Tool</button>
      <p style="font-size:12px;color:#aaa;margin-top:8px;text-align:center;">🧩 Tools are loaded dynamically from Git</p>
    `;
    document.body.appendChild(panel);

    const select = panel.querySelector('#toolSelect');
    const closeBtn = panel.querySelector('#closeLauncher');
    const launchBtn = panel.querySelector('#launchTool');

    closeBtn.onclick = () => panel.remove();

    (window.registeredGcTools || []).forEach(t => {
      select.add(new Option(`${t.name} (${t.version || 'v1'})`, t.name));
    });

    launchBtn.onclick = () => {
      const chosen = select.value;
      const tool = window.registeredGcTools.find(t => t.name === chosen);
      if (!tool) return alert('Tool not found.');
      panel.remove();
      tool.run({ token, apiBase, orgInfo });
    };
  }

  window.addEventListener('load', () => setTimeout(buildLauncher, 3000));
})();
