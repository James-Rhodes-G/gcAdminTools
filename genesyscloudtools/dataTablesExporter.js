// ==UserScript==
// @name         GC Tool: Data Tables Exporter (ZIP)
// @namespace    local.gc.tools
// @version      1.2
// @description  Export selected Architect Data Tables to CSV and bundle into a single ZIP (Dry Run, logging, progress)
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  async function run({ token, apiBase, orgInfo }) {
    await window.GCHelpers.waitForBody();
    const {
      createPanel, createProgress, createLogger, addReturnButton,
      safeApiFetch, sleep
    } = window.GCHelpers;

    const orgShort = (orgInfo && (orgInfo.thirdPartyOrgName || orgInfo.name || orgInfo.id || 'Org')) + '';
    // 🆕 start OPEN (not minimized)
    const content = createPanel('📥 Data Tables Exporter', 420, false);

    // ---------- UI ----------
    content.innerHTML = `
      <div style="font-size:12px;color:#ccc;margin-bottom:8px;">
        Org: <strong>${orgShort}</strong>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="filterInput" type="search" placeholder="Filter tables…" style="flex:1;padding:6px;border-radius:6px;border:1px solid #555;background:#2c2c2c;color:#fff;">
        <button id="refreshBtn" style="padding:6px 10px;border:none;border-radius:6px;background:#444;color:#fff;cursor:pointer;">Refresh</button>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <div>
          <label style="user-select:none;">
            <input type="checkbox" id="dryRun" checked> Dry Run (Preview Only)
          </label>
        </div>
        <div style="display:flex;gap:8px;">
          <!-- 🆕 Select All button color matches Export -->
          <button id="selectAll"  style="padding:4px 8px;border:none;border-radius:6px;background:#0078d4;color:#fff;cursor:pointer;">Select All</button>
          <button id="selectNone" style="padding:4px 8px;border:none;border-radius:6px;background:#f66;cursor:pointer;">None</button>
        </div>
      </div>

      <div id="tableList" style="max-height:260px;overflow:auto;border:1px solid #444;border-radius:6px;padding:8px;margin-bottom:10px;">
        <em style="color:#aaa;">Loading data tables…</em>
      </div>

      <button id="exportBtn" style="width:100%;padding:8px;border:none;border-radius:6px;background:#0078d4;color:#fff;cursor:pointer;margin-bottom:10px;">
        Export to ZIP
      </button>

      <div id="status" style="font-size:12px;color:#ccc;margin-bottom:6px;">Ready.</div>
    `;

    const bar = createProgress(content);
    const filterInput = content.querySelector('#filterInput');
    const tableListEl = content.querySelector('#tableList');
    const exportBtn = content.querySelector('#exportBtn');
    const refreshBtn = content.querySelector('#refreshBtn');
    const dryRunBox = content.querySelector('#dryRun');
    const selectAllBtn = content.querySelector('#selectAll');
    const selectNoneBtn = content.querySelector('#selectNone');
    const statusEl = content.querySelector('#status');

    // ---------- ZIP helpers (unchanged) ----------
    function crc32(buf) {
      const table = (crc32.table ||= (() => {
        let c, t = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
          c = n;
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
          t[n] = c >>> 0;
        }
        return t;
      })());
      let crc = 0 ^ -1;
      for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
      return (crc ^ -1) >>> 0;
    }
    function strToUint8(str) { return new TextEncoder().encode(str); }
    function uint32LE(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
    function uint16LE(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xFFFF, true); return b; }

    function buildZip(files) {
      const parts = [], central = [];
      let offset = 0;
      const now = new Date();
      const dostime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (Math.floor(now.getSeconds() / 2))) & 0xFFFF;
      const dosdate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;

      for (const f of files) {
        const nameBytes = strToUint8(f.name);
        const data = f.data;
        const crc = crc32(data);
        const compSize = data.length;
        const uncompSize = data.length;
        const lf =
          [0x50, 0x4b, 0x03, 0x04]
          .concat([...uint16LE(20)], [0, 0], [...uint16LE(0)],
                  [...uint16LE(dostime), ...uint16LE(dosdate)],
                  [...uint32LE(crc), ...uint32LE(compSize), ...uint32LE(uncompSize)],
                  [...uint16LE(nameBytes.length), ...uint16LE(0)]);
        parts.push(new Uint8Array(lf)); parts.push(nameBytes); parts.push(data);
        const entryStart = offset;
        offset += lf.length + nameBytes.length + data.length;
        const cd =
          [0x50, 0x4b, 0x01, 0x02]
          .concat([...uint16LE(20), ...uint16LE(20)], [0, 0], [...uint16LE(0)],
                  [...uint16LE(dostime), ...uint16LE(dosdate)],
                  [...uint32LE(crc), ...uint32LE(compSize), ...uint32LE(uncompSize)],
                  [...uint16LE(nameBytes.length), ...uint16LE(0), ...uint16LE(0)],
                  [...uint16LE(0), ...uint16LE(0)], [...uint32LE(0)], [...uint32LE(entryStart)]);
        central.push(new Uint8Array(cd)); central.push(nameBytes);
      }

      const centralStart = offset;
      for (const c of central) { parts.push(c); offset += c.length; }
      const centralSize = offset - centralStart;
      const eocd =
        [0x50, 0x4b, 0x05, 0x06]
        .concat([...uint16LE(0), ...uint16LE(0)],
                [...uint16LE(files.length), ...uint16LE(files.length)],
                [...uint32LE(centralSize), ...uint32LE(centralStart)],
                [...uint16LE(0)]);
      parts.push(new Uint8Array(eocd));
      return new Blob(parts, { type: 'application/zip' });
    }

    function downloadBlob(blob, filename) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }

    // ---------- API helpers ----------
    async function fetchAllTables() {
      const results = [];
      let pageNumber = 1;
      const pageSize = 100;
      while (true) {
        // ✅ You already added showbrief=false in your local copy
        const url = `${apiBase}/api/v2/flows/datatables?pageNumber=${pageNumber}&pageSize=${pageSize}&showbrief=false`;
        const resp = await safeApiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error(`List tables failed: ${await resp.text()}`);
        const data = await resp.json();
        const entities = data.entities || data.results || [];
        results.push(...entities);
        if (!entities.length || entities.length < pageSize) break;
        pageNumber++;
        await sleep(150);
      }
      return results;
    }

    async function fetchAllRows(tableId) {
      const rows = [];
      let pageNumber = 1;
      const pageSize = 500;
      while (true) {
        const url = `${apiBase}/api/v2/flows/datatables/${encodeURIComponent(tableId)}/rows?pageNumber=${pageNumber}&pageSize=${pageSize}`;
        const resp = await safeApiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!resp.ok) throw new Error(`Rows fetch failed: ${await resp.text()}`);
        const data = await resp.json();
        const chunk = data.entities || data.rows || [];
        rows.push(...chunk);
        if (!chunk.length || chunk.length < pageSize) break;
        pageNumber++;
        await sleep(100);
      }
      return rows;
    }

    // ---------- CSV helpers ----------
    function sanitizeName(s) {
      return (s || 'untitled').replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 120);
    }
    function toCSV(rows) {
      if (!rows.length) return '';
      const flat = rows.map(r => {
        if (r && typeof r === 'object') {
          if (r.values && typeof r.values === 'object') return { key: r.key, ...r.values };
          return r;
        }
        return { value: r };
      });
      const headers = Array.from(flat.reduce((set, r) => {
        Object.keys(r).forEach(k => set.add(k));
        return set;
      }, new Set()));
      const esc = v => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v;
      const lines = [headers.join(',')];
      for (const obj of flat) lines.push(headers.map(h => esc(obj[h])).join(','));
      return lines.join('\n');
    }
    function nowStamp() {
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    }

    // ---------- UI ----------
    let allTables = [];
    async function loadTables() {
      tableListEl.innerHTML = `<em style="color:#aaa;">Loading data tables…</em>`;
      try { allTables = await fetchAllTables(); renderTableList(); }
      catch(e){ tableListEl.innerHTML = `<span style="color:#ff6666;">Error: ${e.message}</span>`; }
    }
    function renderTableList(){
      const q = (filterInput.value || '').toLowerCase();
      const items = allTables.filter(t=>{
        const name=(t.name||t.displayName||t.id||'').toLowerCase();
        return !q || name.includes(q);
      });
      if(!items.length){ tableListEl.innerHTML=`<em style="color:#aaa;">No tables match filter.</em>`; return;}
      tableListEl.innerHTML = items.map(t=>{
        const name=t.name||t.displayName||t.id;
        const id=t.id||t.datatableId||t.name;
        return `
          <label style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px;color:#ddd;">
            <input type="checkbox" class="dtCheck" value="${id}" data-name="${sanitizeName(name)}">
            <span>${name}</span>
            <span style="color:#888;font-size:11px;">(${id})</span>
          </label>`;
      }).join('');
    }
    filterInput.addEventListener('input', renderTableList);
    refreshBtn.addEventListener('click', loadTables);
    selectAllBtn.addEventListener('click', ()=>{tableListEl.querySelectorAll('.dtCheck').forEach(cb=>cb.checked=true);});
    selectNoneBtn.addEventListener('click', ()=>{tableListEl.querySelectorAll('.dtCheck').forEach(cb=>cb.checked=false);});
    await loadTables();

    // ---------- Export ----------
    exportBtn.onclick = async () => {
      const chosen = Array.from(tableListEl.querySelectorAll('.dtCheck:checked'));
      if (!chosen.length) return alert('Select at least one data table.');
      const isDry = dryRunBox.checked;
      const confirmMsg = isDry
        ? `Preview exporting ${chosen.length} tables?`
        : `Export ${chosen.length} tables to ZIP now?`;
      if (!confirm(confirmMsg)) return;

      const logger = createLogger(orgInfo, 'dataTablesExporter', isDry ? 'dryrun' : 'live');
      const auditCsv = ['TimestampISO,RunType,TableName,TableId,Result,Message,RowsWritten'];
      const total = chosen.length;
      let done = 0, ok = 0, fail = 0;
      bar.update(done, total);
      statusEl.innerHTML = `${isDry ? 'Previewing' : 'Exporting'} ${total} tables…`;
      const filesForZip = [];

      for (const c of chosen) {
        const startISO = new Date().toISOString();
        try {
          if (isDry) {
            const msg = `DRY RUN: Would export ${c.dataset.name} (${c.value})`;
            logger.add(msg);
            auditCsv.push(`${startISO},DRY_RUN,${c.dataset.name},${c.value},OK,Would export,0`);
            ok++;
          } else {
            const rows = await fetchAllRows(c.value);
            const csv = toCSV(rows);
            const csvBytes = strToUint8(csv);
            const fileName = `${sanitizeName(orgShort)}_${sanitizeName(c.dataset.name)}_${nowStamp()}.csv`;
            filesForZip.push({ name: fileName, data: csvBytes });
            const msg = `Exported ${c.dataset.name} (${c.value}) rows=${rows.length}`;
            logger.add(msg);
            auditCsv.push(`${startISO},LIVE,${c.dataset.name},${c.value},SUCCESS,Exported,${rows.length}`);
            ok++;
          }
        } catch (e) {
          fail++;
          const err = `Failed ${c.dataset.name} (${c.value}): ${e.message}`;
          logger.add(err);
          auditCsv.push(`${startISO},${isDry?'DRY_RUN':'LIVE'},${c.dataset.name},${c.value},FAIL,"${(e.message+'').replace(/"/g,'""')}",0`);
        }
        done++; bar.update(done, total); await sleep(150);
      }

      const base = `${sanitizeName(orgShort)}_dataTablesExport_${nowStamp()}`;
      const csvText = auditCsv.join('\n') + '\n';
      filesForZip.push({ name: `${base}.csv`, data: strToUint8(csvText) });

      if (!isDry) {
        const zipBlob = buildZip(filesForZip);
        const zipName = `${sanitizeName(orgShort)}_DataTables_${nowStamp()}.zip`;
        downloadBlob(zipBlob, zipName);
      }

      logger.add(`Summary: success=${ok}, fail=${fail}, total=${total}`);
      logger.save();
      statusEl.innerHTML = `
        <span style="color:#0f0;">Success: ${ok}</span>
        &nbsp; <span style="color:#ff6666;">Fail: ${fail}</span>
        &nbsp; <span>of ${total}</span>
        <br><small>${isDry ? 'Dry Run complete.' : 'ZIP downloaded with CSVs and audit file.'}</small>
      `;
      addReturnButton(content);
    };

    addReturnButton(content);
  }

  registerGcTool({
    name: "Data Tables Exporter",
    version: "1.2",
    run
  });
})();
