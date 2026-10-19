export class CapabilityLauncher {
  constructor(onClose, onCapabilitySelected) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-launcher';
    this.element.id = 'launcher';

    // Complete list of all 12 capabilities supported by backend v5
    const capabilities = [
      { id: 'voice', name: 'Voice / Mic', intent: 'voice_stt', icon: '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>' },
      { id: 'calendar', name: 'Calendar', intent: 'calendar', icon: '<path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/>' },
      { id: 'reminder', name: 'Reminders', intent: 'reminder', icon: '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/>' },
      { id: 'task', name: 'Tasks / To-Do', intent: 'task', icon: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>' },
      { id: 'email', name: 'Email', intent: 'email', icon: '<path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>' },
      { id: 'whatsapp', name: 'WhatsApp', intent: 'whatsapp', icon: '<path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/>' },
      { id: 'ocr', name: 'OCR', intent: 'extract_text', icon: '<path d="M3 5v4h2V7h4V5H3zm14 0v2h4v2h2V5h-6zM3 15v4h6v-2H5v-2H3zm18 0h-2v2h-4v2h6v-4zM7 11h10v2H7z"/>' },
      { id: 'translate', name: 'Translate', intent: 'translate_text', icon: '<path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2.1l1.1-3h4.6l1.1 3H23l-4.5-12zm-2.62 7l1.62-4.41L19.12 17h-3.24z"/>' },
      { id: 'summarize', name: 'Summarize', intent: 'summarize_text', icon: '<path d="M14 17H4v-2h10v2zm6-8H4V7h16v2zM4 13h16v-2H4v2zm0 8h10v-2H4v2z"/>' },
      { id: 'image', name: 'Image', intent: 'generate_image', icon: '<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>' },
      { id: 'health', name: 'Health', intent: 'check_health', icon: '<path d="M19 3H5c-1.1 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-1 11h-4v4h-4v-4H6v-4h4V6h4v4h4v4z"/>' },
      { id: 'settings', name: 'Settings', intent: 'get_settings', icon: '<path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z"/>' }
    ];

    const gridHtml = capabilities.map(cap => `
      <div class="capability-card" data-capability="${cap.id}" data-intent="${cap.intent}">
        <div class="capability-icon">
          <svg viewBox="0 0 24 24">${cap.icon}</svg>
        </div>
        <div class="capability-title">${cap.name}</div>
      </div>
    `).join('');

    this.element.innerHTML = `
      <div class="launcher-header">
        Capabilities
        <button class="mitra-btn" id="btn-close-launcher">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="launcher-grid">
        ${gridHtml}
      </div>
    `;

    this.element.querySelector('#btn-close-launcher').addEventListener('click', () => {
      this.close();
      if (onClose) onClose();
    });

    const caps = this.element.querySelectorAll('.capability-card');
    caps.forEach(card => {
      card.addEventListener('click', (e) => {
        const capability = e.currentTarget.getAttribute('data-capability');
        const intent = e.currentTarget.getAttribute('data-intent');
        if (onCapabilitySelected) onCapabilitySelected(capability, intent);
        this.close();
      });
    });
  }

  open() {
    this.element.classList.add('active');
  }

  close() {
    this.element.classList.remove('active');
  }
}
