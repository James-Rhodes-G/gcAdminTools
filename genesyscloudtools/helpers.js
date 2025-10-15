// ==UserScript==
// @name         GC Admin Helpers Library
// @namespace    local.gc.tools
// @version      1.0
// @description  Shared UI, logging, and progress utilities for Genesys Cloud Admin Tools
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const nowISO = () => new Date().toISOString();
  const pad2 = n => String(n).padStart(2, '0');
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  };

  const dl = (name, text, type = 'text/plain') => {
    const blob = new Blob([text], { type: type + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  /** Create a consistent floating tool panel **/
  function createPanel(title, width = 360) {
    const p = document.createElement('div');
    Object.assign(p.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#1f1f1f',
      color: '#fff',
      padding: '15px',
      borderRadius: '10px',
      boxShadow: '0 0 10px rgba(0,0,0,0.4)',
      zIndex: '2147483647',
      fontFamily: 'sans-serif',
      width: `${width}px`
    });
    p.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <h4 style="margin:0;">${title}</h4>
        <button class="closeBtn" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✖</button>
      </div>
      <div class="panelContent"></div>`;
    document.body.appendChild(p);
    p.querySelector('.closeBtn').onclick = () => p.remove();
    return p.querySelector('.panelContent');
  }

  /** Create and update a progress bar **/
  function createProgress(container) {
    container.insertAdjacentHTML('beforeend', `
      <div style="height:20px;background:#333;border-radius:5px;overflow:hidden;margin-bottom:8px;">
        <div class="bar" style="height:100%;width:0%;background:#00c853;transition:width 0.3s;"></div>
      </div>
      <div class="label" style="text-align:center;font-size:13px;margin-bottom:10px;">0/0 (0%)</div>
    `);
    const bar = container.querySelector('.bar');
    const label = container.querySelector('.label');
    return {
      update(done, total) {
        const pct = total ? Math.round((done / total) * 100) : 0;
        bar.style.width = pct + '%';
        label.textContent = `${done}/${total} (${pct}%)`;
      }
    };
  }

  /** Create a unified logger **/
  function createLogger(orgInfo, toolName, mode) {
    const orgShort = (orgInfo.thirdPartyOrgId || orgInfo.name || orgInfo.id).replace(/[^\w.-]+/g, '_');
    const stampStr = stamp();
    const base = `${orgShort}_${toolName}_${mode}_${stampStr}`;
    const logLines = [];
    const csvRows = [['TimestampISO', 'RunType', 'ItemName', 'ItemId', 'Result', 'Message']];
    const add = (msg) => logLines.push(`[${nowISO()}] ${msg}`);
    const addCSV = (name, id, res, msg) => csvRows.push([nowISO(), mode.toUpperCase(), name, id, res, msg]);
    const save = (summary = []) => {
      summary.forEach(s => logLines.push(s));
      logLines.push('=== END ===');
      dl(`${base}.log`, logLines.join('\n'));
      dl(`${base}.csv`, csvRows.map(r => r.join(',')).join('\n'), 'text/csv');
    };
    return { add, addCSV, save, logLines, csvRows, base };
  }

  window.GCHelpers = {
    sleep,
    nowISO,
    stamp,
    createPanel,
    createProgress,
    createLogger,
    dl
  };

  console.log('%c[GC Helpers Library Loaded]', 'color: limegreen; font-weight:bold;');
})();
