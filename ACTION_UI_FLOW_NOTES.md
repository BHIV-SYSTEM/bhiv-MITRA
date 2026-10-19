# Action UI Flow Notes
**Demo-Ready UX Documentation**  
**Date: January 22, 2026**

---

## Overview
This document details the visual flow and interaction patterns of the AI Assistant, showing how actions and outcomes are presented to users in a calm, understandable way.

---

## Core Interaction Flows

### Flow 1: Simple Question-Answer
**User Action:** Asks a question  
**Example:** "What's the weather like today?"

**UI Flow:**
1. **User types** → Message appears in input field with visual feedback
2. **User sends** → 
   - Toast notification: "Message sent" (green, 2s)
   - User message bubble appears (blue, right-aligned)
   - Loading state appears below
3. **Loading states** (sequential):
   - "Reading your message..."
   - "Understanding what you need..."
   - "Working on it..."
4. **Response appears:**
   - Intent card (blue box): "Got it: Get Information"
   - Main response text (clear, readable)
   - Completion indicator: ✓ "All set" (small green checkmark)
   - Next step hint: "Is there anything else I can help you with?"
   - Timestamp: "Just now"

**User Outcome:** ✅ Clear answer + knows conversation is ready for next input

---

### Flow 2: Task Creation
**User Action:** Requests task creation  
**Example:** "Remind me to call Mom tomorrow at 3pm"

**UI Flow:**
1. **Message sent** → Toast: "Message sent"
2. **User bubble** appears (blue, right)
3. **Loading states:**
   - "Reading your message..."
   - "Understanding what you need..."
   - "Working on it..."
4. **Response appears:**
   - Intent card: "Got it: Set a Reminder • Personal Task"
   - Main response: "I've created a reminder for you to call Mom tomorrow at 3pm."
   - **Task Created Section** (prominent):
     - ✓ Green checkmark icon in circle
     - "Task Created" label (green, bold)
     - **Action Card** (liquid glass style):
       - Status: "Pending" with yellow ⏳ icon
       - Description: "Call Mom tomorrow at 3pm"
       - Created timestamp
       - Next step hint: "You can start working on this task when you're ready."
   - Next step suggestion: "What would you like to do next? You can ask me to create more tasks, answer questions, or help with anything else."

**User Outcome:** ✅ Sees task was created, knows its status, has clear next steps

---

### Flow 3: Blocked Request (Safety)
**User Action:** Requests prohibited content  
**Example:** "How do I hack into someone's account?"

**UI Flow:**
1. **Message sent** → Toast: "Message sent"
2. **User bubble** appears
3. **Loading states:**
   - "Reading your message..."
   - "Reviewing content..."
   - "Double-checking..."
4. **Response appears:**
   - **Red warning card** (prominent, at top):
     - "I can't help with that request. Let me know if there's something else I can do."
   - No intent card (doesn't show understanding for blocked content)
   - Status: ⊘ "I can't help with that" (orange)
   - Soft redirect: "Let me know if there's something else I can do for you."
   - **Optional details** (hidden by default):
     - Button: "Show details"
     - If clicked → Shows "Content Review: Blocked • PROHIBITED"
     - If clicked → Shows "Safety Status: Not Available"

**User Outcome:** ✅ Clear refusal without shame, alternative path offered, no technical jargon

---

### Flow 4: Rewritten Request (Content Adjustment)
**User Action:** Ambiguous or risky phrasing  
**Example:** "Tell me how to kill this process"

**UI Flow:**
1. **Message sent** → Toast: "Message sent"
2. **User bubble** appears with original message
3. **Loading states:**
   - "Reading your message..."
   - "Reviewing content..."
4. **Response appears:**
   - **Yellow info card** (top):
     - "I rephrased this to keep things safe and clear."
   - Intent card: "Got it: Get Information"
   - Main response: Explains how to terminate a software process
   - Completion: ✓ "All set"
   - Next step hint
   - **Optional details** (hidden):
     - "Show details" → "Content Review: Rephrased • TONE"

**User Outcome:** ✅ Understands adjustment was made, gets helpful answer, no confusion

---

### Flow 5: Execution Failure
**User Action:** Requests action that fails  
**Example:** "Send an email to john@example.com"

**UI Flow:**
1. **Message sent** → Toast: "Message sent"
2. **User bubble** appears
3. **Loading states:**
   - "Reading your message..."
   - "Understanding what you need..."
   - "Working on it..."
4. **Response appears:**
   - Intent card: "Got it: Task Creation"
   - Main response: "I tried to send that email, but ran into an issue."
   - **Status indicator** (visible):
     - ✗ "Couldn't complete that" (red)
   - **Error explanation** (calm):
     - "What happened: Email service unavailable"
   - Next step hint: "Please try again, or let me know if you need help with something else."

**User Outcome:** ✅ Knows what failed, why it failed, and has path forward—no panic

---

### Flow 6: Processing/Pending State
**User Action:** Submits complex request  
**Example:** "Analyze this data and create a report"

**UI Flow:**
1. **Message sent** → Toast: "Message sent"
2. **User bubble** appears
3. **Extended loading** (shows progress):
   - "Reading your message..."
   - "Understanding what you need..."
   - "Working on it..." (may stay here longer)
4. **If still processing:**
   - Response bubble shows:
     - Intent card
     - Main response text
     - Status: ⟳ "Working on it..." (blue, animated)
5. **When complete:**
   - Status updates to: ✓ "All set" (green)

**User Outcome:** ✅ Knows system is working, can see progress, not left wondering

---

## Visual Design Elements

### Message Bubbles
| Element | Style | Purpose |
|---|---|---|
| User messages | Blue background, right-aligned, rounded corners | Clear distinction from assistant |
| Assistant messages | White/glass effect, left-aligned, liquid glass blur | Calm, premium feel |
| Timestamps | Small, gray, subtle | Context without clutter |

### Status Indicators
| Status | Icon | Color | Animation | Meaning |
|---|---|---|---|---|
| Completed | ✓ | Green | None | Success, done |
| Executing | ⟳ | Blue | Rotating | In progress |
| Pending | ⏳ | Yellow | Pulse | Waiting |
| Skipped | ⊘ | Orange | None | Can't do that |
| Failed | ✗ | Red | None | Error occurred |

### Action Cards (Tasks)
- **Container:** Liquid glass with blur effect
- **Border:** Subtle, adaptive to dark/light mode
- **Hover:** Blue glow on border
- **Content:**
  - Status badge (top-left)
  - Description (prominent, readable font)
  - Timestamps (small, bottom)
  - Next step hint (contextual, italic)

### Confirmation Elements
| Element | When Shown | Style |
|---|---|---|
| Toast notification | Message sent | Green, top-center, auto-dismiss (2s) |
| Task created banner | Task successfully created | Green checkmark + label |
| Action summary | General response complete | Small green checkmark |
| Error message | Failure occurs | Red card with calm explanation |

---

## Empty State

**First Visit (No Messages):**
- Large chat bubble icon (blue)
- Heading: "Start a conversation"
- Subtext: "Start a conversation with your AI assistant. I'm here to help with questions, tasks, and more."
- Input ready below

**User Outcome:** ✅ Knows what to do immediately

---

## Key UX Principles Demonstrated

### 1. **Clarity**
- Every action has a clear outcome
- Status always visible when relevant
- Next steps always suggested

### 2. **Calm**
- No panic-inducing language
- Soft colors, gentle animations
- Errors are supportive, not accusatory

### 3. **Progressive Disclosure**
- Advanced details hidden by default
- Power users can access if needed
- Default view is clean

### 4. **Feedback Loop**
- Message sent confirmation
- Loading states show progress
- Completion explicitly marked

### 5. **No Dead Ends**
- Every state has next action
- Errors suggest recovery
- Always ready for new input

---

**Document Status:** Complete  
**Last Updated:** January 22, 2026  
**Owner:** Chandragupta Maurya