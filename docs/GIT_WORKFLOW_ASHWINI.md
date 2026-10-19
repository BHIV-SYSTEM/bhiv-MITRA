# 📝 MITRA Project — Git & GitHub Workflow Guide

**Repository:** `https://github.com/praj33/MITRA.git`  
**Team Setup:**
- 👨‍💻 **Raj**: Repository Owner / Manages `main` (Production & Final Integration branch).
- 👩‍💻 **Ashwini**: Developer / Works exclusively on `master1` (Development branch).

---

## ⭐ The Golden Rule

```
MY WORK  ───►  master1  ───►  GIT PUSH  ───►  RAJ REVIEWS  ───►  MERGE  ───►  main
```

---

## 🗺️ Visual Architecture Diagram (Handwritten Style)

```
========================================================================================
☁️ GITHUB REMOTE REPOSITORY (https://github.com/praj33/MITRA.git)
========================================================================================

    [origin/main] ──────●────────────●─────────────────────────────● [main updated!]
      (Raj only)                                                   ▲
                                                                   │ (Raj Reviews
                                                                   │  & Merges PR)
    [origin/master1] ───●────────────●───────────────●─────────────┘
     (Ashwini's)                                     ▲
                                                     │ git push origin master1
─────────────────────────────────────────────────────┼──────────────────────────────────
💻 ASHWINI'S LOCAL WORKSPACE                         │
─────────────────────────────────────────────────────┼──────────────────────────────────
                                                     │
  1. git switch master1                              │
        │                                            │
        ▼                                            │
  2. Local Coding (Chatbot / Backend / UI)           │
        │                                            │
        ▼                                            │
  3. git status                                      │
        │                                            │
        ▼                                            │
  4. git add .                                       │
        │                                            │
        ▼                                            │
  5. git commit -m "feat: complete companion task"   │
        │                                            │
        ▼                                            │
  6. git push origin master1 ────────────────────────┘

========================================================================================
🔄 FUTURE SYNC WORKFLOW (When Raj adds updates to main):
========================================================================================
  git switch main
  git pull origin main
  git switch master1
  git merge main
  (resolve conflicts if any & test)
  git push origin master1
```

---

## 🚀 Step-by-Step Command Playbook

### Step 1: Clone Repository
```bash
git clone https://github.com/praj33/MITRA.git
cd MITRA-Universal-Companion
```

### Step 2: Switch to your development branch
```bash
git switch master1
# Verify active branch:
git branch
# Output should show: * master1
```

### Step 3: Local Development Cycle
Whenever you add code, change chatbot files, or update backend services:
```bash
# Check modified files
git status

# Stage all changes
git add .

# Commit with a clean descriptive message
git commit -m "feat: enhance chatbot UI and backend connection pooling"
```

### Step 4: Push to GitHub
```bash
# Push directly and ONLY to master1
git push origin master1
```

> [!IMPORTANT]
> **Ashwini's changes go to `master1`, NEVER directly to `main`!**

### Step 5: Raj's Review & Merge
1. Your commit appears on `origin/master1` on GitHub.
2. Raj reviews the changes, runs testing on staging/runtime.
3. Raj initiates and approves the merge: `master1 → main`.
4. After merge, `main` contains your tested and approved code.

---

## 🔄 Syncing `master1` with Latest `main`

When Raj updates `main` with new features and you need the latest code:

```bash
# 1. Update local main
git switch main
git pull origin main

# 2. Switch back to master1 and merge main into master1
git switch master1
git merge main

# 3. Test locally, resolve any conflicts if present, then push:
git push origin master1
```

---

## 🎯 Concrete Example: Task 1

```
Task 1 (Chatbot UI update)
   ↓
git switch master1
   ↓
Code changes in frontend & backend
   ↓
git add .
   ↓
git commit -m "feat: implement chatbot conversational interface"
   ↓
git push origin master1
   ↓
Raj reviews on GitHub
   ↓
Raj merges master1 → main
   ↓
Task 1 successfully live on main! ✅
```

---

## ⚠️ Mandatory Safety Rules

1. 🚫 **NEVER push directly to `main`** — `main` is protected and managed by Raj.
2. 🚫 **NEVER use `git push --force`** — Force pushing can overwrite history and destroy work.
3. 🔒 **ALWAYS work on `master1`** — Run `git branch` before making edits to ensure you are on `master1`.
4. 📤 **Always push completed work to `master1`** (`git push origin master1`).
5. 👑 **Raj decides merge timing** — Raj verifies and merges `master1` into `main`.
6. 🔄 **Keep `master1` updated** — Regularly pull and merge `main` before starting new major tasks.

---

## 🌐 Visual Diagram File
To view the interactive handwritten engineering diagram:
- Open [`docs/git_workflow_diagram.html`](file:///c:/Users/Ashwini%20Wadekar/OneDrive/Desktop/BVIInternship/MITRA-Universal-Companion/docs/git_workflow_diagram.html) in your web browser!
