// components/shell/FloatingOrb.tsx — Floating Avatar Orb linked to Mitra Companion Chatbot
import React from 'react';
import { motion } from 'framer-motion';
import { useCompanionStore } from '../../store/companion.store';

export const FloatingOrb: React.FC = () => {
  const { chatbotOpen, toggleChatbot, companionAvatar, companionName } = useCompanionStore();

  // If chatbot window is currently open, hide the orb so they don't collide
  if (chatbotOpen) return null;

  return (
    <aside aria-label="Mitra Companion Launcher" className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 flex flex-col items-end">
      <motion.button
        id="mitra-floating-orb-btn"
        onClick={() => {
          const toggleOrb = (window as any).__MITRA_TOGGLE_ORB__;
          if (typeof toggleOrb === 'function') {
            toggleOrb();
          } else {
            window.dispatchEvent(new CustomEvent('mitra:toggle-orb'));
            toggleChatbot();
          }
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        className="w-13 h-13 sm:w-14 sm:h-14 rounded-full flex items-center justify-center shadow-glow transition-all duration-300 relative overflow-hidden bg-surface-elevated border-2 border-brand/60 hover:border-brand cursor-pointer group p-0.5"
        title={`Mitra Companion (${companionName}): Click to open Chatbot`}
        aria-label="Open Mitra Companion Chatbot"
      >
        <div className="w-full h-full rounded-full overflow-hidden flex items-center justify-center bg-brand/20">
          <img
            src={companionAvatar || '/assets/mitra_avatar_default.png'}
            alt={companionName || 'Mitra Companion'}
            className="w-full h-full object-cover rounded-full transition-transform duration-300 group-hover:scale-110 pointer-events-none"
            onError={(e) => {
              (e.target as HTMLImageElement).src = '/assets/mitra_avatar_default.png';
            }}
          />
        </div>
        <span
          className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-state-success border-2 border-surface-raised shadow-xs animate-pulse"
          title="Mitra Active"
        />
      </motion.button>
    </aside>
  );
};

export default FloatingOrb;
