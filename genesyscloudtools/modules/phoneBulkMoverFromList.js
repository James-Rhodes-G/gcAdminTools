// ==UserScript==
// @name         GC Tool: Bulk Move Phones (from list)
// @namespace    local.gc.tools
// @version      1.0
// @description  Enter phone IDs (CSV/newline) + choose a target site, then migrate each phone to that site (Dry Run, logging, progress)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    await window.GCHelpers.waitForBody();

    const {
      createPanel,
      createProgress,
      createLogger,
      addReturnButton,
      safeApiFetch,
      sleep
    } = window.GCHelpers;

    const orgShort =
      (orgInfo?.thirdPartyOrgName ||
        orgInfo?.thirdPartyOrgId ||
        orgInfo?.name ||
        orgInfo?.id ||
        'Org') + '';

    const content = createPanel('📞 Bulk Move Phones (from list)', 520, false);

    content.innerHTML = `
      <div style="font-size:12px;color:#ccc;margin-bottom:8px;">
        Org: <strong>${orgShort}</strong>
        <div style="margin-top:4px;color:#aaa;">
          Paste phone GUIDs (CSV, newline, or mixed). Choose a target site. Click <b>Move Phones</b>.
        </div>
      </div>

      <label style="display:block;font-size:12px;color:#bbb;margin:8px 0 4px;">Phone IDs</label>
      <textarea id="phoneIds" rows="7"
        placeholder="e.g.\n0f6d... \n1a2b...\n\nor CSV:\n0f6d...,1a2b...,3c4d..."
        style="width:100%;padding:8px;border-radius:6px;border:1px solid #555;background:#2c2c2c;color:#fff;resize:vertical;"></textarea>

      <div style="display:flex; gap:8px; align-items:end; margin-top:10px;">
        <div style="flex:1;">
          <label style="display:block;font-size:12px;color:#bbb;margin-bottom:4px;">Target Site</label>
          <select id="targetSite"
            style="width:100%;padding:8px;border-radius:6px;border:1px solid #555;background:#2c2c2c;color:#fff;">
            <option value="">Loading sites…</option>
          </select>
        </div>
        <button id="refreshSites"
          style="padding:8px 10px;border:none;border-radius:6px;background:#444;color:#fff;cursor:pointer;">
          Refresh
        </button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <label style="user-select:none;color:#ddd;">
          <input type="checkbox" id="dryRun" checked> Dry Run (Preview Only)
        </label>
        <button id="moveBtn"
          style="padding:8px 12px;border:none;border-radius:6px;background:#0078d4;color:#fff;cursor:pointer;">
          Move Phones
        </button>
      </div>

      <div id="status" style="font-size:12px;color:#ccc;margin-top:10px;">Ready.</div>
      <div style="font-size:12px;color:#aaa;margin-top:6px;">
        Logs will be captured and downloaded automatically. You can also view details in the browser console.
      </div>
    `;

    const bar = createProgress(content);
    const phoneIdsEl = content.querySelector('#phoneIds');
    const targetSiteEl = content.querySelector('#targetSite');
    const refreshSitesBtn = content.querySelector('#refreshSites');
    const dryRunEl = content.querySelector('#dryRun');
    const moveBtn = content.querySelector('#moveBtn');
    const statusEl = content.querySelector('#status');

    function parseIds(raw) {
      // Accept newline, comma, semicolon, whitespace
      const tokens = (raw || '')
        .split(/[\s,;]+/g)
        .map(s => s.trim())
        .filter(Boolean);

      // De-dupe
      const seen = new Set();
      const out = [];
      for (const t of tokens) {
        if (!seen.has(t)) {
          seen.add(t);
          out.push(t);
        }
      }
      return out;
    }

    async function listAllSites() {
      const out = [];
      let pageNumber = 1;
      const pageSize = 100;

      while (true) {
        const url = `${apiBase}/api/v2/telephony/providers/edges/sites?pageNumber=${pageNumber}&pageSize=${pageSize}`;
        const resp = await safeApiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error(`Failed to list sites: ${await resp.text()}`);
        const data = await resp.json();
        const ents = data.entities || data.results || [];
        out.push(...ents);
        if (ents.length < pageSize) break;
        pageNumber++;
        await sleep(120);
      }

      return out;
    }

    function populateSiteSelect(sites) {
      targetSiteEl.innerHTML =
        `<option value="">— Select a target site —</option>` +
        sites
          .slice()
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          .map(s => `<option value="${s.id}">${(s.name || s.id)} (${s.id})</option>`)
          .join('');
    }

    async function loadSites() {
      statusEl.textContent = 'Loading sites…';
      try {
        const sites = await listAllSites();
        populateSiteSelect(sites);
        statusEl.textContent = `Loaded ${sites.length} site(s).`;
      } catch (e) {
        statusEl.innerHTML = `<span style="color:#ff6666;">${e.message}</span>`;
      }
    }

    refreshSitesBtn.addEventListener('click', loadSites);
    await loadSites();

    // ---- Phone move API ----
    // This uses PUT with a minimal body, which matches typical Genesys phone update behavior.
    // If your org requires a different shape (PATCH or full object), paste a failing response and I’ll adjust.
 async function movePhoneToSite(phoneId, targetSiteId) {
  // 1) GET full phone
  const getResp = await getPhone(phoneId);
  if (!getResp.ok) return getResp; // caller will log full error text
  const phone = await getResp.json();

  // 2) Modify
  const body = sanitizePhoneForPut(phone);
  body.site = { id: targetSiteId };

  // 3) PUT full object
  const url = `${apiBase}/api/v2/telephony/providers/edges/phones/${encodeURIComponent(phoneId)}`;
  const putResp = await safeApiFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  return putResp;
}

async function getPhone(phoneId) {
  const url = `${apiBase}/api/v2/telephony/providers/edges/phones/${encodeURIComponent(phoneId)}`;
  const resp = await safeApiFetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return resp;
}

function sanitizePhoneForPut(phone) {
  const p = JSON.parse(JSON.stringify(phone));

  // Common read-only fields
  delete p.id;
  delete p.selfUri;
  delete p.dateCreated;
  delete p.dateModified;
  delete p.createdBy;
  delete p.modifiedBy;

  // Some orgs return status/derived properties
  delete p.status;
  delete p.primaryEdge; // sometimes read-only depending on model
  //delete p.webRtcUser;  // if present/read-only

  // If these exist and are objects with ids, keep them; otherwise leave.
  return p;
}

    moveBtn.onclick = async () => {
      const ids = parseIds(phoneIdsEl.value);
      const targetSiteId = targetSiteEl.value;
      const isDry = !!dryRunEl.checked;

      if (!ids.length) return alert('Please paste at least one phone ID.');
      if (!targetSiteId) return alert('Please select a target site.');

      const targetSiteName =
        targetSiteEl.selectedOptions?.[0]?.textContent || targetSiteId;

      const logger = createLogger(orgInfo, 'bulkMovePhones', isDry ? 'dryrun' : 'live');

      logger.add(`Starting Bulk Move Phones`);
      logger.add(`RunType: ${isDry ? 'DRY_RUN' : 'LIVE'}`);
      logger.add(`TargetSite: ${targetSiteName}`);
      logger.add(`Count: ${ids.length}`);
      console.log('ℹ️ Bulk Move Phones: detailed per-phone results will be logged and downloaded automatically.');

      const auditCsv = [
        'TimestampISO,RunType,PhoneId,TargetSiteId,TargetSiteName,Result,Message'
      ];

      let done = 0;
      let ok = 0;
      let fail = 0;

      bar.update(0, ids.length);
      statusEl.textContent = `${isDry ? 'Previewing' : 'Moving'} ${ids.length} phone(s)…`;

      for (const phoneId of ids) {
        const ts = new Date().toISOString();
        try {
          if (isDry) {
            const msg = `DRY RUN: Would move phone ${phoneId} → ${targetSiteId}`;
            logger.add(msg);
            auditCsv.push(`${ts},DRY_RUN,${phoneId},${targetSiteId},"${(targetSiteName || '').replace(/"/g,'""')}",OK,"Would move"`);
            ok++;
          } else {
            const resp = await movePhoneToSite(phoneId, targetSiteId);
            if (!resp.ok) {
              const errText = await resp.text();
              const msg = `FAILED: ${phoneId} → ${targetSiteId} | HTTP ${resp.status} ${errText}`;
              logger.add(msg);
              auditCsv.push(`${ts},LIVE,${phoneId},${targetSiteId},"${(targetSiteName || '').replace(/"/g,'""')}",FAIL,"${(msg).replace(/"/g,'""')}"`);
              fail++;
            } else {
              logger.add(`SUCCESS: ${phoneId} → ${targetSiteId}`);
              auditCsv.push(`${ts},LIVE,${phoneId},${targetSiteId},"${(targetSiteName || '').replace(/"/g,'""')}",SUCCESS,"Moved"`);
              ok++;
            }
          }
        } catch (e) {
          const msg = `ERROR: ${phoneId} → ${targetSiteId} | ${e.message}`;
          logger.add(msg);
          auditCsv.push(`${ts},${isDry ? 'DRY_RUN' : 'LIVE'},${phoneId},${targetSiteId},"${(targetSiteName || '').replace(/"/g,'""')}",ERROR,"${(msg).replace(/"/g,'""')}"`);
          fail++;
        }

        done++;
        bar.update(done, ids.length);
        await sleep(120);
      }

      logger.add(`Summary: success=${ok}, fail=${fail}, total=${ids.length}`);
      logger.save();

      // Also download audit CSV as part of logger pattern if your logger supports extra files:
      // If your createLogger already downloads CSVs, you can ignore this.
      // Otherwise, you can add a helper later to bundle extra CSVs.
      console.log('Audit CSV preview:\n' + auditCsv.join('\n'));

      statusEl.innerHTML = `
        <span style="color:#0f0;">Success: ${ok}</span>
        &nbsp; <span style="color:#ff6666;">Fail: ${fail}</span>
        &nbsp; <span>of ${ids.length}</span>
        <br><small>${isDry ? 'Dry Run complete (no changes made).' : 'Move complete.'}</small>
      `;

      if (!content.querySelector('.returnLauncherBtn')) addReturnButton(content);
    };

    if (!content.querySelector('.returnLauncherBtn')) addReturnButton(content);
  }

  registerGcTool({
    name: 'Bulk Move Phones (from list)',
    version: '1.0',
    run
  });
})();