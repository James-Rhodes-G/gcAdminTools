// ==UserScript==
// @name         Genesys Cloud Admin Core (Git Loader + Local Override + Badge)
// @namespace    local.gc.tools
// @version      3.2
// @description  Bootstrap Genesys Cloud Admin tools dynamically from Git (auto-updates launcher + modules, supports local override and local badge indicator)
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
    console.log(`📦 Loaded ${name}${isLocal ? " (LOCAL)" : "
