// ==UserScript==
// @name         GC Tool: Phone Site Migrator (Helpers)
// @namespace    local.gc.tools
// @version      5.0
// @description  Migrate all phones from one site to another using shared helpers
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
	// ✅ Ensure Genesys Cloud's DOM is visible before building UI
	await window.GCHelpers.waitForBody();
    const { createPanel, createProgress, createLogger, sleep } = window.GCHelpers;
    const content = createPanel('📞 Phone Site Migrator');
    content.innerHTML = `
      <label>Old Site:</label>
      <select id="src"></select>
	  <p>
      <label>New Site:</label>
      <select id="tgt"></select>
      <div style="margin:6px 0;"><label><input type="checkbox" id="dry" checked> Dry Run (Preview Only)</label></div>
      <button id="go" style="width:100%;padding:8px;background:#0078d4;color:#fff;border:none;border-radius:5px;cursor:pointer;">Migrate Phones</button>
    `;

    const bar = createProgress(content);
    const dry = content.querySelector('#dry');
    const src = content.querySelector('#src');
    const tgt = content.querySelector('#tgt');

    async function fetchSites() {
      let sites = [], page = 1;
      while (true) {
        const r = await fetch(`${apiBase}/api/v2/telephony/providers/edges/sites?pageSize=200&pageNumber=${page}`, { headers: { Authorization: `Bearer ${token}` }});
        const d = await r.json();
        if (d.entities?.length) sites = sites.concat(d.entities);
        if (!d.nextUri) break;
        page++;
        await sleep(200);
      }
      return sites;
    }

    async function getPhones(siteId) {
      let list = [], p = 1;
      while (true) {
        const r = await fetch(`${apiBase}/api/v2/telephony/providers/edges/phones?pageSize=200&pageNumber=${p}`, { headers: { Authorization: `Bearer ${token}` }});
        const d = await r.json();
        const f = d.entities?.filter(ph => ph.site && ph.site.id === siteId) || [];
        list = list.concat(f);
        if (!d.nextUri) break;
        p++;
      }
      return list;
    }

    const sites = await fetchSites();
    sites.forEach(s => {
      src.add(new Option(s.name, s.id));
      tgt.add(new Option(s.name, s.id));
    });

    content.querySelector('#go').onclick = async () => {
      const source = src.value, target = tgt.value, isDry = dry.checked;
      if (source === target) return alert('Source and target must differ.');
      const confirmMsg = isDry ? `Preview migration from "${src.selectedOptions[0].text}" → "${tgt.selectedOptions[0].text}"?`
                               : `⚠️ Live migration from "${src.selectedOptions[0].text}" → "${tgt.selectedOptions[0].text}"?`;
      if (!confirm(confirmMsg)) return;

      const logger = createLogger(orgInfo, 'phoneMigration', isDry ? 'dryrun' : 'live');
      const phones = await getPhones(source);
      const total = phones.length;
      let ok = 0, fail = 0, done = 0;
      bar.update(done, total);
      for (const ph of phones) {
        if (isDry) {
          const msg = `Would migrate ${ph.name}`;
          logger.add(msg); logger.addCSV(ph.name, ph.id, 'DRY_RUN', msg);
          console.log(`🧪 ${msg}`);
        } else {
          try {
            const full = await fetch(`${apiBase}/api/v2/telephony/providers/edges/phones/${ph.id}`, { headers: { Authorization: `Bearer ${token}` }}).then(r=>r.json());
            full.site = { id: target };
            delete full.properties; delete full.edge;
            const put = await fetch(`${apiBase}/api/v2/telephony/providers/edges/phones/${ph.id}`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(full)
            });
            if (put.ok) { ok++; logger.add(`✅ ${ph.name}`); logger.addCSV(ph.name, ph.id, 'SUCCESS', 'Migrated'); }
            else { fail++; const e = await put.text(); logger.add(`❌ ${ph.name}: ${e}`); logger.addCSV(ph.name, ph.id, 'FAIL', e); }
          } catch (e) {
            fail++; logger.add(`❌ ${ph.name}: ${e.message}`); logger.addCSV(ph.name, ph.id, 'FAIL', e.message);
          }
        }
        done++; bar.update(done, total); await sleep(300);
      }
      logger.add(`Summary: success=${ok}, fail=${fail}`);
      logger.save();
      alert(`Migration complete.\nSuccess: ${ok}\nFail: ${fail}`);
    };
  }

  registerGcTool({
    name: "Phone Site Migrator",
    version: "5.0",
    run
  });
})();
