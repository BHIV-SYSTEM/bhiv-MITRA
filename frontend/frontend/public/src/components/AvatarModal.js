import { getActiveMitraAvatar, renderAvatarElement, isVideoAsset, setCachedActiveAvatar, COMPANION_PRESETS, MITRA_CANONICAL_AVATAR_DATA_URL } from '../services/avatarHelper.js';
import { companionStorage } from '../services/companionStorage.js';

export class AvatarModal {
  constructor(eventBus, contextStore) {
    this.eventBus = eventBus;
    this.contextStore = contextStore;
    this.element = document.createElement('div');
    this.element.className = 'mitra-avatar-modal-overlay';
    this.element.style.display = 'none';

    this.render();
  }

  render() {
    const activeAvatar = getActiveMitraAvatar(this.contextStore);
    const isDefault = !activeAvatar || activeAvatar === 'default' || activeAvatar === MITRA_CANONICAL_AVATAR_DATA_URL;

    let activeType = '🤖 Official Robot Active';
    if (isVideoAsset(activeAvatar)) {
      activeType = '🎬 MP4 / WebM Looping Video Active';
    } else if (activeAvatar.startsWith('data:image/gif') || activeAvatar.includes('.gif')) {
      activeType = '✨ Animated GIF Active';
    } else if (activeAvatar.startsWith('data:image/webp') || activeAvatar.includes('.webp')) {
      activeType = '🌟 Transparent WebP Active';
    } else if (!isDefault) {
      activeType = '🎨 Custom Companion Active';
    }

    const presetsHtml = COMPANION_PRESETS.map(preset => {
      const isSelected = activeAvatar === preset.src || (isDefault && preset.id === 'official-robot');
      return `
        <div class="mitra-preset-card ${isSelected ? 'selected' : ''}" data-preset-id="${preset.id}" title="${preset.name}">
          <div class="mitra-preset-thumb-wrap">
            <img src="${preset.src}" class="mitra-preset-thumb" alt="${preset.name}" />
          </div>
          <span class="mitra-preset-name">${preset.name}</span>
          ${isSelected ? '<span class="mitra-preset-check">✓</span>' : ''}
        </div>
      `;
    }).join('');

    this.element.innerHTML = `
      <div class="mitra-avatar-modal-card">
        <div class="mitra-avatar-modal-header">
          <div class="mitra-avatar-modal-title">✨ Custom Companion System</div>
          <button class="mitra-avatar-modal-close" title="Close">✕</button>
        </div>
        
        <div class="mitra-avatar-preview-wrap">
          <div class="mitra-avatar-preview-ring" id="modal-preview-ring">
            <!-- Live Media Preview (Image or Video) -->
          </div>
          <div class="mitra-avatar-status-badge" id="modal-status-badge">
            ${activeType}
          </div>
        </div>

        <!-- Format Compatibility Badges -->
        <div class="mitra-supported-formats-bar">
          <span class="mitra-format-tag">PNG</span>
          <span class="mitra-format-tag">JPG</span>
          <span class="mitra-format-tag">GIF</span>
          <span class="mitra-format-tag">WebP</span>
          <span class="mitra-format-tag">MP4</span>
          <span class="mitra-format-tag">WebM</span>
          <span class="mitra-transparency-pill">✨ Transparency &amp; Looping Animation Preserved</span>
        </div>

        <!-- Choose from Companion Presets -->
        <div class="mitra-presets-section">
          <div class="mitra-presets-title">Choose Companion Preset:</div>
          <div class="mitra-presets-grid">
            ${presetsHtml}
          </div>
        </div>

        <!-- Upload Custom Asset Dropzone -->
        <div class="mitra-avatar-dropzone" id="avatar-dropzone">
          <div class="mitra-dropzone-icon">📁</div>
          <div class="mitra-dropzone-text"><strong>Upload Custom Companion Asset</strong></div>
          <div class="mitra-dropzone-sub">Drag &amp; drop or click to upload PNG, JPG, GIF, WebP, or MP4</div>
        </div>

        <div class="mitra-avatar-modal-actions">
          <button class="mitra-avatar-btn primary btn-upload-avatar">
            <span>📤</span> Browse File from Computer
          </button>
          
          <button class="mitra-avatar-btn secondary btn-reset-avatar">
            <span>🤖</span> Reset to Official Robot Avatar
          </button>
        </div>

        <input type="file" class="mitra-avatar-file-hidden" accept="image/png, image/jpeg, image/gif, image/webp, image/svg+xml, video/mp4, video/webm" style="display:none;" />
      </div>
    `;

    // Render preview inside ring
    const previewRing = this.element.querySelector('#modal-preview-ring');
    if (previewRing) {
      previewRing.innerHTML = '';
      const previewEl = renderAvatarElement(activeAvatar, 'mitra-avatar-preview-img');
      previewRing.appendChild(previewEl);
    }

    // Attach event listeners
    const closeBtn = this.element.querySelector('.mitra-avatar-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      });
    }

    this.element.addEventListener('click', (e) => {
      if (e.target === this.element) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    });

    // Preset clicks
    const presetCards = this.element.querySelectorAll('.mitra-preset-card');
    presetCards.forEach(card => {
      const handleSelect = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const presetId = card.getAttribute('data-preset-id');
        const preset = COMPANION_PRESETS.find(p => p.id === presetId);
        if (preset) {
          if (preset.id === 'official-robot') {
            this.resetToOfficial();
          } else {
            this.applyNewAvatar(preset.src);
          }
        }
      };
      card.addEventListener('click', handleSelect);
    });

    const fileInput = this.element.querySelector('.mitra-avatar-file-hidden');
    const uploadBtn = this.element.querySelector('.btn-upload-avatar');
    const dropzone = this.element.querySelector('#avatar-dropzone');

    uploadBtn.addEventListener('click', () => {
      fileInput.click();
    });

    if (dropzone) {
      dropzone.addEventListener('click', () => {
        fileInput.click();
      });

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('drag-over');
      });

      dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('drag-over');
      });

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFileSelection(e.dataTransfer.files[0]);
        }
      });
    }

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        this.handleFileSelection(file);
      }
    });

    const resetBtn = this.element.querySelector('.btn-reset-avatar');
    resetBtn.addEventListener('click', () => {
      this.resetToOfficial();
    });
  }

  async applyNewAvatar(newAvatar) {
    const isVideo = isVideoAsset(newAvatar);
    setCachedActiveAvatar(newAvatar, isVideo);

    if (this.contextStore) {
      this.contextStore.setAvatar(newAvatar);
    }
    if (this.eventBus) {
      this.eventBus.emit('avatar.changed', { avatar: newAvatar });
    }

    // Sync to localStorage and dispatch global window events for host app (React TopBar, etc.)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mitra_companion_asset', newAvatar);
        localStorage.setItem('mitra_avatar_custom', newAvatar);
        localStorage.setItem('mitra_custom_avatar', newAvatar);
        localStorage.setItem('mitra_avatar_data_url', newAvatar);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mitra:companion-changed', { detail: { companionAvatar: newAvatar, companionName: 'Mitra Companion' } }));
        window.dispatchEvent(new CustomEvent('mitra:avatar-changed', { detail: { avatar: newAvatar } }));
      }
    } catch (err) {
      console.warn('[AvatarModal] Non-critical localStorage sync error:', err);
    }

    this.close();

    try {
      await companionStorage.setAsset('current_companion', newAvatar);
    } catch (e) {
      console.warn('[AvatarModal] Failed to persist companion asset:', e);
    }
  }

  async resetToOfficial() {
    setCachedActiveAvatar(MITRA_CANONICAL_AVATAR_DATA_URL, false);
    if (this.contextStore) {
      this.contextStore.setAvatar('default');
    }
    if (this.eventBus) {
      this.eventBus.emit('avatar.changed', { avatar: 'default' });
    }

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('mitra_companion_asset');
        localStorage.removeItem('mitra_avatar_custom');
        localStorage.removeItem('mitra_custom_avatar');
        localStorage.removeItem('mitra_avatar_data_url');
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mitra:companion-changed', { detail: { companionAvatar: '/assets/mitra_avatar_default.png', companionName: 'Mitra Companion' } }));
        window.dispatchEvent(new CustomEvent('mitra:avatar-changed', { detail: { avatar: 'default' } }));
      }
    } catch (err) {
      console.warn('[AvatarModal] Non-critical localStorage remove error:', err);
    }

    this.close();

    try {
      await companionStorage.removeAsset('current_companion');
    } catch (e) {
      console.warn('[AvatarModal] Failed to remove companion asset:', e);
    }
  }

  handleFileSelection(file) {
    if (!file) return;
    const isVideo = file.type ? file.type.startsWith('video/') : (file.name && (file.name.endsWith('.mp4') || file.name.endsWith('.webm')));
    
    // 1. Instant 0ms memory preview and UI dispatch
    const objectUrl = URL.createObjectURL(file);
    setCachedActiveAvatar(objectUrl, isVideo);

    if (this.contextStore) {
      this.contextStore.setAvatar(objectUrl);
    }
    if (this.eventBus) {
      this.eventBus.emit('avatar.changed', { avatar: objectUrl });
    }
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('mitra:companion-changed', { detail: { companionAvatar: objectUrl, companionName: 'Custom Companion' } }));
        window.dispatchEvent(new CustomEvent('mitra:avatar-changed', { detail: { avatar: objectUrl } }));
      }
    } catch (err) {}
    this.close();

    // 2. Read file to Base64 in background for permanent persistence in IndexedDB
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const dataUrl = evt.target.result;
      setCachedActiveAvatar(dataUrl, isVideo);
      try {
        if (typeof localStorage !== 'undefined' && dataUrl.length < 2 * 1024 * 1024) {
          localStorage.setItem('mitra_companion_asset', dataUrl);
          localStorage.setItem('mitra_avatar_custom', dataUrl);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('mitra:companion-changed', { detail: { companionAvatar: dataUrl, companionName: 'Custom Companion' } }));
          window.dispatchEvent(new CustomEvent('mitra:avatar-changed', { detail: { avatar: dataUrl } }));
        }
      } catch (e) {}
      try {
        await companionStorage.setAsset('current_companion', dataUrl);
      } catch (err) {
        console.warn('[AvatarModal] Background IndexedDB save warning:', err);
      }
    };
    reader.readAsDataURL(file);
  }

  open() {
    this.isOpen = true;
    this.render();
    this.element.style.display = 'flex';
  }

  close(notifyOnClose = true) {
    const wasOpen = this.isOpen || this.element.style.display === 'flex';
    this.isOpen = false;
    this.element.style.display = 'none';
    if (wasOpen && notifyOnClose && typeof this.onClose === 'function') {
      try { this.onClose(); } catch (err) {}
    }
  }
}
