// ==UserScript==
// @name         GC Tool: Phone Site Migrator
// @namespace    local.gc.tools
// @version      4.0
// @description  Migrate all phones from one site to another in Genesys Cloud
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
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
      width: '340px'
    });

    panel.innerHTML = `
      <h4 style="margin:0 0 10px 0;">📞 Phone Site Migrator</h4>
      <label>Source Site ID:</label>
      <input id="source" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:white;border:1px solid #555;border-radius:5px;padding:6px;">
      <label>Target Site ID:</label>
      <input id="target" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:white;border:1px solid #555;border-radius:5px;padding:6px;">
      <button id="runMigration" style="width:100%;padding:8px;background:#0078d4;color:white;border:none;border-radius:5px;cursor:pointer;">Run Migration</button>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#runMigration').onclick = async () => {
      const src = panel.querySelector('#source').value.trim();
      const tgt = panel.querySelector('#target').value.trim();
      if (!src || !tgt) return alert('Please enter both site IDs.');
      alert(`Migrating phones from ${src} → ${tgt}...\n(Implementation placeholder)`);
    };
  }

  window.registeredGcTools = window.registeredGcTools || [];
  window.registeredGcTools.push({
    name: "Phone Site Migrator",
    version: "4.0",
    run
  });
})();
