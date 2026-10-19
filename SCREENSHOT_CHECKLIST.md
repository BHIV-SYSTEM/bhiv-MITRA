# EVIDENCE PACKET: SCREENSHOT CHECKLIST

**Date:** January 22, 2026
**Purpose:** To provide visual evidence for all key user flows and system states.

---

## Instructions

Capture a screenshot for each item listed below. Name the file exactly as specified (e.g., `01_empty_state.png`). Ensure screenshots are clean, well-cropped, and clearly demonstrate the required UI state.

---

## 1. Core UI & Happy Paths

- [ ] **`01_empty_state.png`**: The chat interface before any messages are sent.
- [ ] **`02_simple_question.png`**: A simple user question (e.g., "What is 2+2?").
- [ ] **`03_simple_response.png`**: The assistant's response, showing the intent card, answer, and completion indicator.
- [ ] **`04_task_creation_request.png`**: A user request to create a task (e.g., "Remind me to buy milk").
- [ ] **`05_task_creation_response.png`**: The assistant's response, showing the "Task Created" banner and the Action Card with "Pending" status.

## 2. Safety & Content Moderation

- [ ] **`06_blocked_request.png`**: A user request for prohibited content.
- [ ] **`07_blocked_response.png`**: The assistant's response, showing the red safety card politely refusing the request.
- [ ] **`08_blocked_response_details.png`**: The same blocked response, but with the "Show details" toggle clicked to reveal the internal `Content Review: Blocked` status.
- [ ] **`09_rewritten_request.png`**: A user request with ambiguous or risky phrasing.
- [ ] **`10_rewritten_response.png`**: The assistant's response, showing the yellow info card explaining the rephrase.

## 3. Error & State Handling

- [ ] **`11_loading_state.png`**: The assistant in a loading state, showing one of the friendly messages like "Understanding what you need...".
- [ ] **`12_long_processing_state.png`**: The assistant in a long-running task, showing the "Working on it..." status with a pulsing or spinning icon.
- [ ] **`13_execution_failure.png`**: The UI after a backend execution fails, showing the red error card with a calm explanation and a "Retry" suggestion.
- [ ] **`14_network_error.png`**: The UI when the network connection is lost, showing the "You're offline" banner.
- [ ] **`15_timeout_error.png`**: The UI after a request times out, showing the message "Request timed out. Please try again."

## 4. UI Components & Visuals

- [ ] **`16_toast_notification.png`**: The "Message sent" toast notification at the top of the screen.
- [ ] **`17_action_card_hover.png`**: An Action Card with the mouse hovering over it to show the blue glow effect.
- [ ] **`18_dark_mode.png`**: The chat interface in Dark Mode to demonstrate adaptive colors.

## 5. Authentication & Application Pages

- [ ] **`19_login_page.png`**: The `login.html` page with the MITRA companion visible.
- [ ] **`20_signup_page.png`**: The `signup.html` page with the MITRA companion visible.
- [ ] **`21_gurukul_page.png`**: The main Gurukul application page (`Untitled-1.html`) with the MITRA companion visible.

---

## Submission Checklist

- [ ] All 21 screenshots have been captured.
- [ ] All files are named according to the checklist.
- [ ] All screenshots are high-resolution and clearly legible.
- [ ] All screenshots have been placed in the `Evidence_Packet/screenshots/` directory.

---

**Status:** PENDING SCREENSHOT CAPTURE