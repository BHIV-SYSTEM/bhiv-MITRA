import { contextStore } from '../services/contextStore.js';

export class DockController {
  constructor(shellElement) {
    this.shell = shellElement;
    this.currentMode = contextStore.getDockMode();

    this.element = document.createElement('div');
    this.element.className = 'mitra-dock-controls';
    this.element.innerHTML = `
      <button class="mitra-btn" data-dock="left" title="Dock Left">
        <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
      </button>
      <button class="mitra-btn" data-dock="floating" title="Floating">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
      </button>
      <button class="mitra-btn" data-dock="right" title="Dock Right">
        <svg viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
      </button>
    `;

    this.element.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.getAttribute('data-dock');
        this.setMode(mode);
      });
    });

    // Apply initial state
    this.setMode(this.currentMode, false);
  }

  setMode(mode, save = true) {
    const validMode = (mode === 'left' || mode === 'right' || mode === 'floating') ? mode : 'floating';
    this.currentMode = validMode;
    this.shell.classList.remove('docked-left', 'docked-right', 'floating');
    
    const clearPositionStyles = () => {
      this.shell.style.removeProperty('inset');
      this.shell.style.top = '';
      this.shell.style.left = '';
      this.shell.style.bottom = '';
      this.shell.style.right = '';
    };

    if (validMode === 'left') {
      this.shell.classList.add('docked-left');
      clearPositionStyles();
    } else if (validMode === 'right') {
      this.shell.classList.add('docked-right');
      clearPositionStyles();
    } else {
      this.shell.classList.add('floating');
      clearPositionStyles();
      const lastPos = contextStore.getPosition();
      if (lastPos && lastPos.left != null && lastPos.top != null) {
        const parsedLeft = parseFloat(lastPos.left);
        const parsedTop = parseFloat(lastPos.top);
        if (!isNaN(parsedLeft) && !isNaN(parsedTop)) {
          const safeLeft = Math.min(Math.max(0, parsedLeft), Math.max(0, window.innerWidth - 80));
          const safeTop = Math.min(Math.max(0, parsedTop), Math.max(0, window.innerHeight - 80));
          this.shell.style.left = `${safeLeft}px`;
          this.shell.style.top = `${safeTop}px`;
          this.shell.style.bottom = 'auto';
          this.shell.style.right = 'auto';
        } else {
          this.shell.style.bottom = '24px';
          this.shell.style.right = '24px';
          this.shell.style.top = 'auto';
          this.shell.style.left = 'auto';
        }
      } else {
        this.shell.style.bottom = '24px';
        this.shell.style.right = '24px';
        this.shell.style.top = 'auto';
        this.shell.style.left = 'auto';
      }
      this.shell.style.position = 'fixed';
    }

    if (save) {
      contextStore.setDockMode(validMode);
    }
  }
}
