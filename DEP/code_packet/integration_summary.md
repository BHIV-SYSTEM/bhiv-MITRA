# Integration Summary — MITRA Per-Product Integration

## Integration Pattern

Every product uses the exact same integration pattern — no product-specific code:

```html
<!-- Step 1: Load the design system styles -->
<link rel="stylesheet" href="../styles/mitra-companion.css">

<!-- Step 2: Declare the companion element with configuration -->
<mitra-companion
    stylesheet-path="../styles/mitra-companion.css"
    api-base-url="http://localhost:8000">
</mitra-companion>

<!-- Step 3: Load the companion as an ES module -->
<script type="module" src="../src/mitra-companion.js"></script>
```

The `api-base-url` attribute is read by `src/config.js` at runtime — each product page can point to a different backend without modifying any component code.

---

## Product-by-Product Status

### Login (`login.html`)
- **Status:** ✅ Integrated
- **MITRA visible:** Yes — companion appears immediately on login page
- **Session:** New session generated if none exists in localStorage

### Signup (`signup.html`)
- **Status:** ✅ Integrated
- **MITRA visible:** Yes — companion appears on signup page
- **Session:** Shares session with login if accessed from same browser

### Gurukul (`pages/gurukul.html`)
- **Status:** ✅ Integrated
- **MITRA visible:** Yes
- **Session:** Continues from login/signup session via localStorage `mitra_context_store`

### Samruddhi (`pages/samruddhi.html`)
- **Status:** ✅ Integrated (NEW — created this sprint)
- **MITRA visible:** Yes
- **Session:** Same localStorage key — conversation continues from Gurukul

### SETU (`pages/setu.html`)
- **Status:** ✅ Integrated
- **MITRA visible:** Yes
- **Session:** Same localStorage key — conversation continues from Gurukul, Samruddhi

### UniGuru (`pages/uniguru.html`)
- **Status:** ✅ Integrated (URL bug fixed this sprint)
- **MITRA visible:** Yes
- **Session:** Continuous

### Samachar (`pages/samachar.html`)
- **Status:** ✅ Integrated
- **MITRA visible:** Yes

---

## Conversation Flow Across Products

```
User opens login.html
  └─ MITRA loads, session ID created in localStorage
      └─ User navigates to pages/gurukul.html
            └─ Same localStorage read: same session ID, same conversation history
                  └─ User navigates to pages/samruddhi.html
                        └─ Same localStorage: conversation continues
                              └─ User navigates to pages/setu.html
                                    └─ Same localStorage: context preserved
```

> **Cross-origin limitation:** If products are deployed on separate domains/subdomains, `localStorage` does not transfer. This is a backend blocker — see `DEP/blockers.md#B1`.
