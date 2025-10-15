// ==UserScript==
// @name         Genesys Cloud Admin Core (Git Loader + Local Override + Badge)
// @namespace    local.gc.tools
// @version      3.2
// @description  Bootstrap Genesys Cloud Admin tools dynamically from Git (auto-updates launcher + modules, supports local override and local badge indicator)
// @author       James
// @match        https://*.mypurecloud.com/*
// @match        https://*.pure.cloud/*
// @match        https://*.us-gov-pure.cloud/*
// @grant        none
// ==/UserScript==

(async function () {
  'use strict';

  /* ------------------------------------------------------------------
     CONFIGURATION
  ------------------------------------------------------------------ */
  const REPO_BASE =
    "https://raw.githubusercontent.com/James-Rhodes-G/gcAdminTools/main/genesyscloudtools";
  const MANIFEST_URL = `${REPO_BASE}/manifest.json`;
  const CACHE_PREFIX = "gc_tools_cache_";
  const LOCAL_OVERRIDE_KEY = "gcLocalOverrides"; // localStorage key

  /* ------------------------------------------------------------------
     HELPERS
  ------------------------------------------------------------------ */
  async function safeFetch(url, options = {}, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const resp = await fetch(url + (url.includes("?") ? "&" : "?") + "nocache=" + Date.now(), options);
        if (resp.ok) return resp;
      } catch (e) {
        console.warn(`Fetch error (${url}):`, e);
      }
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
    throw new Error(`Failed to fetch ${url}`);
  }

  function injectScript(code, name, isLocal = false) {
    const s = document.createElement("script");
    s.textContent = code;
    s.dataset.module = name;
    document.body.appendChild(s);
    console.log(`📦 Loaded ${name}${isLocal ? " (LOCAL)" : ""}`);
  }

  function saveCache(key, value) {
    try { localStorage.setItem(CACHE_PREFIX + key, value); } catch (e) {}
  }
  function getCache(key) {
    try { return localStorage.getItem(CACHE_PREFIX + key); } catch { return null; }
  }

  function getLocalOverrides() {
    try { return JSON.parse(localStorage.getItem(LOCAL_OVERRIDE_KEY)) || {}; } catch { return {}; }
  }
  async function loadLocalFile(filePath) {
    const resp = await fetch(filePath);
    if (!resp.ok) throw new Error(`Failed to load local file: ${filePath}`);
    return await resp.text();
  }

  /* ------------------------------------------------------------------
     FILE LOADING (Git + Local + Cache)
  ------------------------------------------------------------------ */
  async function loadFile(name, url) {
    const overrides = getLocalOverrides();
    const isLocal = !!overrides[name];
    let code = null;

    // 1. Local override
    if (isLocal) {
      try {
        code = await loadLocalFile(overrides[name]);
        injectScript(code, name, true);
        markModuleAsLocal(name);
        return;
      } catch (e) {
        console.warn(`⚠️ Local override failed for ${name}:`, e);
      }
    }

    // 2. GitHub fetch
    try {
      const resp = await safeFetch(url);
      code = await resp.text();
      injectScript(code, name);
      saveCache(name, code);
    } catch (e) {
      // 3. Cache fallback
      const cached = getCache(name);
      if (cached) {
        console.log(`📦 Using cached ${name}`);
        injectScript(cached, name + " (cached)");
      } else {
        console.error(`❌ No cached version of ${name}`);
      }
    }
  }

  /* ------------------------------------------------------------------
     LOAD MANIFEST + MODULES
  ------------------------------------------------------------------ */
  async function loadFromGit() {
    console.log("🌐 Fetching manifest...");
    const manifestResp = await safeFetch(MANIFEST_URL);
    const manifest = await manifestResp.json();
    const launcherURL = manifest.launcher;
    const moduleURLs = manifest.modules || [];

    // load launcher
    await loadFile("launcher", launcherURL);

    // load each module
    for (const url of moduleURLs) {
      const name = url.split("/").pop();
      await loadFile(name, url);
    }
  }

  /* ------------------------------------------------------------------
     UI Enhancement: mark local modules in launcher
  ------------------------------------------------------------------ */
  function markModuleAsLocal(name) {
    const observer = new MutationObserver(() => {
      const select = document.querySelector('#toolSelect');
      if (!select) return;
      const option = Array.from(select.options).find(o => o.value.includes(name.replace('.js', '')));
      if (option && !option.textContent.includes('[LOCAL]')) {
        option.textContent += " [LOCAL]";
        option.style.color = "#00c853"; // green badge
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /* ------------------------------------------------------------------
     ENTRY POINT
  ------------------------------------------------------------------ */
  try {
    await loadFromGit();
    console.log("✅ GC Admin tools loaded successfully.");
  } catch (err) {
    console.error("❌ Failed to load GC Admin tools:", err);
    alert("Genesys Cloud Admin loader failed.\nSee console for details.");
  }

  /* ------------------------------------------------------------------
     DEV UTILITIES
  ------------------------------------------------------------------ */
  window.gcAdminTools = {
    clearCache: () => {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
      });
      console.log("🧹 Cleared GC tool cache.");
    },
    listCache: () =>
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .map(k => k.replace(CACHE_PREFIX, "")),
    setLocalOverride: (file, path) => {
      const overrides = getLocalOverrides();
      overrides[file] = path;
      localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(overrides));
      console.log(`🧩 Local override set for ${file}: ${path}`);
    },
    clearOverrides: () => {
      localStorage.removeItem(LOCAL_OVERRIDE_KEY);
      console.log("🧹 Cleared all local overrides.");
    },
    getOverrides: getLocalOverrides
  };

  console.log("%c[GC Admin Core v3.2 Loaded — GitHub + Local Override + Badges]", "color: limegreen; font-weight: bold;");
})();
