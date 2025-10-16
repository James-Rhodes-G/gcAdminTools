
---

### 📜 **CHANGELOG.md**

```markdown
# 📜 CHANGELOG

## [v5.0] – Stable Cross-Platform Release (2025-02-XX)
### ✨ Added
- **Cross-platform launcher hotkey**
  - **Alt + L (Windows/Linux)** and **⌘ + ⇧ + L (macOS)** to reopen launcher.
- **SPA navigation persistence**
  - Launcher rebuilds automatically after Genesys Cloud route changes.
- **Unified Helpers Library (v1.2)**
  - Centralized UI, progress bar, logging, and `waitForBody()` utilities.
- **Dynamic `helpers.js` manifest inclusion**
  - Always loads before launcher and modules.
- **Launcher using helpers**
  - Now uses `createPanel()` for consistent look and feel.
- **UI resilience**
  - Panels attach to `<html>` to avoid React DOM clipping.
- **Improved color contrast** for readability on dark backgrounds.

### 🛠 Fixed
- Race conditions that caused missing UIs.
- Timing issues from early DOM injection.
- Hotkey inconsistencies between macOS and Windows.
- Manifest overwriting manual helpers entry.

### ⚙️ Versions
| Component | Version | Description |
|------------|----------|-------------|
| **core.js** | 3.6 | Git loader, SPA-safe, hotkey support |
| **helpers.js** | 1.2 | Shared library (UI, logging, progress, registry) |
| **launcher.js** | 2.1 | Uses helpers, globally exported, hotkey compatible |
| **modules** | 5.0 | Standardized tools (Phone Site Migrator, Priority Updater) |

---

## [v4.x] – Pre-release Baseline
- Initial modular architecture.
- Separate Phone Site Migrator and Priority Updater tools.
- No unified helper system.
- No cross-platform hotkey or SPA awareness.
