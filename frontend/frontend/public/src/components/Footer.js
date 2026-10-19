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

    const triggerSend = () => {
      const text = input.value.trim();
      const imagePayload = this.attachedImageBase64;

      if (text || imagePayload) {
        if (onSend) onSend(text, imagePayload);
        input.value = '';
        clearAttachedImage();
      }
    };

    // Unlock browser Speech Synthesis audio playback on first user gesture
    const unlockAudio = () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.resume();
      }
    };

    btnSend.addEventListener('click', () => {
      unlockAudio();
      triggerSend();
    });

    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        unlockAudio();
        triggerSend();
      }
    });

    btnOpenLauncher.addEventListener('click', () => {
      if (onOpenCapabilities) onOpenCapabilities();
    });

    // Real-time Speech Recognition Integration
    let isListening = false;
    let recognition = null;

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        isListening = true;
        btnMic.style.color = '#e056fd';
        btnMic.style.background = 'rgba(224, 86, 253, 0.25)';
        input.placeholder = '🎙️ Listening... Speak now...';
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        input.value = transcript;
      };

      recognition.onerror = (err) => {
        isListening = false;
        btnMic.style.color = '';
        btnMic.style.background = '';
        input.placeholder = 'Message MITRA or attach an image...';
        if (err && err.error === 'not-allowed') {
          alert('🎙️ Microphone access blocked. Please click the Lock icon in your browser address bar and enable Microphone.');
        }
      };

      recognition.onend = () => {
        isListening = false;
        btnMic.style.color = '';
        btnMic.style.background = '';
        input.placeholder = 'Message MITRA or attach an image...';
        if (input.value.trim()) {
          triggerSend();
        }
      };
    }

    btnMic.addEventListener('click', () => {
      unlockAudio();
      if (recognition) {
        if (isListening) {
          recognition.stop();
        } else {
          try {
            recognition.start();
          } catch (err) {
            recognition.stop();
          }
        }
      } else {
        alert('🎙️ Speech recognition is not supported in this browser. Please try Google Chrome or Edge.');
      }
    });
  }

  getAttachedImage() {
    return this.attachedImageBase64;
  }
}
