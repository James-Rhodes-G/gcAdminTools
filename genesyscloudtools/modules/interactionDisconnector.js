// ==UserScript==
// @name         GC Tool: Interaction Disconnector (Native Selection – Phase 1)
// @namespace    local.gc.tools
// @version      5.0
// @description  Detect selected interactions in Genesys Cloud Interactions pane, count & log (no deletes yet)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    await window.GCHelpers.waitForBody();

    const { createPanel, createProgress, createLogger, sleep, addReturnButton, safeApiFetch } = window.GCHelpers;

    const content = createPanel('🔍 Interaction Disconnector (Native Selection – Phase 1)');

    content.innerHTML = `
      <p style="font-size:13px;color:#ddd;margin-bottom:6px;">
        Select interactions using the <strong>native Genesys Cloud checkboxes</strong> in the Interactions pane,
        then click <em>"Scan Selections"</em> below.
      </p>

      <div style="margin-bottom:8px;">
        <label><input type="checkbox" id="dryRun" checked> Dry Run (Preview Only)</label>
      </div>

      <button id="scanBtn" style="width:100%;padding:8px;background:#0078d4;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:8px;">
        🔄 Scan Selections
      </button>

      <div id="scanResults" style="font-size:13px;color:#ccc;margin-bottom:10px;">Awaiting scan...</div>
    `;

    const bar = createProgress(content);
    const dryRunBox = content.querySelector('#dryRun');
    const scanBtn = content.querySelector('#scanBtn');
    const scanResults = content.querySelector('#scanResults');

    // --- utility: detect selected checkboxes in Interactions pane ---
    function detectSelectedInteractions() {
      // attempt multiple selector patterns (Genesys may change class names)
      const selectors = [
        'input[type="checkbox"][data-testid*="interaction"]',
        'input[type="checkbox"][aria-label*="Interaction"]',
        'input[type="checkbox"]'
      ];
      let selected = [];
      for (const sel of selectors) {
        const boxes = Array.from(document.querySelectorAll(sel));
        const checked = boxes.filter(b => b.checked);
        if (checked.length) {
          selected = checked.map(b => b.closest('[data-id], [id]')?.getAttribute('data-id') || b.value || b.id);
          break;
        }
      }
      return selected.filter(Boolean);
    }

    async function verifyInteraction(id) {
      // lightweight existence check using safeApiFetch
      const resp = await safeApiFetch(`${apiBase}/api/v2/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 404) return { exists: false };
      if (!resp.ok) return { exists: false, error: await resp.text() };
      const data = await resp.json();
      return { exists: true, name: data.participants?.[0]?.name || id, type: data.mediaType || 'unknown' };
    }

    scanBtn.onclick = async () => {
      const ids = detectSelectedInteractions();
      const isDry = dryRunBox.checked;

      if (!ids.length) {
        scanResults.innerHTML = `<span style="color:#ff6666;">No selected interactions detected.</span>`;
        return;
      }

      const confirmMsg = `Found ${ids.length} selected interactions.\n` +
        (isDry ? `Proceed with a Dry Run verification?` : `Proceed to verify their existence via API?`);
      if (!confirm(confirmMsg)) return;

      scanResults.innerHTML = `Verifying ${ids.length} selected interactions...`;

      const logger = createLogger(orgInfo, 'interactionDisconnectorNative', isDry ? 'dryrun' : 'verify');
      let ok = 0, fail = 0, done = 0, total = ids.length;
      bar.update(done, total);

      for (const id of ids) {
        try {
          const verify = await verifyInteraction(id);
          if (verify.exists) {
            ok++;
            const msg = `✅ Interaction verified: ${verify.name} (${id}) [${verify.type}]`;
            logger.add(msg);
            logger.addCSV(verify.name, id, 'VERIFIED', verify.type);
            console.log(msg);
          } else {
            fail++;
            const msg = `⚠️ Interaction not found or invalid: ${id}`;
            logger.add(msg);
            logger.addCSV(id, id, 'MISSING', verify.error || 'Not Found');
            console.warn(msg);
          }
        } catch (e) {
          fail++;
          const msg = `❌ Error verifying ${id}: ${e.message}`;
          logger.add(msg);
          logger.addCSV(id, id, 'ERROR', e.message);
          console.error(msg);
        }
        done++;
        bar.update(done, total);
        await sleep(200);
      }

      logger.add(`Summary: verified=${ok}, missing=${fail}`);
      logger.save();

      scanResults.innerHTML = `
        <span style="color:#0f0;">✅ Verified: ${ok}</span> &nbsp; 
        <span style="color:#ff6666;">⚠️ Missing/Error: ${fail}</span>
        <br><small>Logs downloaded automatically.</small>
      `;

      addReturnButton(content);
    };

    addReturnButton(content);
  }

  registerGcTool({
    name: "Interaction Disconnector (Native)",
    version: "5.0",
    run
  });
})();
