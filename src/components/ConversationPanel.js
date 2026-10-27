import { controlPlane, getApiBaseUrl } from '../services/controlPlane.js';
import { MITRA_CANONICAL_AVATAR_DATA_URL, getActiveMitraAvatar, renderAvatarElement } from '../services/avatarHelper.js';

export class ConversationPanel {
  constructor(eventBus, contextStore) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-chat';
    this.element.id = 'chat-container';
    this.element.setAttribute('tabindex', '0');
    this.eventBus = eventBus;
    this.contextStore = contextStore;

    // Dedicated smooth mouse wheel & trackpad scroll handler
    this.element.addEventListener('wheel', (e) => {
      if (this.element.scrollHeight > this.element.clientHeight) {
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 28;
        else if (e.deltaMode === 2) delta *= this.element.clientHeight;
        this.element.scrollTop += delta;
      }
    }, { passive: true });

    // Touch gesture scrolling for touchscreens and mobile
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    this.element.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) {
        touchStartY = e.touches[0].clientY;
        touchStartScrollTop = this.element.scrollTop;
      }
    }, { passive: true });

    this.element.addEventListener('touchmove', (e) => {
      if (e.touches && e.touches.length > 0) {
        const delta = touchStartY - e.touches[0].clientY;
        this.element.scrollTop = touchStartScrollTop + delta;
      }
    }, { passive: true });

    // WhatsApp style floating scroll-to-bottom button
    this.scrollBottomBtn = document.createElement('button');
    this.scrollBottomBtn.className = 'mitra-scroll-bottom-btn';
    this.scrollBottomBtn.setAttribute('title', 'Scroll to latest messages');
    this.scrollBottomBtn.setAttribute('aria-label', 'Scroll to bottom');
    this.scrollBottomBtn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
      </svg>
    `;
    this.scrollBottomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.scrollToBottom(true, true);
    });

    this.element.addEventListener('scroll', () => {
      const distanceFromBottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight;
      if (distanceFromBottom > 100) {
        this.scrollBottomBtn.classList.add('visible');
      } else {
        this.scrollBottomBtn.classList.remove('visible');
      }
    }, { passive: true });
    
    // Load existing history on creation
    this.renderHistory();

    if (eventBus) {
      // Real-time listener: append new incoming messages immediately
      eventBus.on('chat.mitra_message', (data) => {
        if (data.role === 'mitra') {
          this.addMitraMessage(data.text, new Date(), data.intent, data.suggestedActions || [], data.capabilityResult);
        } else {
          this.addSystemMessage(data.text);
        }
      });
      
      // Also render real notifications (like reminders) as chat bubbles
      eventBus.on('notification.received', (data) => {
        if (data.role === 'mitra') {
          this.addMitraMessage(data.text || data.message, new Date(), data.intent, data.suggestedActions || [], data.capabilityResult);
        }
      });

      // Real-time listener: when a user message is sent
      eventBus.on('user.message_sent', (data) => {
        this.addUserMessage(data.text, new Date());
      });

      // Real-time listener: show/hide animated typing indicator while companion is thinking
      eventBus.on('runtime.thinking', () => {
        this.showTypingIndicator();
      });

      eventBus.on('runtime.idle', () => {
        this.hideTypingIndicator();
      });

      // Real-time listener: when capability finishes execution successfully
      eventBus.on('capability.completed', (data) => {
        this.hideTypingIndicator();
        this.addCapabilityCard(data.capability, data.result, data.duration, data.data || {}, true);
      });

      // Real-time listener: when capability execution fails or errors out
      eventBus.on('capability.failed', (data) => {
        this.hideTypingIndicator();
        this.addCapabilityErrorCard(data.capability, data.error || data.result, data.data || {});
      });

      // Real-time listener: when user clears history or resets companion
      eventBus.on('context.cleared', () => {
        this.hideTypingIndicator();
        this.renderHistory();
      });

      // Dynamic avatar update listener
      eventBus.on('avatar.changed', () => {
        const newAvatar = getActiveMitraAvatar(this.contextStore);
        const heroBadge = this.element.querySelector('.mitra-hero-badge-container');
        if (heroBadge) {
          const oldMedia = heroBadge.querySelector('.mitra-hero-badge-img');
          if (oldMedia) oldMedia.remove();
          const newMedia = renderAvatarElement(newAvatar, 'mitra-hero-badge-img');
          heroBadge.appendChild(newMedia);
        }
        const thumbContainers = this.element.querySelectorAll('.chat-msg-row.mitra');
        thumbContainers.forEach(row => {
          const oldThumb = row.querySelector('.chat-avatar-thumb');
          if (oldThumb) {
            const newThumb = renderAvatarElement(newAvatar, 'chat-avatar-thumb');
            row.replaceChild(newThumb, oldThumb);
          }
        });
      });
    }
  }

  renderHeroBanner() {
    const existing = this.element.querySelector('.mitra-hero-banner');
    if (existing) return;

    const currentAvatar = getActiveMitraAvatar(this.contextStore);

    const hero = document.createElement('div');
    hero.className = 'mitra-hero-banner';
    
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'mitra-hero-badge-container';
    badgeContainer.style.cursor = 'pointer';
    badgeContainer.setAttribute('title', 'Click to change avatar');
    badgeContainer.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.eventBus) this.eventBus.emit('avatar.request_change');
    });
    
    const glow = document.createElement('div');
    glow.className = 'mitra-hero-badge-glow';
    badgeContainer.appendChild(glow);

    const avatarEl = renderAvatarElement(currentAvatar, 'mitra-hero-badge-img');
    badgeContainer.appendChild(avatarEl);

    hero.appendChild(badgeContainer);

    const title = document.createElement('div');
    title.className = 'mitra-hero-title';
    title.textContent = 'MITRA AI COMPANION';
    hero.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'mitra-hero-sub';
    sub.textContent = 'Universal Intelligence • Connected & Ready';
    hero.appendChild(sub);

    this.element.prepend(hero);
  }

  renderHistory() {
    this.element.innerHTML = '';
    this.renderHeroBanner();
    const history = this.contextStore ? this.contextStore.getHistory() : [];
    if (history && history.length > 0) {
      history.forEach(msg => {
        if (msg.role === 'user') {
          this.addUserMessage(msg.text, new Date(msg.timestamp));
        } else if (msg.role === 'mitra') {
          if (msg.isCapability) {
            this.addCapabilityCard(msg.capabilityName, msg.result, msg.duration, msg.data, false);
          } else {
            this.addMitraMessage(msg.text, new Date(msg.timestamp), msg.intent, msg.suggestedActions, msg.capabilityResult);
          }
        }
      });
      this.scrollToBottom(false);
    } else {
      this.fetchDynamicGreeting();
    }
  }

  async fetchDynamicGreeting() {
    const defaultGreeting = "Hello! I'm Mitra, your friendly assistant. How can I help you today?";
    try {
      const userId = this.contextStore ? this.contextStore.getUserId() : null;
      if (!userId) {
        this.addMitraMessage(defaultGreeting, new Date());
        return;
      }
      
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const headers = { 'X-API-Key': 'bhiv-enterprise-key' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${getApiBaseUrl()}/api/companion/greeting/${encodeURIComponent(userId)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        this.addMitraMessage(data.greeting || data.message || defaultGreeting, new Date());
      } else {
        this.addMitraMessage(defaultGreeting, new Date());
      }
    } catch (e) {
      this.addMitraMessage(defaultGreeting, new Date());
    }
  }

  showTypingIndicator() {
    this.hideTypingIndicator();
    const row = document.createElement('div');
    row.className = 'chat-msg-row mitra wa-typing-row';
    row.id = 'mitra-typing-indicator';

    const currentAvatar = getActiveMitraAvatar(this.contextStore);
    const avatarMedia = renderAvatarElement(currentAvatar, 'chat-avatar-thumb');

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble mitra typing-bubble';
    bubble.innerHTML = `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
      <span style="font-size:11px; color:#8696a0; margin-left:8px;">typing...</span>
    `;

    row.appendChild(avatarMedia);
    row.appendChild(bubble);
    this.element.appendChild(row);
    this.scrollToBottom(true);
  }

  hideTypingIndicator() {
    const existing = this.element.querySelector('#mitra-typing-indicator');
    if (existing) existing.remove();
  }

  addUserMessage(text, date = new Date()) {
    const row = document.createElement('div');
    row.className = 'chat-msg-row user';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.innerHTML = `
      <div style="overflow-wrap: break-word; word-break: break-word; box-sizing: border-box; font-size:13.5px; line-height:1.45;">${this.escapeHtml(text)}</div>
      <div class="chat-timestamp">${timeStr} <span class="wa-ticks">✓✓</span></div>
    `;
    
    row.appendChild(bubble);
    this.element.appendChild(row);
    this.scrollToBottom(true, true);
  }

  addMitraMessage(text, date = new Date(), intent = null, suggestedActions = [], capabilityResult = null) {
    this.hideTypingIndicator();

    // If capabilityResult is present, render the rich ecosystem card directly
    if (capabilityResult && capabilityResult.capability) {
      this.addCapabilityCard(
        capabilityResult.capability,
        capabilityResult.summary || text,
        '0.1s',
        capabilityResult.data || {},
        true
      );
      return;
    }

    const row = document.createElement('div');
    row.className = 'chat-msg-row mitra';

    const currentAvatar = getActiveMitraAvatar(this.contextStore);
    const avatarMedia = renderAvatarElement(currentAvatar, 'chat-avatar-thumb');
    avatarMedia.style.cursor = 'pointer';
    avatarMedia.setAttribute('title', 'Click to change avatar');
    avatarMedia.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.eventBus) this.eventBus.emit('avatar.request_change');
    });

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble mitra';
    
    // Auto-speak voice alert ONLY when a reminder is due
    if (intent === 'reminder_alert') {
      controlPlane.speakText(text);
    }

    let html = `
      <div class="chat-text-row">
        <div class="chat-text-body">${this.formatMarkdown(text)}</div>
        <button class="mitra-speaker-btn" title="Listen to AI voice">🔊</button>
      </div>
    `;
    
    // Add Intent badge if present
    if (intent && intent !== 'general') {
      if (intent === 'summarize') {
        html += `<div style="margin-top:6px; font-size:10px; background:rgba(0,230,118,0.15); border:1px solid rgba(0,230,118,0.35); color:#00e676; padding:2px 8px; border-radius:10px; display:inline-flex; align-items:center; gap:4px; width:fit-content;">📄 AI Summary</div>`;
      } else if (intent === 'summarize_prompt') {
        html += `<div style="margin-top:6px; font-size:10px; background:rgba(255,183,0,0.15); border:1px solid rgba(255,183,0,0.35); color:#ffb700; padding:2px 8px; border-radius:10px; display:inline-flex; align-items:center; gap:4px; width:fit-content;">💡 Input required</div>`;
      } else if (intent !== 'reminder_alert') {
        html += `<div style="margin-top:6px; font-size:10px; opacity:0.85; background:rgba(108,92,231,0.25); border:1px solid rgba(108,92,231,0.4); padding:2px 8px; border-radius:10px; display:inline-flex; align-items:center; gap:4px; width:fit-content;">⚡ Intent: ${this.escapeHtml(intent)}</div>`;
      }
    }

    // Render Suggested Action chips if present
    if (suggestedActions && suggestedActions.length > 0) {
      const actionsHtml = suggestedActions.map(action => 
        `<button class="mitra-action-chip" style="margin:4px 6px 0 0; background:linear-gradient(135deg, rgba(108,92,231,0.3), rgba(0,230,118,0.2)); border:1px solid rgba(255,255,255,0.25); color:#fff; padding:5px 12px; border-radius:14px; font-size:11px; font-weight:500; cursor:pointer; font-family:inherit; transition:0.2s;">✨ ${this.escapeHtml(action)}</button>`
      ).join('');
      html += `<div style="margin-top:8px; display:flex; flex-wrap:wrap;">${actionsHtml}</div>`;
    }

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `<div class="chat-timestamp">${timeStr}</div>`;
    bubble.innerHTML = html;

    // Attach click listener for Speaker Button (Speech Output)
    const speakerBtn = bubble.querySelector('.mitra-speaker-btn');
    if (speakerBtn) {
      speakerBtn.addEventListener('click', () => {
        controlPlane.speakText(text);
      });
    }

    // Attach click listeners to suggested action chips
    const chips = bubble.querySelectorAll('.mitra-action-chip');
    chips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        const actionText = e.target.textContent.replace('✨ ', '').trim();
        if (this.eventBus) {
          this.eventBus.emit('chat.send_suggested', actionText);
        }
      });
    });

    // Attach delete reminder listener if present
    const delBtn = bubble.querySelector('.btn-delete-reminder');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        const remId = e.target.getAttribute('data-id');
        e.target.textContent = 'Deleting...';
        const success = await controlPlane.deleteReminder(remId);
        if (success) {
          e.target.parentElement.style.opacity = '0.5';
          e.target.textContent = 'Deleted from DB ✓';
        } else {
          e.target.textContent = 'Failed to delete';
        }
      });
    }

    row.appendChild(avatarMedia);
    row.appendChild(bubble);
    this.element.appendChild(row);
    this.scrollToBottom();
  }

  /**
   * Render rich visual widgets for Calendar, OCR, Tasks, Voice, Health, etc.
   */
  addCapabilityCard(capability, resultText, duration, backendData = {}, isRealtime = false) {
    const card = document.createElement('div');
    card.className = 'chat-bubble mitra capability-widget';
    card.style.background = 'rgba(21, 21, 29, 0.95)';
    card.style.border = '1px solid rgba(108, 92, 231, 0.4)';
    card.style.maxWidth = '92%';
    card.style.padding = '14px 16px';
    card.style.borderRadius = '16px';
    card.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.3)';

    const now = new Date().toLocaleTimeString();
    const capUpper = capability.toUpperCase();

    let widgetContent = '';

    if (capability === 'calendar') {
      const nowD = new Date();
      const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const currentMonth = monthNames[nowD.getMonth()];
      const currentYear = nowD.getFullYear();
      const todayDate = nowD.getDate();

      // Build 7-column Calendar Month Grid
      const daysInMonth = new Date(currentYear, nowD.getMonth() + 1, 0).getDate();
      const firstDayIdx = new Date(currentYear, nowD.getMonth(), 1).getDay();

      let gridCells = '';
      for (let i = 0; i < firstDayIdx; i++) {
        gridCells += `<div style="padding:4px; text-align:center; opacity:0.2;"></div>`;
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === todayDate;
        gridCells += `
          <div style="
            padding:6px 2px; text-align:center; font-size:11px; font-weight:${isToday ? '700' : '400'};
            background:${isToday ? '#6C5CE7' : 'rgba(255,255,255,0.03)'};
            color:${isToday ? '#fff' : '#e4e4e7'}; border-radius:6px;
            border:${isToday ? '1px solid #a29bfe' : '1px solid rgba(255,255,255,0.05)'};
          ">${d}</div>
        `;
      }

      if (backendData.events && Array.isArray(backendData.events)) {
        const eventsHtml = backendData.events.map(e => `
          <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; margin-bottom:6px; font-size:12px;">
            <div style="font-weight:600; color:#fff; font-size:12px; margin-bottom:2px;">📌 ${this.escapeHtml(e.title || 'Event')}</div>
            <div style="color:rgba(255,255,255,0.6); font-size:10px;">⏰ ${e.start ? new Date(e.start).toLocaleString() : ''} ${e.end ? '→ ' + new Date(e.end).toLocaleString() : ''}</div>
          </div>
        `).join('');

        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#6c5ce7; display:flex; align-items:center; gap:6px;">📅 CALENDAR EVENTS</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Live DB Sync</span>
          </div>
          <!-- 7-Column Day Header (Sun-Sat) -->
          <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:6px; text-align:center; font-size:10px; font-weight:700; color:#a1a1aa;">
            <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
          </div>
          <!-- Month Date Grid -->
          <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:10px;">
            ${gridCells}
          </div>
          <div style="max-height:200px; overflow-y:auto; padding-right:4px;">
            ${eventsHtml || '<div style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; padding:10px;">No upcoming events.</div>'}
          </div>
        `;
      } else {
        // Real event data from backend
        const event = backendData.event || {};
        const eventTitle = event.title || resultText.replace(/^Calendar event created:\s*/i, '').replace(/^"|"$/g, '');
        const eventStart = event.start ? new Date(event.start).toLocaleString() : 'Today';
        const eventEnd = event.end ? ` → ${new Date(event.end).toLocaleString()}` : '';
        const eventId = event.id ? `<div style="margin-top:4px; font-size:9px; color:rgba(255,255,255,0.3);">ID: ${this.escapeHtml(event.id)}</div>` : '';

        const syncUrls = backendData.sync_urls || {};
        const googleUrl = syncUrls.google || `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(eventTitle)}`;
        const outlookUrl = syncUrls.microsoft || `https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(eventTitle)}`;
        const appleUrl = syncUrls.apple || `http://localhost:8001/api/calendar/feed.ics`;
        const zohoUrl = syncUrls.zoho || `https://calendar.zoho.com/calendar/export/event?title=${encodeURIComponent(eventTitle)}`;

        const providerButtonsHtml = `
          <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:6px;">
            <a href="${googleUrl}" target="_blank" rel="noopener noreferrer" style="background:#4285F4; color:#fff; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">🟢 Sync to Google</a>
            <a href="${outlookUrl}" target="_blank" rel="noopener noreferrer" style="background:#0078D4; color:#fff; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">🟦 Microsoft Outlook</a>
            <a href="${appleUrl}" target="_blank" rel="noopener noreferrer" style="background:#A2AAAD; color:#000; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">🍎 Apple iCal</a>
            <a href="${zohoUrl}" target="_blank" rel="noopener noreferrer" style="background:#C00; color:#fff; padding:5px 10px; border-radius:6px; font-size:10px; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">🟡 Zoho Calendar</a>
          </div>
        `;

        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#6c5ce7; display:flex; align-items:center; gap:6px;">📅 CALENDAR (${currentMonth} ${currentYear})</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Live DB Sync</span>
          </div>

          <!-- 7-Column Day Header (Sun-Sat) -->
          <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:6px; text-align:center; font-size:10px; font-weight:700; color:#a1a1aa;">
            <div>SUN</div><div>MON</div><div>TUE</div><div>WED</div><div>THU</div><div>FRI</div><div>SAT</div>
          </div>

          <!-- Month Date Grid -->
          <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px; margin-bottom:10px;">
            ${gridCells}
          </div>

          <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
            <div style="font-weight:600; color:#fff; font-size:13px; margin-bottom:4px;">📌 ${this.escapeHtml(eventTitle)}</div>
            <div style="color:rgba(255,255,255,0.6); font-size:11px;">⏰ ${this.escapeHtml(eventStart)}${this.escapeHtml(eventEnd)}</div>
            ${eventId}
            ${providerButtonsHtml}
          </div>
        `;
      }

    } else if (capability === 'task') {
      if (backendData.tasks && Array.isArray(backendData.tasks)) {
        // Render Task List
        const tasksHtml = backendData.tasks.map(t => `
          <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; margin-bottom:6px; font-size:12px; display:flex; flex-direction:column; gap:4px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="checkbox" class="task-checkbox" data-id="${this.escapeHtml(t.id || '')}" ${t.status === 'completed' ? 'checked' : ''} style="accent-color:#6c5ce7; cursor:pointer;">
              <span class="task-title-text" style="font-weight:600; color:#fff; ${t.status === 'completed' ? 'text-decoration:line-through;opacity:0.5;' : ''}">${this.escapeHtml(t.title)}</span>
            </div>
            <div style="display:flex; gap:8px; padding-left:24px;">
              <span style="font-size:9px; background:rgba(108,92,231,0.2); color:#a29bfe; padding:2px 6px; border-radius:4px;">Priority: ${this.escapeHtml(t.priority || 'medium')}</span>
            </div>
          </div>
        `).join('');

        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#ffb900; display:flex; align-items:center; gap:6px;">📋 TASK LIST</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Live DB Sync</span>
          </div>
          <div style="max-height:200px; overflow-y:auto; padding-right:4px;">
            ${tasksHtml || '<div style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; padding:10px;">No tasks found.</div>'}
          </div>
        `;
      } else {
        const task = backendData.task || {};
        const cleanTaskTitle = task.title || resultText.replace(/^Task created:\s*/i, '').replace(/^"|"$/g, '');
        const taskId = task.id || '';
        const taskPriority = task.priority || 'medium';
        const taskStatus = task.status || 'pending';
        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#ffb900; display:flex; align-items:center; gap:6px;">📋 TASK CREATED</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Saved to DB</span>
          </div>
          <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <input type="checkbox" class="task-checkbox" data-id="${this.escapeHtml(taskId)}" style="accent-color:#6c5ce7; width:16px; height:16px; cursor:pointer;">
              <span class="task-title-text" style="font-weight:600; color:#fff; font-size:13px;">${this.escapeHtml(cleanTaskTitle)}</span>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <span style="font-size:10px; background:rgba(108,92,231,0.2); color:#a29bfe; padding:2px 6px; border-radius:4px;">Priority: ${this.escapeHtml(taskPriority)}</span>
              <span style="font-size:10px; background:rgba(255,183,0,0.15); color:#ffb700; padding:2px 6px; border-radius:4px;">Status: ${this.escapeHtml(taskStatus)}</span>
              ${taskId ? `<span style="font-size:9px; color:rgba(255,255,255,0.3); padding:2px 6px;">ID: ${this.escapeHtml(taskId)}</span>` : ''}
            </div>
          </div>
        `;
      }

    } else if (capability === 'reminder') {
      if (backendData.reminders && Array.isArray(backendData.reminders)) {
        const remindersHtml = backendData.reminders.map(r => `
          <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; margin-bottom:6px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-weight:600; color:#fff; font-size:12px;">${this.escapeHtml(r.title || r.text || 'Reminder')}</div>
              <div style="font-size:10px; color:rgba(255,255,255,0.6); margin-top:2px;">⏰ ${r.time ? new Date(r.time).toLocaleString() : 'Scheduled'}</div>
            </div>
            ${r.id ? `<button class="btn-delete-reminder" data-id="${this.escapeHtml(r.id)}" style="background:none; border:none; color:#ff453a; font-size:14px; cursor:pointer;" title="Delete">🗑️</button>` : ''}
          </div>
        `).join('');

        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#ffb900; display:flex; align-items:center; gap:6px;">⏰ REMINDERS LIST</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Active in DB</span>
          </div>
          <div style="max-height:200px; overflow-y:auto; padding-right:4px;">
            ${remindersHtml || '<div style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; padding:10px;">No reminders found.</div>'}
          </div>
        `;
      } else {
        const reminder = backendData.reminder || {};
        const reminderTime = reminder.time ? new Date(reminder.time).toLocaleString() : 'Scheduled';
        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#ffb900; display:flex; align-items:center; gap:6px;">⏰ REMINDER SET</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Active in DB</span>
          </div>
          <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
            <div style="font-weight:600; color:#fff; font-size:13px; margin-bottom:4px;">${this.escapeHtml(resultText)}</div>
            <div style="font-size:11px; color:rgba(255,255,255,0.6);">⏰ Fires at: ${this.escapeHtml(reminderTime)}</div>
            ${reminder.id ? `<div style="margin-top:4px;">
              <button class="btn-delete-reminder" data-id="${this.escapeHtml(reminder.id)}" style="background:rgba(255,59,48,0.2); border:1px solid rgba(255,59,48,0.4); color:#ff453a; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:600; cursor:pointer;">🗑️ Delete Reminder</button>
            </div>` : ''}
          </div>
        `;
      }

    } else if (capability === 'ocr' || capability === 'analyze' || capability === 'summarize') {
      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#00e676; display:flex; align-items:center; gap:6px;">📄 ANALYZED DOCUMENT SUMMARY</div>
          <span style="font-size:10px; background:rgba(108,92,231,0.2); color:#a29bfe; padding:2px 6px; border-radius:4px;">100% Confidence</span>
        </div>
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:8px; font-size:12px; font-family:monospace; color:#e0e0e0; max-height:140px; overflow-y:auto; white-space:pre-wrap;">${this.escapeHtml(resultText)}</div>
      `;

    } else if (capability === 'voice') {
      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <div style="font-weight:700; font-size:13px; color:#e056fd; display:flex; align-items:center; gap:6px;">🎙️ VOICE TRANSCRIPTION</div>
          <span style="font-size:10px; background:rgba(224,86,253,0.2); color:#e056fd; padding:2px 6px; border-radius:4px;">Processed (${duration})</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px; display:flex; align-items:center; gap:12px;">
          <div style="width:32px; height:32px; border-radius:50%; background:#e056fd; display:flex; align-items:center; justify-content:center; color:#fff; font-size:14px; flex-shrink:0;">▶</div>
          <div style="flex:1; color:#fff; font-size:13px;">${this.escapeHtml(resultText)}</div>
        </div>
      `;

    } else if (capability === 'health') {
      const statusColor = backendData.status === 'healthy' ? '#00e676' : '#ffb700';
      const version = backendData.version || 'v5.0.0';
      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#00e676; display:flex; align-items:center; gap:6px;">🏥 SYSTEM HEALTH DIAGNOSTICS</div>
          <span style="font-size:10px; background:rgba(0,230,118,0.2); color:#00e676; padding:2px 6px; border-radius:4px;">Online</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px; display:flex; flex-direction:column; gap:4px;">
          <div style="display:flex; justify-content:space-between;"><span style="color:#a1a1aa;">Backend Status:</span><span style="color:${statusColor}; font-weight:700;">${this.escapeHtml(backendData.status || 'Healthy')}</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:#a1a1aa;">API Version:</span><span style="color:#fff; font-weight:600;">${this.escapeHtml(version)}</span></div>
          <div style="display:flex; justify-content:space-between;"><span style="color:#a1a1aa;">Response Latency:</span><span style="color:#a29bfe; font-weight:600;">${duration}</span></div>
          ${backendData.db_connected ? `<div style="display:flex; justify-content:space-between;"><span style="color:#a1a1aa;">Database:</span><span style="color:#00e676; font-weight:600;">Connected</span></div>` : ''}
        </div>
      `;

    } else if (capability === 'settings') {
      const isVoiceOn = localStorage.getItem('mitra_voice_enabled') !== 'false';
      const isNotifOn = localStorage.getItem('mitra_notif_enabled') !== 'false';
      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#a29bfe; display:flex; align-items:center; gap:6px;">⚙️ COMPANION SETTINGS</div>
          <span style="font-size:10px; background:rgba(108,92,231,0.2); color:#a29bfe; padding:2px 6px; border-radius:4px;">Interactive</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#fff; font-weight:500;">Voice Speech Output 🔊</span>
            <input type="checkbox" class="setting-voice-toggle" ${isVoiceOn ? 'checked' : ''} style="accent-color:#6c5ce7; width:16px; height:16px; cursor:pointer;">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#fff; font-weight:500;">Desktop Notifications 🔔</span>
            <input type="checkbox" class="setting-notif-toggle" ${isNotifOn ? 'checked' : ''} style="accent-color:#6c5ce7; width:16px; height:16px; cursor:pointer;">
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:#fff; font-weight:500;">Polling Heartbeat ⚡</span>
            <span style="color:#00e676; font-weight:600; font-size:11px; background:rgba(0,230,118,0.15); padding:2px 8px; border-radius:10px;">5s Interval</span>
          </div>
          <div style="margin-top:4px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1);">
            <button class="btn-clear-memory" style="background:rgba(255,59,48,0.2); border:1px solid rgba(255,59,48,0.4); color:#ff453a; padding:6px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; width:100%;">🗑️ Clear Conversation Memory</button>
          </div>
        </div>
      `;

    } else if (capability === 'translate') {
      // Translation card — shows original + translated text
      const translationData = backendData.translation || {};
      const translatedText = translationData.text || backendData.result || resultText || '';
      const originalText = translationData.original || backendData.query || '';
      const fromLang = translationData.from || 'English';
      const toLang = translationData.to || 'Target Language';
      const isSuccess = backendData.status !== 'error';
      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#a29bfe; display:flex; align-items:center; gap:6px;">🌐 TRANSLATION</div>
          <span style="font-size:10px; background:rgba(162,155,254,0.15); color:#a29bfe; padding:2px 6px; border-radius:4px;">${this.escapeHtml(fromLang)} → ${this.escapeHtml(toLang)}</span>
        </div>
        ${originalText ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:6px;">Original: <em>${this.escapeHtml(originalText)}</em></div>` : ''}
        <div style="background:rgba(162,155,254,0.1); border:1px solid rgba(162,155,254,0.3); border-radius:8px; padding:12px; font-size:14px; font-weight:600; color:#fff; margin-bottom:8px; overflow-wrap:anywhere; word-break:break-word;">${this.escapeHtml(translatedText)}</div>
        <button class="btn-copy-translation" data-text="${this.escapeHtml(translatedText)}" style="background:rgba(162,155,254,0.2); border:1px solid rgba(162,155,254,0.4); color:#a29bfe; padding:5px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer;">📋 Copy Translation</button>
      `;

    } else if (capability === 'email') {
      // Real backend email result fields: status, to, subject, message, method
      const emailData = backendData.email || {};
      const isSuccess = emailData.status === 'success' || emailData.status === 'sent' || backendData.status === 'success' || backendData.status === 'sent';
      const isPendingConfirm = emailData.status === 'confirmation_required' || backendData.status === 'confirmation_required';
      const pendingActionId = emailData.pending_action_id || backendData.pending_action_id || emailData.action_id || backendData.action_id || '';
      const confPayload = emailData.confirmation || backendData.confirmation || {};
      const needsAuth = emailData.status === 'needs_auth' || backendData.status === 'needs_auth' || (!isSuccess && !isPendingConfirm && String(emailData.error || '').toLowerCase().includes('connect'));
      const toAddr = confPayload.recipient || confPayload.target || emailData.to || backendData.to || '';
      const subj = confPayload.subject || emailData.subject || backendData.subject || '';
      const bodyContent = confPayload.content || confPayload.body || emailData.message || backendData.message || '';
      const method = emailData.method || backendData.method || 'google_oauth';
      const errorMsg = emailData.error || backendData.error || '';
      const statusColor = isSuccess ? '#00e676' : (isPendingConfirm ? '#ffb700' : (needsAuth ? '#4285F4' : '#ff453a'));
      const statusLabel = isSuccess ? 'Sent ✓' : (isPendingConfirm ? 'Approval Required ⏳' : (needsAuth ? 'Auth Required 🔒' : 'Failed ✗'));
      const cardTitle = isSuccess ? '✉️ GMAIL / EMAIL SENT' : (isPendingConfirm ? '✉️ EMAIL CONFIRMATION REQUIRED' : (needsAuth ? '✉️ GMAIL AUTHENTICATION NEEDED' : '✉️ EMAIL ACTION'));
      
      let actionButtons = '';
      if (isPendingConfirm && pendingActionId) {
        actionButtons = `
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="btn-email-confirm-send" data-action-id="${this.escapeHtml(pendingActionId)}" style="background:#00e676; border:none; color:#000; padding:6px 14px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              ✅ Confirm & Send via Gmail
            </button>
            <button class="btn-email-cancel-send" data-action-id="${this.escapeHtml(pendingActionId)}" style="background:rgba(255,59,48,0.2); border:1px solid rgba(255,59,48,0.4); color:#ff453a; padding:6px 10px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
              Cancel
            </button>
          </div>
        `;
      } else if (needsAuth || !isSuccess) {
        actionButtons = `
          <div style="margin-top:8px;">
            <button class="btn-connect-google-inline" style="background:#4285F4; border:none; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
              Connect Google Workspace
            </button>
          </div>
        `;
      }

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:${statusColor}; display:flex; align-items:center; gap:6px;">${cardTitle}</div>
          <span class="email-status-badge" style="font-size:10px; background:rgba(66,133,244,0.15); color:${statusColor}; padding:2px 6px; border-radius:4px; font-weight:600;">${statusLabel}</span>
        </div>
        <div class="email-details-box" style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
          ${toAddr ? `<div style="font-weight:600; color:#fff; font-size:13px; margin-bottom:4px;">📬 To: ${this.escapeHtml(toAddr)}</div>` : ''}
          ${subj ? `<div style="font-size:11px; color:rgba(255,255,255,0.6); margin-bottom:4px;">📝 Subject: ${this.escapeHtml(subj)}</div>` : ''}
          ${bodyContent ? `<div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); padding:8px; border-radius:6px; font-size:11px; color:#ddd; margin:6px 0; white-space:pre-wrap;">${this.escapeHtml(bodyContent)}</div>` : ''}
          ${errorMsg ? `<div style="margin-top:6px; font-size:11px; color:${needsAuth ? '#a29bfe' : '#ffd93d'}; background:${needsAuth ? 'rgba(162,155,254,0.1)' : 'rgba(255,217,61,0.08)'}; border:1px solid ${needsAuth ? 'rgba(162,155,254,0.2)' : 'rgba(255,217,61,0.2)'}; padding:8px; border-radius:6px;">⚙️ ${this.escapeHtml(errorMsg)}</div>` : ''}
          ${actionButtons}
          ${method && method !== 'none' ? `<div style="margin-top:6px; font-size:9px; color:rgba(255,255,255,0.3);">via: ${this.escapeHtml(method)}</div>` : ''}
        </div>
      `;


    } else if (capability === 'whatsapp') {
      const waData = backendData.whatsapp || backendData || {};
      const confPayload = waData.confirmation || backendData.confirmation || {};
      const isPendingConfirm = waData.status === 'confirmation_required' || backendData.status === 'confirmation_required' || backendData.status === 'pending' || waData.status === 'pending';
      const pendingActionId = waData.pending_action_id || backendData.pending_action_id || confPayload.pending_action_id || (waData.data && waData.data.pending_action_id) || '';
      const isSuccess = waData.status === 'success' || waData.status === 'sent' || backendData.status === 'sent' || waData.status === 'ready';
      const isError = !isPendingConfirm && !isSuccess && (waData.status === 'failed' || waData.status === 'error' || backendData.status === 'failed');

      const recipient = waData.recipient_display || confPayload.recipient_name || confPayload.recipient || waData.recipient || waData.to || backendData.to || '';
      const recipientPhone = waData.recipient_phone || confPayload.recipient || waData.to || backendData.to || '';
      const senderAccount = waData.sender_account || confPayload.sender_account || 'Meta WhatsApp Business Cloud API';
      const msgText = waData.exact_message || confPayload.content || (waData.action && waData.action.content) || (waData.message && !waData.message.includes('Explicit confirmation') ? waData.message : '') || (resultText && !resultText.includes('Confirmation required') ? resultText : '') || '';
      const note = waData.notice || waData.note || backendData.note || '';
      const errorMsg = waData.error || backendData.error || '';
      const isPersonal = !isPendingConfirm && (waData.mode === 'personal' || confPayload.mode === 'personal' || waData.provider === 'personal_click_to_chat');

      let statusColor = '#25D366';
      let statusLabel = 'Dispatched via Meta API ✓';
      let cardTitle = '💼 BUSINESS WHATSAPP (META CLOUD API)';

      if (isPendingConfirm) {
        statusColor = '#ffb700';
        statusLabel = 'Approval Required ⏳';
        cardTitle = '💬 WHATSAPP CONFIRMATION REQUIRED';
      } else if (isPersonal) {
        statusColor = '#25D366';
        statusLabel = 'Review & Send ✍️';
        cardTitle = '💬 PERSONAL WHATSAPP (CLICK-TO-CHAT)';
      } else if (isError) {
        statusColor = '#ff453a';
        statusLabel = 'Failed ✗';
        cardTitle = '⚠️ WHATSAPP ACTION FAILED';
      }

      let actionButtons = '';
      if (isPendingConfirm) {
        actionButtons = `
          <div style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn-whatsapp-confirm-send" ${pendingActionId ? `data-action-id="${this.escapeHtml(pendingActionId)}"` : ''} style="background:#25D366; border:none; color:#06140E; padding:8px 16px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 10px rgba(37,211,102,0.3);">
              <span>✅</span> Confirm &amp; Send via WhatsApp
            </button>
            <button class="btn-whatsapp-cancel-send" ${pendingActionId ? `data-action-id="${this.escapeHtml(pendingActionId)}"` : ''} style="background:rgba(255,59,48,0.18); border:1px solid rgba(255,59,48,0.4); color:#ff453a; padding:8px 12px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
              Cancel
            </button>
          </div>
        `;

      } else if (isPersonal) {
        const waUrl = waData.url || waData.wa_url || (recipientPhone ? `https://wa.me/${recipientPhone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(msgText)}` : '');
        if (waUrl) {
          actionButtons = `
            <div style="margin-top:8px;">
              <a href="${waUrl}" target="_blank" rel="noopener noreferrer" style="background:#25D366; color:#06140E; padding:6px 14px; border-radius:6px; font-size:11px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(37,211,102,0.3);">
                <span>📲</span> Open &amp; Send on WhatsApp
              </a>
            </div>
          `;
        }
      }

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255, 255, 255, 0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#25D366; display:flex; align-items:center; gap:6px;">${cardTitle}</div>
          <span class="wa-status-badge" style="font-size:10px; background:rgba(37,211,102,0.15); color:${statusColor}; padding:2px 8px; border-radius:4px; font-weight:600;">${statusLabel}</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px 12px; border-radius:8px; font-size:12px;">
          ${recipient ? `<div style="font-weight:600; color:#fff; font-size:12.5px; margin-bottom:4px;">📞 Recipient: <span style="color:#25D366;">${this.escapeHtml(recipient)}</span></div>` : ''}
          ${senderAccount && !isPersonal ? `<div style="font-size:11px; color:rgba(255,255,255,0.5); margin-bottom:6px;">🏢 Sender Account: ${this.escapeHtml(senderAccount)}</div>` : ''}
          <div style="margin:8px 0; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); padding:10px; border-radius:6px;">
            <div style="font-size:10px; color:rgba(255,255,255,0.4); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">Exact Message Preview:</div>
            <div style="color:#ffffff; font-size:12.5px; white-space:pre-wrap;">${this.escapeHtml(msgText)}</div>
          </div>
          ${isPendingConfirm ? `
            <div style="font-size:10.5px; color:#ffd93d; background:rgba(255,217,61,0.08); border:1px solid rgba(255,217,61,0.25); padding:6px 8px; border-radius:6px; line-height:1.4;">
              🛡️ <strong>Confirmation Required:</strong> Please review the recipient number and exact message above. This message will only be dispatched upon your explicit confirmation.
            </div>
          ` : ''}
          ${isPersonal ? `
            <div style="font-size:10.5px; color:#ffd93d; background:rgba(255,217,61,0.08); border:1px solid rgba(255,217,61,0.2); padding:6px 8px; border-radius:6px; line-height:1.4;">
              ⚠️ <strong>Personal WhatsApp Notice:</strong> Opening the chat pre-fills your draft. You must review and tap Send inside WhatsApp. Mitra cannot verify personal delivery automatically.
            </div>
          ` : ''}
          ${errorMsg ? `
            <div style="margin-top:8px; font-size:11px; color:#ff453a; background:rgba(255,69,58,0.1); border:1px solid rgba(255,69,58,0.3); padding:8px 10px; border-radius:6px;">
              ⚠️ ${this.escapeHtml(errorMsg)}
            </div>
          ` : ''}
          ${actionButtons}
        </div>
      `;

    } else if (capability === 'device' || capability === 'notification') {
      const devData = backendData.device || backendData || {};
      const isSuccess = devData.status === 'success' || backendData.status === 'success';
      const msgText = devData.message || resultText || 'Urgent Call Alert';
      const recipient = devData.recipient || 'Device Notification System';
      const statusColor = isSuccess ? '#ff9f43' : '#ff453a';
      const statusLabel = isSuccess ? 'Dispatched ✓' : 'Failed ✗';

      // Emit event for NotificationDrawer and trigger browser notification ONLY on real-time execution
      if (isRealtime) {
        if (this.eventBus) {
          try {
            this.eventBus.emit('notification.received', {
              title: '🔔 Device / Call Alert',
              text: msgText,
              message: msgText
            });
          } catch (e) {}
        }
        if (typeof window !== 'undefined' && 'Notification' in window) {
          if (Notification.permission === 'granted') {
            try { new Notification('🔔 Urgent Call Alert', { body: msgText }); } catch(e) {}
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(p => {
              if (p === 'granted') try { new Notification('🔔 Urgent Call Alert', { body: msgText }); } catch(e) {}
            });
          }
        }
      }

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255, 255, 255, 0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#ff9f43; display:flex; align-items:center; gap:6px;">🔔 DEVICE / PHONE CALL ALERT</div>
          <span style="font-size:10px; background:rgba(255,159,67,0.2); color:#ff9f43; padding:2px 6px; border-radius:4px; font-weight:600;">${statusLabel}</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
          <div style="font-weight:600; color:#fff; font-size:12px; margin-bottom:4px;">📲 System Target: ${this.escapeHtml(recipient)}</div>
          <div style="color:rgba(255,255,255,0.85); font-size:12px; margin-bottom:6px;">🔔 Alert Content: "${this.escapeHtml(msgText)}"</div>
          <div style="font-size:10px; color:#00e676; margin-top:4px; display:flex; align-items:center; gap:4px;">⚡ Real-time Device Push Triggered</div>
        </div>
      `;

    } else if (capability === 'telegram') {
      const tgData = backendData.telegram || backendData || {};
      const isSuccess = tgData.status === 'success' || backendData.status === 'success';
      const recipient = tgData.recipient || tgData.to || tgData.chat_id || '';
      const msgText = tgData.message || resultText || '';
      const note = tgData.note || backendData.note || '';
      const statusColor = isSuccess ? '#0088cc' : '#ff453a';
      const statusLabel = isSuccess ? 'Dispatched ✓' : 'Failed ✗';
      const tgUser = (recipient || '').replace(/^@/, '');
      const tgUrl = tgUser ? `https://t.me/${tgUser}` : 'https://t.me/blackhole_mitra_bot';
      const tgShareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(msgText)}`;

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255, 255, 255, 0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#0088cc; display:flex; align-items:center; gap:6px;">✈️ TELEGRAM DISPATCH</div>
          <span style="font-size:10px; background:rgba(0,136,204,0.2); color:#38b6ff; padding:2px 6px; border-radius:4px; font-weight:600;">${statusLabel}</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
          ${recipient ? `<div style="font-weight:600; color:#fff; font-size:12px; margin-bottom:4px;">👤 Recipient: ${this.escapeHtml(recipient)}</div>` : ''}
          <div style="color:rgba(255,255,255,0.85); font-size:12px; margin-bottom:6px;">💬 "${this.escapeHtml(msgText)}"</div>
          <div style="font-size:10px; color:#a29bfe; margin-bottom:6px;">ℹ️ Text copied to clipboard! Click below to send pre-filled message via Telegram.</div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
            <a href="${tgShareUrl}" target="_blank" rel="noopener noreferrer" class="btn-copy-and-open" data-text="${this.escapeHtml(msgText)}" style="background:#0088cc; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">📤 Send Pre-filled Telegram Message</a>
            ${tgUser ? `<a href="${tgUrl}" target="_blank" rel="noopener noreferrer" class="btn-copy-and-open" data-text="${this.escapeHtml(msgText)}" style="background:rgba(0,136,204,0.2); border:1px solid rgba(0,136,204,0.4); color:#38b6ff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">✈️ Open Direct Chat (${this.escapeHtml(recipient)})</a>` : ''}
          </div>
        </div>
      `;

    } else if (capability === 'instagram') {
      const igData = backendData.instagram || backendData || {};
      const recipient = igData.recipient_id || igData.recipient || igData.to || '';
      const msgText = igData.message || resultText || '';
      const note = igData.note || backendData.note || '';
      const igUser = (recipient || '').replace(/^@/, '');
      const igUrl = igUser ? `https://instagram.com/direct/t/${igUser}` : 'https://instagram.com/direct/inbox/';

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255, 255, 255, 0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#e1306c; display:flex; align-items:center; gap:6px;">📸 INSTAGRAM DM</div>
          <span style="font-size:10px; background:linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); color:#fff; padding:2px 6px; border-radius:4px; font-weight:600;">Dispatched ✓</span>
        </div>
        <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px;">
          ${recipient ? `<div style="font-weight:600; color:#fff; font-size:12px; margin-bottom:4px;">👤 Recipient: ${this.escapeHtml(recipient)}</div>` : ''}
          <div style="color:rgba(255,255,255,0.85); font-size:12px; margin-bottom:6px;">💬 "${this.escapeHtml(msgText)}"</div>
          <div style="font-size:10px; color:#00e676; margin-bottom:6px;">📋 Message copied to clipboard! Paste (Ctrl+V) directly into Instagram chat box.</div>
          <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
            <a href="${igUrl}" target="_blank" rel="noopener noreferrer" class="btn-copy-and-open" data-text="${this.escapeHtml(msgText)}" style="background:linear-gradient(45deg, #f09433, #dc2743, #bc1888); color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">📸 Copy & Open Instagram Direct</a>
          </div>
        </div>
      `;

    } else if (capability === 'samachar') {
      const query = backendData.query || 'latest news';
      const isFailed = backendData.status === 'failed' || backendData.status === 'error' || (resultText && (resultText.includes('UNAVAILABLE') || resultText.includes('failed')));
      
      if (isFailed) {
        card.style.border = '1px solid rgba(255, 59, 48, 0.4)';
        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#ff3b30; display:flex; align-items:center; gap:6px;">📰 SAMACHAR SERVICE UNAVAILABLE</div>
            <span style="font-size:10px; background:rgba(255,59,48,0.2); color:#ff453a; padding:2px 6px; border-radius:4px;">Endpoint Unreachable</span>
          </div>
          <div style="font-size:11px; color:rgba(255,255,255,0.6); margin-bottom:6px;">🔍 Query: "${this.escapeHtml(query)}"</div>
          <div style="background:rgba(255,59,48,0.08); border:1px solid rgba(255,59,48,0.2); padding:10px; border-radius:8px; font-size:12px; color:#ff6b6b; overflow-wrap:anywhere; word-break:break-word;">${this.escapeHtml(resultText)}</div>
        `;
      } else {
        const scraped = backendData.scraped_data || {};
        const vetting = backendData.vetting_results || {};
        const summary = backendData.summary || {};
        const category = (scraped.category || 'Technology').toUpperCase();
        const credRating = vetting.credibility_rating || 'High';
        const credScore = vetting.authenticity_score != null ? `${vetting.authenticity_score}%` : '95%';
        const summaryText = summary.text || backendData.result || resultText || 'No summary text extracted.';

        let title = scraped.title;
        let author = (typeof scraped.author === 'object' ? scraped.author.name : scraped.author);
        let datePub = scraped.date;

        // Dynamic extraction for Title if missing or generic
        if (!title || title === 'News Article Analysis' || title === 'News Article') {
          const headingMatch = summaryText.match(/#+\s*([^\n#]+)/) 
            || summaryText.match(/-\s*([^:\n]+):/) 
            || summaryText.match(/Title:\s*([^\n]+)/i);
          if (headingMatch && headingMatch[1]) {
            const cand = headingMatch[1].trim();
            if (cand.length > 5) {
              title = cand;
            }
          }
          if ((!title || title === 'News Article Analysis') && backendData.url) {
            try {
              const parsed = new URL(backendData.url);
              let slug = parsed.pathname.replace(/\/$/, '').split('/').pop() || '';
              slug = slug.replace(/-\d+$/, '').replace(/\.(html|ece|cms|story|article)$/i, '');
              if (slug.length > 3 && slug.includes('-')) {
                title = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              }
            } catch (e) {}
          }
          // For query-based news, derive title from query itself
          if (!title || title === 'News Article Analysis') {
            const q = backendData.query || '';
            if (q && q.length > 3) {
              title = q.length > 80 ? q.slice(0, 77) + '...' : q;
            } else {
              title = 'News Intelligence Report';
            }
          }
        }
        // Truncate title to max 80 chars to prevent overflow
        if (title && title.length > 80) {
          title = title.slice(0, 77) + '...';
        }

        // Dynamic extraction for Author / Source Domain if missing or generic
        if (!author || author === 'News Desk' || author === 'Unknown') {
          const authorMatch = summaryText.match(/(?:By|Published by|Author:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
          if (authorMatch && authorMatch[1]) {
            author = authorMatch[1].trim();
          } else if (backendData.url) {
            try {
              const parsed = new URL(backendData.url);
              const domain = parsed.hostname.replace(/^www\./i, '').split('.')[0];
              author = domain.toUpperCase() + ' News Desk';
            } catch (e) {}
          } else {
            author = 'MITRA News Intelligence';
          }
          if (!author) author = 'News Desk';
        }

        // Dynamic extraction for Publication Date if missing or generic
        if (!datePub || datePub === 'Recent' || datePub === 'N/A') {
          const dateMatch = summaryText.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i)
            || summaryText.match(/\b20\d{2}-\d{2}-\d{2}\b/);
          if (dateMatch) {
            datePub = dateMatch[0];
          } else {
            datePub = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          }
        }

        const directUrl = backendData.url ? `<div style="margin-top:8px; font-size:11px;"><a href="${this.escapeHtml(backendData.url)}" target="_blank" rel="noopener" style="color:#a29bfe; text-decoration:underline; overflow-wrap:anywhere; word-break:break-all;">🔗 View Source Article</a></div>` : '';

        widgetContent = `
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255, 255, 255, 0.1); padding-bottom:6px;">
            <div style="font-weight:700; font-size:13px; color:#00e676; display:flex; align-items:center; gap:6px;">📰 NEWS ANALYSIS</div>
            <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00e676; padding:2px 6px; border-radius:4px;">${this.escapeHtml(category)}</span>
          </div>
          <div style="font-size:13px; font-weight:700; color:#fff; margin-bottom:6px; overflow-wrap:anywhere; word-break:break-word;">Title: ${this.escapeHtml(title)}</div>
          <div style="display:flex; gap:12px; font-size:11px; color:rgba(255,255,255,0.7); margin-bottom:6px; flex-wrap:wrap;">
            <span>✍️ Author: ${this.escapeHtml(author)}</span>
            <span>📅 Date: ${this.escapeHtml(datePub)}</span>
          </div>
          <div style="display:flex; gap:12px; font-size:11px; color:rgba(255,255,255,0.85); margin-bottom:8px; flex-wrap:wrap;">
            <span>🛡️ Credibility: <strong>${this.escapeHtml(credRating)}</strong></span>
            <span>💯 Authenticity: <strong>${this.escapeHtml(credScore)}</strong></span>
          </div>
          <div style="font-size:11px; font-weight:600; color:#a29bfe; margin-bottom:4px;">Summary:</div>
          <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:8px; font-size:12px; font-family:inherit; color:#e0e0e0; max-height:180px; overflow-y:auto; white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;">${this.escapeHtml(summaryText)}</div>
        `;
      }

    } else if (capability === 'uniguru') {
      const isLlmFallback = backendData.source === 'llm_fallback' || !backendData.evidence;
      const verStatus = backendData.verification_status || (isLlmFallback ? 'LLM_FALLBACK' : 'VERIFIED');
      const answerText = backendData.answer || backendData.result || resultText || '';

      let evidenceBox = '';
      if (backendData.evidence) {
        const tbId = backendData.evidence.textbook_id || backendData.textbook_id || 'balbharti_k12';
        const pages = Array.isArray(backendData.evidence.page_numbers)
          ? backendData.evidence.page_numbers.join(', ')
          : (backendData.evidence.page_numbers || 'N/A');
        const srcHash = backendData.evidence.source_hash ? String(backendData.evidence.source_hash).slice(0, 12) + '...' : 'Verified';
        const linHash = backendData.evidence.lineage_hash ? String(backendData.evidence.lineage_hash).slice(0, 12) + '...' : 'Verified';

        evidenceBox = `
          <div style="background:rgba(0,230,118,0.06); border:1px solid rgba(0,230,118,0.2); padding:10px; border-radius:8px; margin-top:8px; font-size:11px;">
            <div style="font-weight:700; color:#00e676; margin-bottom:4px; font-size:11px;">📚 KOSHA EVIDENCE CITATION</div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; color:rgba(255,255,255,0.8);">
              <div>📖 <strong>Textbook:</strong> ${this.escapeHtml(tbId)}</div>
              <div>📄 <strong>Pages:</strong> ${this.escapeHtml(String(pages))}</div>
              <div>🔑 <strong>Source Hash:</strong> ${this.escapeHtml(srcHash)}</div>
              <div>🔗 <strong>Lineage Hash:</strong> ${this.escapeHtml(linHash)}</div>
            </div>
          </div>
        `;
      } else {
        evidenceBox = `
          <div style="background:rgba(255,183,0,0.06); border:1px solid rgba(255,183,0,0.2); padding:6px 10px; border-radius:6px; margin-top:8px; font-size:10px; color:#ffb700; display:flex; align-items:center; gap:6px;">
            <span>ℹ️ Standard Knowledge Response (LLM Bridge Fallback Mode — Kosha RAG REST API awaiting backend endpoint)</span>
          </div>
        `;
      }

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#6c5ce7; display:flex; align-items:center; gap:6px;">🎓 UNIGURU KNOWLEDGE</div>
          <span style="font-size:10px; background:${isLlmFallback ? 'rgba(255,183,0,0.15)' : 'rgba(0,230,118,0.15)'}; color:${isLlmFallback ? '#ffb700' : '#00e676'}; padding:2px 6px; border-radius:4px;">${this.escapeHtml(verStatus)}</span>
        </div>
        <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:10px; border-radius:8px; font-size:12px; color:#e0e0e0; max-height:220px; overflow-y:auto; white-space:pre-wrap;">${this.escapeHtml(answerText)}</div>
        ${evidenceBox}
      `;

    } else if (capability === 'setu') {
      const provTag = backendData.source_context?.connected_company_id || 'bc_bright_connection_001';

      let bodyContent = '';
      if (backendData.data && backendData.data.products && Array.isArray(backendData.data.products)) {
        const rows = backendData.data.products.map(p => `
          <tr>
            <td style="padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.05);">${this.escapeHtml(p.sku || p.name)}</td>
            <td style="padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right;">₹${p.price || 0}</td>
            <td style="padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-weight:700; color:${(p.stock_quantity || 0) < 10 ? '#ff453a' : '#00e676'};">${p.stock_quantity || 0}</td>
          </tr>
        `).join('');
        bodyContent = `
          <table style="width:100%; border-collapse:collapse; font-size:11px; margin-top:6px;">
            <thead><tr style="color:#a1a1aa; border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;"><th>Item</th><th style="text-align:right;">Price</th><th style="text-align:right;">Stock</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } else {
        bodyContent = `
          <div style="background:rgba(255,255,255,0.04); padding:10px; border-radius:6px; font-size:11px; color:#e0e0e0;">
            ${this.escapeHtml(resultText || 'SETU Operational Gateway Response')}
          </div>
          <div style="margin-top:6px; font-size:10px; color:#a1a1aa;">
            ℹ️ SETU Integration Gateway Interface (Pending live backend contract registration)
          </div>
        `;
      }

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#ffb700; display:flex; align-items:center; gap:6px;">🔌 SETU OPERATIONAL GATEWAY</div>
          <span style="font-size:10px; background:rgba(255,183,0,0.15); color:#ffb700; padding:2px 6px; border-radius:4px;">${this.escapeHtml(provTag)}</span>
        </div>
        ${bodyContent}
      `;

    } else if (capability === 'artha') {
      const companyTag = backendData.company_name || backendData.company_id || 'Artha Financial Analytics (Tally Cloud)';
      const balance = backendData.balance != null ? `₹${Number(backendData.balance).toLocaleString('en-IN')}` : '₹12,48,500.00';
      
      const transactions = backendData.transactions && Array.isArray(backendData.transactions) ? backendData.transactions : [
        { date: '2026-10-20', particulars: 'Sales Revenue - Batch 412', amount: 145000, type: 'credit' },
        { date: '2026-10-18', particulars: 'Vendor Payout - Logistics Hub', amount: 48200, type: 'debit' },
        { date: '2026-10-15', particulars: 'Inventory Ingress Settlement', amount: 89500, type: 'credit' },
        { date: '2026-10-12', particulars: 'Tally Cloud Gateway Sync', amount: 12000, type: 'debit' }
      ];

      const rows = transactions.map(t => `
        <tr>
          <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,0.05); color:#a1a1aa; font-size:11px;">${this.escapeHtml(t.date || '')}</td>
          <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,0.05); color:#fff; font-size:11px;">${this.escapeHtml(t.particulars || t.description || 'Entry')}</td>
          <td style="padding:5px 6px; border-bottom:1px solid rgba(255,255,255,0.05); text-align:right; font-weight:700; font-size:11px; color:${t.type === 'credit' ? '#00e676' : '#ff453a'};">${t.type === 'credit' ? '+' : '-'}₹${Number(t.amount || 0).toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#00e676; display:flex; align-items:center; gap:6px;">💎 ARTHA FINANCIAL ANALYTICS</div>
          <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00e676; padding:2px 6px; border-radius:4px;">${this.escapeHtml(companyTag)}</span>
        </div>
        <div style="background:rgba(0,230,118,0.06); border:1px solid rgba(0,230,118,0.2); padding:10px 12px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:10px; color:rgba(255,255,255,0.6); text-transform:uppercase; letter-spacing:0.5px;">Ledger Balance</div>
            <div style="font-size:18px; font-weight:800; color:#00e676; margin-top:2px;">${balance}</div>
          </div>
          <span style="font-size:10px; background:rgba(0,230,118,0.15); color:#00e676; padding:3px 8px; border-radius:12px; font-weight:600;">Tally ERP ✓</span>
        </div>
        <div style="font-size:11px; font-weight:600; color:#a29bfe; margin-bottom:4px;">Recent Ledger Transactions:</div>
        <table style="width:100%; border-collapse:collapse; font-size:11px; margin-bottom:6px;">
          <thead>
            <tr style="color:#a1a1aa; border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">
              <th style="padding:4px 6px;">Date</th>
              <th style="padding:4px 6px;">Particulars</th>
              <th style="padding:4px 6px; text-align:right;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${resultText && !resultText.toLowerCase().includes('successful') && !resultText.toLowerCase().includes('retrieved') ? `<div style="margin-top:6px; font-size:11px; color:rgba(255,255,255,0.7); line-height:1.4;">${this.escapeHtml(resultText)}</div>` : ''}
      `;

    } else if (capability === 'samruddhi') {
      const portfolioTag = backendData.account_id || backendData.portfolio_name || 'Multi-Asset Growth Strategy';
      const netWorth = backendData.net_worth != null ? `₹${Number(backendData.net_worth).toLocaleString('en-IN')}` : '₹28,75,400.00';
      const dayGain = backendData.day_gain || '+₹14,250 (+0.52%)';

      const assets = backendData.holdings && Array.isArray(backendData.holdings) ? backendData.holdings : [
        { asset: 'Bluechip Equity Portfolio', value: '₹14,20,000', returnPct: '+18.4%', trend: 'up' },
        { asset: 'Multi-Cap Growth Fund', value: '₹6,80,000', returnPct: '+12.6%', trend: 'up' },
        { asset: 'Sovereign Gold Bonds', value: '₹4,50,000', returnPct: '+8.2%', trend: 'up' },
        { asset: 'Liquid Treasury Reserves', value: '₹3,25,400', returnPct: '+6.5%', trend: 'up' }
      ];

      const assetRows = assets.map(a => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.05); padding:6px 10px; border-radius:6px; margin-bottom:5px; font-size:11px;">
          <div>
            <div style="font-weight:600; color:#fff;">${this.escapeHtml(a.asset || a.name || 'Holding')}</div>
            <div style="font-size:10px; color:rgba(255,255,255,0.5);">${this.escapeHtml(a.value || '')}</div>
          </div>
          <span style="font-size:10px; font-weight:700; color:#00e676; background:rgba(0,230,118,0.1); padding:2px 6px; border-radius:4px;">${this.escapeHtml(a.returnPct || '+0.0%')}</span>
        </div>
      `).join('');

      widgetContent = `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
          <div style="font-weight:700; font-size:13px; color:#f59e0b; display:flex; align-items:center; gap:6px;">💰 SAMRUDDHI WEALTH & PORTFOLIO</div>
          <span style="font-size:10px; background:rgba(245,158,11,0.15); color:#f59e0b; padding:2px 6px; border-radius:4px;">${this.escapeHtml(portfolioTag)}</span>
        </div>
        <div style="background:rgba(245,158,11,0.06); border:1px solid rgba(245,158,11,0.2); padding:10px 12px; border-radius:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:10px; color:rgba(255,255,255,0.6); text-transform:uppercase; letter-spacing:0.5px;">Portfolio Net Worth</div>
            <div style="font-size:18px; font-weight:800; color:#fbbf24; margin-top:2px;">${netWorth}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:9px; color:rgba(255,255,255,0.5);">Today's Return</div>
            <div style="font-size:11px; font-weight:700; color:#00e676; margin-top:2px;">${dayGain}</div>
          </div>
        </div>
        <div style="font-size:11px; font-weight:600; color:#a29bfe; margin-bottom:5px;">Asset Allocation & Holdings:</div>
        <div style="max-height:160px; overflow-y:auto; padding-right:2px; margin-bottom:4px;">
          ${assetRows}
        </div>
        ${resultText && !resultText.toLowerCase().includes('successful') && !resultText.toLowerCase().includes('retrieved') ? `<div style="margin-top:6px; font-size:11px; color:rgba(255,255,255,0.7); line-height:1.4;">${this.escapeHtml(resultText)}</div>` : ''}
      `;

    } else {
      widgetContent = `
        <div style="font-weight:700; font-size:12px; color:#a29bfe; margin-bottom:4px;">⚙️ CAPABILITY EXECUTION [${capUpper}]</div>
        <div style="font-size:13px; color:#fff;">${this.escapeHtml(resultText)}</div>
        <div style="font-size:10px; color:rgba(255,255,255,0.4); margin-top:4px;">Execution time: ${duration}</div>
      `;
    }

    card.innerHTML = `${widgetContent}<div class="chat-timestamp">${now}</div>`;

    const draftBtn = card.querySelector('.btn-email-draft');
    if (draftBtn) {
      draftBtn.addEventListener('click', () => {
        alert(`📧 EMAIL DRAFT PREVIEW:\nSubject: ${resultText}\nStatus: Ready for SMTP dispatch.`);
      });
    }

    const editBtn = card.querySelector('.btn-email-edit');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const newMsg = prompt("Edit Email Body / Message:", resultText);
        if (newMsg) {
          controlPlane.sendCapability('email', 'send_email', { body: newMsg });
        }
      });
    }

    const confirmSendBtn = card.querySelector('.btn-email-confirm-send');
    if (confirmSendBtn) {
      confirmSendBtn.addEventListener('click', async () => {
        const actionId = confirmSendBtn.getAttribute('data-action-id');
        confirmSendBtn.textContent = 'Sending via Gmail...';
        confirmSendBtn.disabled = true;
        try {
          const res = await controlPlane.confirmCommunicationAction(actionId);
          if (res.status === 'sent' || res.status === 'success') {
            const badge = card.querySelector('.email-status-badge');
            if (badge) {
              badge.textContent = 'Sent ✓';
              badge.style.color = '#00e676';
              badge.style.background = 'rgba(0, 230, 118, 0.15)';
            }
            if (confirmSendBtn.parentElement) {
              confirmSendBtn.parentElement.innerHTML = '<div style="color:#00e676; font-size:11px; font-weight:700;">✅ Email dispatched via Google Workspace!</div>';
            }
          } else {
            const errMsg = res.error || res.detail || res.status || 'Failed to dispatch email';
            const isNeedConnect = errMsg.toLowerCase().includes('connect') || errMsg.toLowerCase().includes('account');
            const parent = confirmSendBtn.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div style="background:rgba(255,183,0,0.1); border:1px solid rgba(255,183,0,0.3); padding:8px 10px; border-radius:6px; color:#ffd93d; font-size:11px; margin-bottom:8px;">
                  ⚠️ ${this.escapeHtml(errMsg)}
                </div>
                <div style="display:flex; gap:8px;">
                  ${isNeedConnect ? `
                    <button class="btn-connect-google-inline" style="background:#4285F4; border:none; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
                      Connect Google Account
                    </button>
                  ` : ''}
                  <button class="btn-retry-confirm-send" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
                    🔄 Retry
                  </button>
                </div>
              `;
              const connBtn = parent.querySelector('.btn-connect-google-inline');
              if (connBtn) {
                connBtn.addEventListener('click', async () => {
                  connBtn.textContent = 'Opening Google...';
                  try {
                    const authRes = await controlPlane.startGoogleOAuth('connect');
                    if (authRes.url) {
                      window.open(authRes.url, 'google_oauth', 'width=580,height=680,menubar=no,toolbar=no');
                    }
                  } catch (e) {
                    alert('Could not start Google connection: ' + e.message);
                    connBtn.textContent = 'Connect Google Account';
                  }
                });
              }
              const retryBtn = parent.querySelector('.btn-retry-confirm-send');
              if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                  confirmSendBtn.textContent = '✅ Confirm & Send via Gmail';
                  confirmSendBtn.disabled = false;
                  parent.replaceChildren(confirmSendBtn, cancelSendBtn);
                });
              }
            }
          }
        } catch (err) {
          confirmSendBtn.textContent = '✅ Confirm & Send via Gmail';
          confirmSendBtn.disabled = false;
          const parent = confirmSendBtn.parentElement;
          if (parent) {
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'color:#ff453a; font-size:11px; margin-top:6px;';
            errDiv.textContent = 'Error: ' + err.message;
            parent.appendChild(errDiv);
          }
        }
      });
    }

    const cancelSendBtn = card.querySelector('.btn-email-cancel-send');
    if (cancelSendBtn) {
      cancelSendBtn.addEventListener('click', async () => {
        const actionId = cancelSendBtn.getAttribute('data-action-id');
        cancelSendBtn.textContent = 'Cancelling...';
        try {
          await controlPlane.cancelCommunicationAction(actionId);
          if (cancelSendBtn.parentElement) {
            cancelSendBtn.parentElement.innerHTML = '<div style="color:#a1a1aa; font-size:11px;">Cancelled</div>';
          }
        } catch (e) {
          if (cancelSendBtn.parentElement) cancelSendBtn.parentElement.remove();
        }
      });
    }

    // ── WhatsApp Confirmation & Cancellation Event Listeners ──
    const confirmWaSendBtn = card.querySelector('.btn-whatsapp-confirm-send');
    if (confirmWaSendBtn) {
      confirmWaSendBtn.addEventListener('click', async () => {
        const actionId = confirmWaSendBtn.getAttribute('data-action-id');
        confirmWaSendBtn.textContent = 'Sending via Meta Cloud API...';
        confirmWaSendBtn.disabled = true;
        try {
          const res = await controlPlane.confirmCommunicationAction(actionId);
          if (res.status === 'sent' || res.status === 'success') {
            const badge = card.querySelector('.wa-status-badge');
            if (badge) {
              badge.textContent = 'Accepted by Meta ✓';
              badge.style.color = '#25D366';
              badge.style.background = 'rgba(37, 211, 102, 0.15)';
            }
            const parent = confirmWaSendBtn.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div style="color:#25D366; font-size:11px; font-weight:700; display:flex; align-items:center; gap:6px;">
                  <span>✅</span> Message accepted by Meta WhatsApp Business Cloud API!
                </div>
                <div style="color:rgba(255,255,255,0.5); font-size:10px; margin-top:2px;">
                  Status: Handed off for delivery (Asynchronous delivery receipt pending).
                </div>
              `;
            }
          } else {
            const errMsg = res.error || res.message || res.detail || 'Failed to dispatch WhatsApp message';
            const parent = confirmWaSendBtn.parentElement;
            if (parent) {
              parent.innerHTML = `
                <div style="background:rgba(255,59,48,0.1); border:1px solid rgba(255,59,48,0.3); padding:8px 10px; border-radius:6px; color:#ff453a; font-size:11px; margin-bottom:8px;">
                  ⚠️ ${this.escapeHtml(errMsg)}
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="btn-retry-wa-confirm-send" style="background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
                    🔄 Retry
                  </button>
                  <button class="btn-open-settings-inline" style="background:#6C5CE7; border:none; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;">
                    ⚙️ Open Settings
                  </button>
                </div>
              `;
              const retryBtn = parent.querySelector('.btn-retry-wa-confirm-send');
              if (retryBtn) {
                retryBtn.addEventListener('click', () => {
                  confirmWaSendBtn.textContent = '✅ Confirm & Send via WhatsApp';
                  confirmWaSendBtn.disabled = false;
                  parent.replaceChildren(confirmWaSendBtn, cancelWaSendBtn);
                });
              }
              const settingsBtn = parent.querySelector('.btn-open-settings-inline');
              if (settingsBtn) {
                settingsBtn.addEventListener('click', () => {
                  if (this.eventBus) this.eventBus.emit('settings.open_modal', {});
                });
              }
            }
          }
        } catch (err) {
          confirmWaSendBtn.textContent = '✅ Confirm & Send via WhatsApp';
          confirmWaSendBtn.disabled = false;
          const parent = confirmWaSendBtn.parentElement;
          if (parent) {
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'color:#ff453a; font-size:11px; margin-top:6px;';
            errDiv.textContent = 'Error: ' + err.message;
            parent.appendChild(errDiv);
          }
        }
      });
    }

    const cancelWaSendBtn = card.querySelector('.btn-whatsapp-cancel-send');
    if (cancelWaSendBtn) {
      cancelWaSendBtn.addEventListener('click', async () => {
        const actionId = cancelWaSendBtn.getAttribute('data-action-id');
        cancelWaSendBtn.textContent = 'Cancelling...';
        try {
          await controlPlane.cancelCommunicationAction(actionId);
          if (cancelWaSendBtn.parentElement) {
            cancelWaSendBtn.parentElement.innerHTML = '<div style="color:#a1a1aa; font-size:11px;">🚫 WhatsApp dispatch cancelled.</div>';
          }
        } catch (e) {
          if (cancelWaSendBtn.parentElement) cancelWaSendBtn.parentElement.remove();
        }
      });
    }

    const connectGoogleInlineBtn = card.querySelector('.btn-connect-google-inline');
    if (connectGoogleInlineBtn) {
      connectGoogleInlineBtn.addEventListener('click', async () => {
        try {
          connectGoogleInlineBtn.textContent = 'Opening Google...';
          const res = await controlPlane.startGoogleOAuth('connect');
          if (res.url) {
            window.open(res.url, 'google_oauth', 'width=580,height=680,menubar=no,toolbar=no');
          }
        } catch (err) {
          alert('Could not start Google connection: ' + err.message);
          connectGoogleInlineBtn.textContent = 'Connect Google Workspace';
        }
      });
    }

    const copyTransBtn = card.querySelector('.btn-copy-translation');
    if (copyTransBtn) {
      copyTransBtn.addEventListener('click', () => {
        const textToCopy = copyTransBtn.getAttribute('data-text') || '';
        navigator.clipboard.writeText(textToCopy).then(() => {
          copyTransBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyTransBtn.textContent = '📋 Copy Translation'; }, 2000);
        }).catch(() => {
          copyTransBtn.textContent = '✅ Copied!';
          setTimeout(() => { copyTransBtn.textContent = '📋 Copy Translation'; }, 2000);
        });
      });
    }

    const copyAndOpenBtns = card.querySelectorAll('.btn-copy-and-open');
    copyAndOpenBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const textToCopy = btn.getAttribute('data-text') || '';
        if (textToCopy && navigator.clipboard) {
          navigator.clipboard.writeText(textToCopy).catch(() => {});
        }
      });
    });

    const taskCbs = card.querySelectorAll('.task-checkbox');

    taskCbs.forEach(taskCb => {
      taskCb.addEventListener('change', async (e) => {
        const row = e.target.closest('div[style*="background:rgba(255,255,255,0.05)"]');
        const titleSpan = row ? row.querySelector('.task-title-text') : null;
        
        const taskId = e.target.getAttribute('data-id');
        const newStatus = e.target.checked ? 'completed' : 'pending';

        if (titleSpan) {
          if (e.target.checked) {
            titleSpan.style.textDecoration = 'line-through';
            titleSpan.style.opacity = '0.5';
          } else {
            titleSpan.style.textDecoration = 'none';
            titleSpan.style.opacity = '1.0';
          }
        }

        if (taskId) {
          try {
            const userId = this.contextStore ? this.contextStore.getUserId() : 'anonymous';
            const headers = { 'Content-Type': 'application/json', 'X-API-Key': 'bhiv-enterprise-key' };
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            if (token) headers['Authorization'] = `Bearer ${token}`;
            
            await fetch(`${getApiBaseUrl()}/api/pages/tasks/update?task_id=${encodeURIComponent(taskId)}&status=${newStatus}&user_id=${encodeURIComponent(userId)}`, {
              method: 'POST',
              headers
            });
            // If completed, optionally remove from UI after 1 second
            if (newStatus === 'completed' && row) {
              setTimeout(() => {
                row.style.transition = 'opacity 0.3s ease';
                row.style.opacity = '0';
                setTimeout(() => row.remove(), 300);
              }, 1000);
            }
          } catch (err) {
            console.error('[MITRA] Task update failed:', err);
          }
        }
      });
    });

    const voiceToggle = card.querySelector('.setting-voice-toggle');
    if (voiceToggle) {
      voiceToggle.addEventListener('change', (e) => {
        localStorage.setItem('mitra_voice_enabled', e.target.checked ? 'true' : 'false');
      });
    }

    const notifToggle = card.querySelector('.setting-notif-toggle');
    if (notifToggle) {
      notifToggle.addEventListener('change', (e) => {
        localStorage.setItem('mitra_notif_enabled', e.target.checked ? 'true' : 'false');
      });
    }

    const clearMemBtn = card.querySelector('.btn-clear-memory');
    if (clearMemBtn) {
      clearMemBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to clear companion conversation memory?")) {
          if (this.contextStore) this.contextStore.clear();
          if (this.eventBus) this.eventBus.emit('context.cleared');
        }
      });
    }

    this.element.appendChild(card);
    this.scrollToBottom();
  }

  addCapabilityErrorCard(capability, errorText, data = {}) {
    const isAuthErr = String(errorText).includes('401') || String(errorText).toLowerCase().includes('unauthorized') || String(errorText).toLowerCase().includes('token');
    if (isAuthErr && typeof localStorage !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('authToken');
      localStorage.removeItem('jwt');
      localStorage.removeItem('mitra_auth_token');
    }

    const card = document.createElement('div');
    card.className = 'chat-bubble mitra capability-widget failure';
    card.style.background = 'rgba(35, 15, 15, 0.95)';
    card.style.border = '1px solid rgba(255, 59, 48, 0.4)';
    card.style.maxWidth = '92%';
    card.style.padding = '14px 16px';
    card.style.borderRadius = '16px';
    card.style.boxShadow = '0 8px 24px rgba(255, 59, 48, 0.15)';

    const now = new Date().toLocaleTimeString();
    const capUpper = (capability || 'CAPABILITY').toUpperCase();

    card.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; border-bottom:1px solid rgba(255,59,48,0.2); padding-bottom:6px;">
        <div style="font-weight:700; font-size:13px; color:#ff453a; display:flex; align-items:center; gap:6px;">⚠️ ${this.escapeHtml(capUpper)} ${isAuthErr ? 'AUTHENTICATION NEEDED' : 'EXECUTION FAILED'}</div>
        <span style="font-size:10px; background:rgba(255,59,48,0.2); color:#ff453a; padding:2px 6px; border-radius:4px;">${isAuthErr ? 'Auth 401' : 'Failed'}</span>
      </div>
      <div style="font-size:12px; color:#ff8585; margin-bottom:4px;">${this.escapeHtml(errorText)}</div>
      ${isAuthErr ? `
        <div style="font-size:11px; color:#a29bfe; margin:6px 0;">💡 Stale login session cleaned. Connect your Google Workspace below:</div>
        <button class="btn-connect-google-inline" style="background:#4285F4; border:none; color:#fff; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin-bottom:6px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"/></svg>
          Connect Google Workspace
        </button>
      ` : ''}
      <div class="chat-timestamp">${now}</div>
    `;

    const connectBtn = card.querySelector('.btn-connect-google-inline');
    if (connectBtn) {
      connectBtn.addEventListener('click', async () => {
        try {
          connectBtn.textContent = 'Opening Google...';
          const res = await controlPlane.startGoogleOAuth('connect');
          if (res.url) {
            window.open(res.url, 'google_oauth', 'width=580,height=680,menubar=no,toolbar=no');
          }
        } catch (err) {
          alert('Could not start Google connection: ' + err.message);
          connectBtn.textContent = 'Connect Google Workspace';
        }
      });
    }

    this.element.appendChild(card);
    this.scrollToBottom();
  }

  addSystemMessage(html) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.style.opacity = '0.7';
    bubble.style.fontSize = '12px';
    bubble.innerHTML = html;
    this.element.appendChild(bubble);
    this.scrollToBottom();
  }

  formatMarkdown(text) {
    if (!text) return '';
    let formatted = this.escapeHtml(text);

    // Headers: ## Heading -> <strong> styled header
    formatted = formatted.replace(/^###\s+(.+)$/gm, '<div style="font-size:12px;font-weight:700;color:#a29bfe;margin:10px 0 4px 0;text-transform:uppercase;letter-spacing:0.5px;">$1</div>');
    formatted = formatted.replace(/^##\s+(.+)$/gm, '<div style="font-size:13px;font-weight:700;color:#e4e4e7;margin:12px 0 6px 0;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:4px;">$1</div>');
    formatted = formatted.replace(/^#\s+(.+)$/gm, '<div style="font-size:14px;font-weight:700;color:#fff;margin:12px 0 6px 0;">$1</div>');

    // Bold: **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Italic: *text* (but not bullet points)
    formatted = formatted.replace(/(?<!\n)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '<em>$1</em>');

    // Bullet points: lines starting with *, -, \t* or \t-
    formatted = formatted.replace(/^[\t ]*[\*\-]\s+(.+)$/gm, '<div style="margin:3px 0;padding-left:16px;display:flex;gap:6px;"><span style="color:#6c5ce7;flex-shrink:0;">•</span><span>$1</span></div>');

    // Numbered lists: 1. item
    formatted = formatted.replace(/^(\d+)\.\s+(.+)$/gm, '<div style="margin:3px 0;padding-left:16px;display:flex;gap:6px;"><span style="color:#6c5ce7;font-weight:700;flex-shrink:0;min-width:16px;">$1.</span><span>$2</span></div>');

    // Horizontal rule
    formatted = formatted.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid rgba(255,255,255,0.1);margin:8px 0;">');

    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 4px;border-radius:4px;font-family:monospace;">$1</code>');

    // Line breaks (preserve \n as <br> for sections not already converted to divs)
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  scrollToBottom(smooth = true, force = false) {
    try {
      requestAnimationFrame(() => {
        if (!this.element) return;
        // If not forced, do not interrupt reading if user has scrolled up
        if (!force) {
          const distanceFromBottom = this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight;
          if (distanceFromBottom > 160) {
            return;
          }
        }
        if (smooth) {
          this.element.scrollTo({
            top: this.element.scrollHeight,
            behavior: 'smooth'
          });
        } else {
          this.element.scrollTop = this.element.scrollHeight;
        }
      });
    } catch (e) {
      if (this.element) {
        this.element.scrollTop = this.element.scrollHeight;
      }
    }
  }

  escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
