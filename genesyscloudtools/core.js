// ==UserScript==
// @name         Genesys Cloud Admin Core (Git Loader + Registry + SPA Safe)
// @namespace    local.gc.tools
// @version      3.5
// @description  Loads Genesys Cloud Admin tools dynamically from GitHub with registry, cache, and UI persistence across SPA navigation
// @grant        none
// @run-at       document-end
// @match        https://*.mypurecloud.com/*
// @match        https://*.pure.cloud/*
// @match        https://*.us-gov-pure.cloud/*
// ==/UserScript==

(async function () {
  'use strict';

  const REPO_BASE =
    "https://raw.githubusercontent.com/James-Rhodes-G/gcAdminTools/main/genesyscloudtools";
  const MANIFEST_URL = `${REPO_BASE}/manifest.json`;
  const CACHE_PREFIX = "gc_tools_cache_";
  const LOCAL_OVERRIDE_KEY = "gcLocalOverrides";

  /* ─────────── Global Registry ─────────── */
  window.registeredGcTools = window.registeredGcTools || [];
  window.registerGcTool = tool => {
    window.registeredGcTools.push(tool);
    console.log(`🧩 Registered GC Tool: ${tool.name}`);
  };

  /* ─────────── Safe Fetch + Execution ─────────── */
  async function safeFetch(url, options = {}, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const r = await fetch(url + (url.includes("?") ? "&" : "?") + "nocache=" + Date.now(), options);
        if (r.ok) return r;
      } catch (e) { console.warn(`Fetch error (${url}):`, e); }
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    throw new Error(`Failed to fetch ${url}`);
  }

  function injectScript(code, name) {
    try { new Function(code)(); console.log(`📦 Executed ${name} (CSP-safe)`); }
    catch (e) { console.error(`❌ Failed to execute ${name}:`, e); }
  }

  function saveCache(k, v) { try { localStorage.setItem(CACHE_PREFIX + k, v); } catch {} }
  function getCache(k) { try { return localStorage.getItem(CACHE_PREFIX + k); } catch { return null; } }

  /* ─────────── Local Override Handling ─────────── */
  function getOverrides() {
    try { return JSON.parse(localStorage.getItem(LOCAL_OVERRIDE_KEY)) || {}; } catch { return {}; }
  }
  async function loadLocalFile(path) {
    console.log(`📂 Loading local override: ${path}`);
    const r = await fetch(path);
    if (!r.ok) throw new Error(`Failed to load local file: ${path}`);
    return await r.text();
  }

  /* ─────────── File Loader ─────────── */
  async function loadFile(name, url) {
    const overrides = getOverrides();
    const isLocal = !!overrides[name];
    let code = null;
    if (isLocal) {
      try { code = await loadLocalFile(overrides[name]); injectScript(code, name + " (local)"); markModuleAsLocal(name); return; }
      catch (e) { console.warn(`⚠️ Local override failed for ${name}:`, e); }
    }
    try {
      const r = await safeFetch(url);
      code = await r.text();
      injectScript(code, name);
      saveCache(name, code);
    } catch (e) {
      const cached = getCache(name);
      if (cached) { console.log(`📦 Using cached ${name}`); injectScript(cached, name + " (cached)"); }
      else { console.error(`❌ No cached version of ${name}`); }
    }
  }

  /* ─────────── Manifest Loader ─────────── */
  async function loadFromGit() {
    console.log("🌐 Fetching Genesys Cloud Admin manifest...");
    const manifestResp = await safeFetch(MANIFEST_URL);
    const manifest = await manifestResp.json();

    // helpers first
    if (manifest.helpers) {
      for (const helperURL of manifest.helpers) {
        const n = helperURL.split("/").pop();
        await loadFile(n, helperURL);
      }
    }

    // launcher next
    await loadFile("launcher", manifest.launcher);

    // then modules
    for (const url of manifest.modules || []) {
      const n = url.split("/").pop();
      await loadFile(n, url);
    }
  }

  /* ─────────── Mark Local Overrides ─────────── */
  function markModuleAsLocal(name) {
    const observer = new MutationObserver(() => {
      const select = document.querySelector('#toolSelect');
      if (!select) return;
      const opt = Array.from(select.options).find(o => o.textContent.includes(name.replace('.js', '')));
      if (opt && !opt.textContent.includes('[LOCAL]')) {
        opt.textContent += " [LOCAL]";
        opt.style.color = "#00c853";
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ─────────── SPA Navigation Watcher ─────────── */
  function enableSpaWatcher() {
    const rebuild = () => {
      setTimeout(() => {
        if (!document.querySelector('#toolSelect') && typeof window.buildLauncher === 'function') {
          console.log('🔁 Rebuilding launcher after SPA navigation');
          window.buildLauncher();
        }
      }, 4000);
    };
    const origPush = history.pushState;
    history.pushState = function () { origPush.apply(this, arguments); rebuild(); };
    window.addEventListener('popstate', rebuild);
  }

  /* ─────────── Entry Point ─────────── */
  try {
    await loadFromGit();
    enableSpaWatcher();
    console.log("%c✅ Genesys Cloud Admin Tools loaded successfully.", "color: limegreen; font-weight:bold;");
  } catch (e) {
    console.error("❌ Failed to load Genesys Cloud tools:", e);
    alert("Genesys Cloud Admin loader failed.\nSee console for details.");
  }

  /* ─────────── Developer Utilities ─────────── */
  window.gcAdminTools = {
    clearCache: () => { Object.keys(localStorage).forEach(k => k.startsWith(CACHE_PREFIX) && localStorage.removeItem(k)); console.log("🧹 Cleared cache."); },
    listCache: () => Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).map(k => k.replace(CACHE_PREFIX, "")),
    setLocalOverride: (f, p) => { const o = getOverrides(); o[f] = p; localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(o)); console.log(`🧩 Override set for ${f}: ${p}`); },
    clearOverrides: () => { localStorage.removeItem(LOCAL_OVERRIDE_KEY); console.log("🧹 Cleared overrides."); },
    getOverrides
  };
})();
