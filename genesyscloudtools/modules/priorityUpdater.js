// ==UserScript==
// @name         GC Tool: Interaction Priority Updater
// @namespace    local.gc.tools
// @version      4.0
// @description  Update interaction priorities with decrement logic
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase }) {
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
      <h4 style="margin:0 0 10px 0;">📈 Interaction Priority Updater</h4>
      <textarea id="ids" rows="4" placeholder="Enter conversation IDs, separated by commas" 
        style="width:100%;margin-bottom:10px;background:#2c2c2c;color:white;border:1px solid #555;border-radius:5px;padding:6px;"></textarea>
      <label>Starting Priority:</label>
      <input id="pri" type="number" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:white;border:1px solid #555;border-radius:5px;padding:6px;">
      <button id="runUpdate" style="width:100%;padding:8px;background:#0078d4;color:white;border:none;border-radius:5px;cursor:pointer;">Run Update</button>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#runUpdate').onclick = async () => {
      const ids = panel.querySelector('#ids').value.split(/[\s,]+/).filter(Boolean);
      const start = parseInt(panel.querySelector('#pri').value, 10);
      if (!ids.length || isNaN(start)) return alert('Please provide IDs and a valid starting priority.');

      for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const priority = start - i;
        console.log(`Would update ${id} → ${priority}`);
      }

      alert('Dry run complete. See console for details.');
    };
  }

  window.registeredGcTools = window.registeredGcTools || [];
  window.registeredGcTools.push({
    name: "Interaction Priority Updater",
    version: "4.0",
    run
  });
})();
