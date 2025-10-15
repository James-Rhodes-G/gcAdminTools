// ==UserScript==
// @name         GC Tool: Interaction Priority Updater (Helpers)
// @namespace    local.gc.tools
// @version      5.0
// @description  Update interaction priorities with decrement logic, dry-run, progress, and log/CSV using shared helpers
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    const { createPanel, createProgress, createLogger, sleep } = window.GCHelpers;
    const content = createPanel('📈 Interaction Priority Updater');
    content.innerHTML = `
      <label>Conversation IDs (comma/newline separated):</label>
      <textarea id="ids" rows="4" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:#fff;border:1px solid #555;border-radius:5px;padding:6px;"></textarea>
      <label>Starting Priority:</label>
      <input id="pri" type="number" step="1" placeholder="e.g., 100" style="width:100%;margin-bottom:10px;background:#2c2c2c;color:#fff;border:1px solid #555;border-radius:5px;padding:6px;">
      <div style="margin-bottom:8px;"><label><input type="checkbox" id="dry" checked> Dry Run (Preview Only)</label></div>
      <button id="go" style="width:100%;padding:8px;background:#0078d4;color:#fff;border:none;border-radius:5px;cursor:pointer;">Update Priorities</button>
    `;
    const bar = createProgress(content);
    const dry = content.querySelector('#dry');

    const parseIds = v => (v || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);

    content.querySelector('#go').onclick = async () => {
      const ids = parseIds(content.querySelector('#ids').value);
      const start = parseInt(content.querySelector('#pri').value, 10);
      const isDry = dry.checked;
      if (!ids.length || isNaN(start)) return alert('Enter IDs and starting priority.');
      const confirmMsg = isDry
        ? `Preview updating ${ids.length} interactions starting at ${start}, decrementing by 1 per item?`
        : `⚠️ Live update ${ids.length} interactions starting at ${start}, decrementing by 1 per item?`;
      if (!confirm(confirmMsg)) return;

      const logger = createLogger(orgInfo, 'priorityUpdate', isDry ? 'dryrun' : 'live');
      let ok = 0, fail = 0, done = 0, total = ids.length;
      bar.update(done, total);
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i], pri = start - i;
        if (isDry) {
          const msg = `Would update ${id} → ${pri}`;
          logger.add(msg); logger.addCSV(id, pri, 'DRY_RUN', msg);
          console.log(`🧪 ${msg}`);
        } else {
          try {
            const r = await fetch(`${apiBase}/api/v2/routing/conversations/${id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ priority: pri })
            });
            if (r.ok) { ok++; logger.add(`✅ ${id} → ${pri}`); logger.addCSV(id, pri, 'SUCCESS', 'Updated'); }
            else { fail++; const e = await r.text(); logger.add(`❌ ${id}: ${e}`); logger.addCSV(id, pri, 'FAIL', e); }
          } catch (e) {
            fail++; logger.add(`❌ ${id}: ${e.message}`); logger.addCSV(id, pri, 'FAIL', e.message);
          }
          await sleep(300);
        }
        done++; bar.update(done, total);
      }
      logger.add(`Summary: success=${ok}, fail=${fail}`);
      logger.save();
      alert(`Priority update complete.\nSuccess: ${ok}\nFail: ${fail}`);
    };
  }

  registerGcTool({
    name: "Interaction Priority Updater",
    version: "5.0",
    run
  });
})();
