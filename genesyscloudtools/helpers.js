// ==UserScript==
// @name         GC Admin Helpers Library
// @namespace    local.gc.tools
// @version      1.5
// @description  Shared UI, logging, progress, registry, minimize, return, and rate-limit safe API calls
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────── Basic Utilities ─────────── */
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

  /* ─────────── Wait for a Visible Body ─────────── */
  async function waitForBody(maxWait = 15000) {
    const start = performance.now();
    while (performance.now() - start < maxWait) {
      if (document.body && document.body.offsetHeight > 0) return true;
      await sleep(300);
    }
    console.warn('⚠️ Timed out waiting for visible body.');
    return false;
  }

  /* ─────────── Unified Panel UI (with minimize/dock) ─────────── */
  function createPanel(title, width = 360, startMinimized = false) {
    const p = document.createElement('div');
    Object.assign(p.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: '#1f1f1f',
      color: '#f2f2f2',
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
        <div>
          <button class="minBtn" title="Minimize" style="background:none;border:none;color:#fff;font-size:14px;cursor:pointer;margin-right:5px;">_</button>
          <button class="closeBtn" title="Close" style="background:none;border:none;color:#fff;font-size:16px;cursor:pointer;">✖</button>
        </div>
      </div>
      <div class="panelContent"></div>`;
    (document.documentElement || document.body).appendChild(p);

    // Dock (minimized state)
    const dock = document.createElement('div');
    dock.textContent = '⚙️';
    Object.assign(dock.style, {
      position: 'fixed',
      bottom: '15px',
      right: '15px',
      background: '#0078d4',
      color: '#fff',
      borderRadius: '50%',
      width: '36px',
      height: '36px',
      display: 'none',
      justifyContent: 'center',
      alignItems: 'center',
      cursor: 'pointer',
      fontSize: '20px',
      boxShadow: '0 0 6px rgba(0,0,0,0.5)',
      zIndex: '2147483647'
    });
    document.body.appendChild(dock);
    dock.onclick = () => { dock.style.display = 'none'; p.style.display = 'block'; };

    p.querySelector('.minBtn').onclick = () => {
      p.style.display = 'none';
      dock.style.display = 'flex';
    };
    p.querySelector('.closeBtn').onclick = () => {
      p.remove();
      dock.remove();
    };

      //start minimized
    if (startMinimized) {
      p.style.display = "none";
      dock.style.display = "flex";
    }

    return p.querySelector('.panelContent');
  }

  /* ─────────── Progress Bar ─────────── */
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

  /* ─────────── Unified Logger ─────────── */
  function createLogger(orgInfo, toolName, mode) {
    const orgShort = (orgInfo.thirdPartyOrgId || orgInfo.name || orgInfo.id).replace(/[^\w.-]+/g, '_');
    const stampStr = stamp();
    const base = `${orgShort}_${toolName}_${mode}_${stampStr}`;
    const logLines = [];
    const csvRows = [['TimestampISO', 'RunType', 'ItemName', 'ItemId', 'Result', 'Message']];
    const add = msg => logLines.push(`[${nowISO()}] ${msg}`);
    const addCSV = (name, id, res, msg) => csvRows.push([nowISO(), mode.toUpperCase(), name, id, res, msg]);
    const save = (summary = []) => {
      summary.forEach(s => logLines.push(s));
      logLines.push('=== END ===');
      dl(`${base}.log`, logLines.join('\n'));
      dl(`${base}.csv`, csvRows.map(r => r.join(',')).join('\n'), 'text/csv');
    };
    return { add, addCSV, save, logLines, csvRows, base };
  }

  /* ─────────── Return to Launcher Button ─────────── */
  function addReturnButton(container) {
    const btn = document.createElement('button');
    btn.textContent = '⬅️ Return to Launcher';
    Object.assign(btn.style, {
      width: '100%',
      padding: '8px',
      background: '#0078d4',
      color: '#fff',
      border: 'none',
      borderRadius: '5px',
      cursor: 'pointer',
      marginTop: '10px'
    });
    btn.onclick = () => {
      if (typeof window.buildLauncher === 'function') window.buildLauncher();
      container.closest('div[style*="position: fixed"]').remove();
    };
    container.appendChild(btn);
  }

  /* ─────────── Rate-Limit Safe Fetch ─────────── */
  async function safeApiFetch(url, options = {}, maxRetries = 5) {
    let attempt = 0;
    while (true) {
      const resp = await fetch(url, options);
      if (resp.status !== 429 || attempt >= maxRetries) return resp;

      const retryAfter = parseInt(resp.headers.get('Retry-After')) || Math.pow(2, attempt) * 1000;
      console.warn(`⏳ Rate limited (429). Retrying in ${retryAfter} ms...`);
      await sleep(retryAfter);
      attempt++;
    }
  }

  /* ─────────── Registry ─────────── */
  window.registeredGcTools = window.registeredGcTools || [];
  window.registerGcTool = tool => {
    window.registeredGcTools.push(tool);
    console.log(`🧩 Registered GC Tool: ${tool.name}`);
  };

  /* ─────────── Exports ─────────── */
  window.GCHelpers = {
    sleep,
    nowISO,
    stamp,
    createPanel,
    createProgress,
    createLogger,
    dl,
    waitForBody,
    addReturnButton,
    safeApiFetch  // 🆕 added global rate-limit aware fetch
  };

  console.log('%c[GC Helpers v1.4 Loaded — minimize, return, and rate-limit handling ready]', 'color: limegreen; font-weight:bold;');
})();
