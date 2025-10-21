// ==UserScript==
// @name         GC Tool: Interaction Disconnector (Native – Disconnect Enabled)
// @namespace    local.gc.tools
// @version      6.0
// @description  Disconnect selected Genesys Cloud interactions using native checkboxes (safeApiFetch, Dry Run, logging, progress, minimize, return)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    await window.GCHelpers.waitForBody();
    const { createPanel, createProgress, createLogger, sleep, addReturnButton, safeApiFetch } = window.GCHelpers;

    const content = createPanel('📞 Interaction Disconnector (Disconnect Enabled)');

    content.innerHTML = `
      <p style="font-size:13px;color:#ddd;margin-bottom:6px;">
        Select interactions using the <strong>native Genesys Cloud checkboxes</strong> in the Interactions pane,
        then click <em>"Disconnect Selected"</em> below.
      </p>

      <div style="margin-bottom:8px;">
        <label><input type="checkbox" id="dryRun" checked> Dry Run (Preview Only)</label>
      </div>

      <button id="disconnectBtn" style="width:100%;padding:8px;background:#d32f2f;color:#fff;border:none;border-radius:5px;cursor:pointer;margin-bottom:8px;">
        🔌 Disconnect Selected
      </button>

      <div id="scanResults" style="font-size:13px;color:#ccc;margin-bottom:10px;">Awaiting action…</div>
    `;

    const bar = createProgress(content);
    const dryRunBox = content.querySelector('#dryRun');
    const disconnectBtn = content.querySelector('#disconnectBtn');
    const scanResults = content.querySelector('#scanResults');

    /* ---------- Locate correct iframe ---------- */
    function getInteractionFrame() {
      const analyticsFrame = document.querySelector(
        'iframe[src*="analytics-ui"][src*="/interactions"]'
      );
      if (analyticsFrame && analyticsFrame.contentDocument) return analyticsFrame.contentDocument;

      for (const f of document.querySelectorAll('iframe')) {
        try {
          const d = f.contentDocument;
          const c = d ? d.querySelectorAll('input[type="checkbox"]').length : 0;
          if (c > 1) return d;
        } catch {}
      }
      console.warn('⚠️ Could not locate Interactions iframe.');
      return null;
    }

    /* ---------- Extract conversation ID from row class ---------- */
    function extractConversationId(el) {
      if (!el) return null;
      const row = el.closest('.dt-row.action-row');
      if (!row) return null;
      const classes = Array.from(row.classList);
      const entityClass = classes.find(c => c.startsWith('entity-id-'));
      return entityClass ? entityClass.replace('entity-id-', '') : null;
    }

    /* ---------- Detect selected checkboxes ---------- */
    function detectSelectedInteractions() {
      const frameDoc = getInteractionFrame();
      if (!frameDoc) return [];

      const boxes = Array.from(frameDoc.querySelectorAll('input[type="checkbox"]:checked'));
      const ids = boxes.map(b => extractConversationId(b)).filter(Boolean);
      return ids;
    }

    /* ---------- Verify interaction existence ---------- */
    async function verifyInteraction(id) {
      const resp = await safeApiFetch(`${apiBase}/api/v2/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (resp.status === 404) return { exists: false };
      if (!resp.ok) return { exists: false, error: await resp.text() };
      const data = await resp.json();
      return {
        exists: true,
        conversationId: data.id,
        name: data.participants?.[0]?.name || 'Unknown',
        type: data.mediaType || 'unknown'
      };
    }

    /* ---------- Disconnect API call ---------- */
    async function disconnectInteraction(id) {
      const url = `${apiBase}/api/v2/conversations/${id}`;
      return await safeApiFetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
    }

    /* ---------- Main action ---------- */
    disconnectBtn.onclick = async () => {
      const ids = detectSelectedInteractions();
      const isDry = dryRunBox.checked;

      if (!ids.length) {
        scanResults.innerHTML = `<span style="color:#ff6666;">No selected interactions detected.</span>`;
        return;
      }

      // ✅ double confirmation
      const confirmMsg = isDry
        ? `Preview disconnecting ${ids.length} interactions?`
        : `⚠️ Permanently disconnect ${ids.length} interactions?\nThis action cannot be undone.`;
      if (!confirm(confirmMsg)) return;

      // Optional: extra confirmation for >10 items
      if (!isDry && ids.length > 10) {
        const pin = prompt('Type 1234 to confirm disconnect of multiple interactions:');
        if (pin !== '1234') {
          alert('Operation cancelled.');
          return;
        }
      }

      const logger = createLogger(orgInfo, 'interactionDisconnectorNative', isDry ? 'dryrun' : 'live');
      let ok = 0, fail = 0, skip = 0, done = 0, total = ids.length;
      bar.update(done, total);
      scanResults.innerHTML = `${isDry ? 'Previewing' : 'Disconnecting'} ${total} interactions…`;

      for (const id of ids) {
        try {
          const verify = await verifyInteraction(id);
          if (!verify.exists) {
            skip++;
            const msg = `⚠️ Interaction ${id} not found. Skipping.`;
            logger.add(msg);
            logger.addCSV(id, id, 'SKIPPED', 'Not Found');
            continue;
          }

          if (isDry) {
            const msg = `🧪 Would disconnect ${verify.name} (${verify.conversationId}) [${verify.type}]`;
            logger.add(msg);
            logger.addCSV(verify.name, verify.conversationId, 'DRY_RUN', verify.type);
          } else {
            const resp = await disconnectInteraction(verify.conversationId);
            if (resp.ok) {
              ok++;
              const msg = `✅ Disconnected ${verify.name} (${verify.conversationId}) [${verify.type}]`;
              logger.add(msg);
              logger.addCSV(verify.name, verify.conversationId, 'SUCCESS', 'Disconnected');
            } else {
              fail++;
              const err = await resp.text();
              const msg = `❌ Failed to disconnect ${verify.conversationId}: ${err}`;
              logger.add(msg);
              logger.addCSV(verify.name, verify.conversationId, 'FAIL', err);
              console.error(msg);
            }
          }
        } catch (e) {
          fail++;
          const msg = `❌ Error disconnecting ${id}: ${e.message}`;
          logger.add(msg);
          logger.addCSV(id, id, 'FAIL', e.message);
          console.error(msg);
        }
        done++;
        bar.update(done, total);
        await sleep(300);
      }

      logger.add(`Summary: success=${ok}, fail=${fail}, skipped=${skip}`);
      logger.save();

      scanResults.innerHTML = `
        <span style="color:#0f0;">✅ Success: ${ok}</span> &nbsp;
        <span style="color:#ff6666;">❌ Failed: ${fail}</span> &nbsp;
        <span style="color:#ffcc00;">⚠️ Skipped: ${skip}</span>
        <br><small>Logs downloaded automatically.</small>
      `;

      addReturnButton(content);
    };

    addReturnButton(content);
  }

  registerGcTool({
    name: 'Interaction Disconnector (Native)',
    version: '6.0',
    run
  });
})();
