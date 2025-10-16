// ==UserScript==
// @name         GC Tool: Phone Remover (Verification + Logging)
// @namespace    local.gc.tools
// @version      5.2
// @description  Remove phones by GUID list in Genesys Cloud (with verification, dry run, progress bar, logs, minimize, return)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    // ✅ Wait for DOM
    await window.GCHelpers.waitForBody();

    // ✅ Shared helpers
    const { createPanel, createProgress, createLogger, sleep, addReturnButton } = window.GCHelpers;

    // ✅ Create panel (includes Minimize + Close)
    const content = createPanel('🗑️ Phone Remover (with Verification)');

    // -------------------------------
    // UI Construction
    // -------------------------------
    content.innerHTML = `
      <label>Phone GUIDs (comma or newline separated):</label>
      <textarea id="phoneIds" rows="5" placeholder="Enter phone IDs here"
        style="width:100%;margin-bottom:10px;background:#2c2c2c;color:#fff;border:1px solid #555;border-radius:5px;padding:6px;"></textarea>

      <div style="margin:6px 0;">
        <label><input type="checkbox" id="dryRun" checked> Dry Run (Preview Only)</label>
      </div>

      <button id="removeBtn" style="width:100%;padding:8px;background:#d32f2f;color:#fff;border:none;border-radius:5px;cursor:pointer;">
        Remove Phones
      </button>
    `;

    const bar = createProgress(content);
    const dryRunBox = content.querySelector('#dryRun');

    // -------------------------------
    // Helper Functions
    // -------------------------------
    function parseIds(raw) {
      return (raw || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    }

    async function verifyPhone(phoneId) {
      try {
        const resp = await GCHelpers.safeApiFetch(`${apiBase}/api/v2/telephony/providers/edges/phones/${phoneId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resp.status === 404) return { exists: false };
        if (!resp.ok) return { exists: false, error: await resp.text() };
        const data = await resp.json();
        return { exists: true, name: data.name || phoneId };
      } catch (e) {
        return { exists: false, error: e.message };
      }
    }

	async function deletePhone(phoneId) {
	const url = `${apiBase}/api/v2/telephony/providers/edges/phones/${phoneId}`;
	return await GCHelpers.safeApiFetch(url, {
		method: 'DELETE',
		headers: { Authorization: `Bearer ${token}` }
	});
	}

    // -------------------------------
    // Main Removal Logic
    // -------------------------------
    content.querySelector('#removeBtn').onclick = async () => {
      const ids = parseIds(content.querySelector('#phoneIds').value);
      const isDry = dryRunBox.checked;

      if (!ids.length) return alert('Please enter at least one phone GUID.');

      const confirmMsg = isDry
        ? `Preview removing ${ids.length} phones? (Dry Run)`
        : `⚠️ Permanently remove ${ids.length} phones? This cannot be undone.`;

      if (!confirm(confirmMsg)) return;

      const logger = createLogger(orgInfo, 'phoneRemoval', isDry ? 'dryrun' : 'live');
      let ok = 0, fail = 0, skip = 0, done = 0, total = ids.length;
      bar.update(done, total);

      console.log(`🗑️ Starting ${isDry ? 'dry run' : 'live'} phone removal for ${total} phones (with verification).`);

      for (const id of ids) {
        // 🧩 Verification step
        const verification = await verifyPhone(id);
        if (!verification.exists) {
          skip++;
          const msg = verification.error
            ? `⚠️ Skipping ${id} (verification error: ${verification.error})`
            : `⚠️ Skipping ${id} (not found)`;
          logger.add(msg);
          logger.addCSV(id, id, 'SKIPPED', verification.error || 'Not Found');
          console.warn(msg);
          done++;
          bar.update(done, total);
          continue;
        }

        const name = verification.name || id;

        if (isDry) {
          const msg = `Would remove phone ${name} (${id})`;
          logger.add(msg);
          logger.addCSV(name, id, 'DRY_RUN', msg);
          console.log(`🧪 ${msg}`);
        } else {
          try {
            const resp = await deletePhone(id);
            if (resp.ok) {
              ok++;
              const msg = `✅ Removed phone ${name} (${id})`;
              logger.add(msg);
              logger.addCSV(name, id, 'SUCCESS', 'Removed');
              console.log(msg);
            } else {
              fail++;
              const err = await resp.text();
              const msg = `❌ Failed to remove ${name} (${id}): ${err}`;
              logger.add(msg);
              logger.addCSV(name, id, 'FAIL', err);
              console.error(msg);
            }
          } catch (e) {
            fail++;
            const msg = `❌ Exception removing ${name} (${id}): ${e.message}`;
            logger.add(msg);
            logger.addCSV(name, id, 'FAIL', e.message);
            console.error(msg);
          }
        }

        done++;
        bar.update(done, total);
        await sleep(250);
      }

      logger.add(`Summary: success=${ok}, fail=${fail}, skipped=${skip}`);
      logger.save();

      alert(`Phone removal complete.\nSuccess: ${ok}\nFailures: ${fail}\nSkipped: ${skip}\nLogs saved to Downloads.`);

      // 🆕 Return to launcher after completion
      addReturnButton(content);
    };

    // 🆕 Add Return to Launcher button immediately (optional)
    addReturnButton(content);
  }

  registerGcTool({
    name: "Phone Remover",
    version: "5.2",
    run
  });
})();
