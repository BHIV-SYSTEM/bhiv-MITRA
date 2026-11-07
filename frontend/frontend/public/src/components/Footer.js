export class Footer {
  constructor(onSend, onOpenCapabilities, onVoiceClick) {
    this.element = document.createElement('div');
    this.element.className = 'mitra-footer-container';
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.width = '100%';

    this.attachedImageBase64 = null;
    this.attachedFileName = null;

    this.element.innerHTML = `
      <!-- Attached Image Preview Bar -->
      <div id="image-preview-bar" style="display:none; padding:8px 16px; background:rgba(21,21,29,0.9); border-top:1px solid rgba(255,255,255,0.1); align-items:center; justify-content:space-between; gap:10px;">
        <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
          <img id="img-preview-thumb" style="width:36px; height:36px; border-radius:6px; object-fit:cover; border:1px solid #6c5ce7;" />
          <div style="display:flex; flex-direction:column; overflow:hidden;">
            <span style="font-size:11px; font-weight:600; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" id="img-preview-name">Image Attached</span>
            <span style="font-size:9px; color:#00e676;">Ready for OCR / Image Analysis</span>
          </div>
        </div>
        <button id="btn-remove-img" style="background:rgba(255,59,48,0.2); border:1px solid rgba(255,59,48,0.4); color:#ff453a; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:12px;">✕</button>
      </div>

      <!-- Footer Action Input Bar -->
      <div class="mitra-input-area" style="display:flex; align-items:center; gap:8px; padding:12px 16px;">
        <button class="mitra-btn" id="btn-open-launcher" title="Capabilities">
          <svg viewBox="0 0 24 24"><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/></svg>
        </button>

        <!-- Image Attachment Button 📎 -->
        <button class="mitra-btn" id="btn-attach-image" title="Attach Image (PNG, JPG, WEBP)">
          <svg viewBox="0 0 24 24"><path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/></svg>
        </button>
        <input type="file" id="file-input-image" accept="image/png,image/jpeg,image/webp" style="display:none;" />

        <!-- Microphone STT Button 🎙️ -->
        <button class="mitra-btn" id="btn-mic" title="Voice Input (Click to speak)">
          <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/></svg>
        </button>

        <input type="text" class="mitra-input" id="chat-input" placeholder="Message MITRA or attach an image..." />
        
        <button class="mitra-send" id="btn-send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>

      <!-- Legal Links Bar -->
      <div style="display:flex; justify-content:center; align-items:center; gap:8px; padding:3px 16px 7px; font-size:10px; color:rgba(255,255,255,0.4); border-top:1px solid rgba(255,255,255,0.04);">
        <span>MITRA AI</span>
        <span>·</span>
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" style="color:#a29bfe; text-decoration:none;">Terms of Service</a>
        <span>·</span>
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" style="color:#a29bfe; text-decoration:none;">Privacy Policy</a>
      </div>
    `;

    const input = this.element.querySelector('#chat-input');
    const btnSend = this.element.querySelector('#btn-send');
    const btnOpenLauncher = this.element.querySelector('#btn-open-launcher');
    const btnAttach = this.element.querySelector('#btn-attach-image');
    const fileInput = this.element.querySelector('#file-input-image');
    const btnMic = this.element.querySelector('#btn-mic');
    const previewBar = this.element.querySelector('#image-preview-bar');
    const previewThumb = this.element.querySelector('#img-preview-thumb');
    const previewName = this.element.querySelector('#img-preview-name');
    const btnRemoveImg = this.element.querySelector('#btn-remove-img');

    const clearAttachedImage = () => {
      this.attachedImageBase64 = null;
      this.attachedFileName = null;
      fileInput.value = '';
      previewBar.style.display = 'none';
    };

    btnRemoveImg.addEventListener('click', clearAttachedImage);

    // File Attachment Handler
    btnAttach.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        alert('Please select a PNG, JPG, JPEG, or WEBP image.');
        fileInput.value = '';
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        alert('Image file size must be less than 10MB.');
        fileInput.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        this.attachedImageBase64 = event.target.result;
        this.attachedFileName = file.name;
        previewThumb.src = this.attachedImageBase64;
        previewName.textContent = file.name;
        previewBar.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    });

    const triggerSend = (wasVoice = false) => {
      const text = input.value.trim();
      const imagePayload = this.attachedImageBase64;

      if (text || imagePayload) {
        if (onSend) onSend(text, imagePayload, wasVoice);
        input.value = '';
        input.focus();
        clearAttachedImage();
      }
    };

    // Unlock browser Speech Synthesis audio playback on first user gesture
    const unlockAudio = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
    };

    btnSend.addEventListener('click', (e) => {
      e.preventDefault();
      unlockAudio();
      triggerSend();
    });

    // Close any open overlay drawers when user interacts with input
    const closeDrawersOnInput = () => {
      if (typeof window !== 'undefined' && typeof window.__mitra_close_launcher === 'function') {
        window.__mitra_close_launcher();
      }
    };
    input.addEventListener('focus', closeDrawersOnInput);
    input.addEventListener('click', closeDrawersOnInput);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        unlockAudio();
        triggerSend();
      }
    });

    btnOpenLauncher.addEventListener('click', () => {
      if (onOpenCapabilities) onOpenCapabilities();
    });

    // Real-time Speech Recognition Integration
    let isListening = false;
    let activeRecognition = null;

    const stopListening = () => {
      isListening = false;
      btnMic.style.color = '';
      btnMic.style.background = '';
      btnMic.style.boxShadow = '';
      if (activeRecognition) {
        try { activeRecognition.stop(); } catch (e) {}
      }
    };

    const startListening = () => {
      if (typeof window === 'undefined' || (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window))) {
        alert('Speech recognition requires Google Chrome or Microsoft Edge with microphone enabled.');
        return;
      }

      // Stop previous instance cleanly
      if (activeRecognition) {
        try { activeRecognition.abort(); } catch (e) {}
        activeRecognition = null;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const rec = new SpeechRecognition();
      activeRecognition = rec;

      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      // 'en-IN' is ideal for Indian English, Hinglish, and clear English recognition
      rec.lang = 'en-IN';

      rec.onstart = () => {
        isListening = true;
        btnMic.style.color = '#00e676';
        btnMic.style.background = 'rgba(0, 230, 118, 0.25)';
        btnMic.style.boxShadow = '0 0 14px rgba(0, 230, 118, 0.7)';
        input.placeholder = '🎙️ Listening... Speak your question or command now...';
      };

      rec.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          input.value = transcript.trim();
        }
      };

      rec.onerror = (err) => {
        isListening = false;
        btnMic.style.color = '';
        btnMic.style.background = '';
        btnMic.style.boxShadow = '';
        console.warn('[MITRA Mic] Speech recognition notice:', err?.error);
        if (err && err.error === 'not-allowed') {
          input.placeholder = '⚠️ Mic access denied. Please click Lock 🔒 in address bar and Allow Mic.';
          alert('Microphone access is blocked in your browser.\n\nTo enable:\n1. Click the Lock/Tune icon (🔒) on the left side of the address bar (http://localhost:8080/)\n2. Set "Microphone" to "Allow"\n3. Refresh the page and try again!');
        } else if (err && err.error === 'no-speech') {
          input.placeholder = '🎙️ No speech detected. Click 🎙️ to try again.';
        } else if (err && err.error === 'network') {
          input.placeholder = '⚠️ Speech recognition network unavailable.';
        } else {
          input.placeholder = 'Message MITRA or attach an image...';
        }
        setTimeout(() => {
          if (!isListening) {
            input.placeholder = 'Message MITRA or attach an image...';
          }
        }, 4000);
      };

      rec.onend = () => {
        isListening = false;
        btnMic.style.color = '';
        btnMic.style.background = '';
        btnMic.style.boxShadow = '';
        setTimeout(() => {
          if (!isListening && input.placeholder.includes('Listening')) {
            input.placeholder = 'Message MITRA or attach an image...';
          }
        }, 1200);
        if (input.value.trim()) {
          triggerSend(true);
        }
      };

      try {
        input.placeholder = '🎙️ Starting microphone...';
        rec.start();
      } catch (err) {
        console.warn('[MITRA Mic] Recognition start notice:', err);
      }
    };

    btnMic.addEventListener('click', (e) => {
      e.preventDefault();
      unlockAudio();
      if (isListening) {
        stopListening();
      } else {
        startListening();
      }
    });
  }

  getAttachedImage() {
    return this.attachedImageBase64;
  }
}
