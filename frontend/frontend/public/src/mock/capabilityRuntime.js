import { eventBus } from '../services/eventBus.js';
import { contextStore } from '../services/contextStore.js';

export class CapabilityRuntime {
  execute(capability) {
    const startTime = Date.now();
    const startTimestamp = new Date().toLocaleTimeString();
    
    eventBus.emit('capability.started', { capability, timestamp: startTimestamp });
    
    setTimeout(() => {
      const durationMs = Date.now() - startTime;
      const durationStr = `${(durationMs / 1000).toFixed(1)}s`;
      const endTimestamp = new Date().toLocaleTimeString();

      if (capability === 'health' || capability === 'settings') {
        eventBus.emit('capability.completed', {
          capability,
          duration: durationStr,
          result: `System ${capability} view loaded.`
        });
        contextStore.addReplay({
          timestamp: endTimestamp,
          capability,
          status: 'SUCCESS',
          duration: durationStr
        });
        return;
      }

      if (capability === 'replay') {
        const replays = contextStore.getReplays();
        let replayListHtml = `<div style="margin-top: 8px;"><strong>Replay History:</strong><ul style="padding-left: 16px; margin: 4px 0;">`;
        replays.slice(-5).forEach(r => {
          replayListHtml += `<li>[${r.timestamp}] ${r.capability.toUpperCase()} - ${r.status} (${r.duration})</li>`;
        });
        replayListHtml += '</ul></div>';

        eventBus.emit('capability.completed', {
          capability,
          duration: durationStr,
          result: 'Replay history retrieved.'
        });
        contextStore.addMessage('mitra', `Here is the recent capability execution replay log:${replayListHtml}`);
        return;
      }

      const resultText = `Capability [${capability.toUpperCase()}] executed successfully on current workspace context.`;
      
      eventBus.emit('capability.completed', {
        capability,
        duration: durationStr,
        result: resultText
      });

      // Log Replay Evidence
      contextStore.addReplay({
        timestamp: endTimestamp,
        capability,
        status: 'SUCCESS',
        duration: durationStr
      });

      // Save to conversation history as assistant response
      contextStore.addMessage('mitra', `[Capability: ${capability.toUpperCase()}] ${resultText} (Execution time: ${durationStr})`);
    }, 1500);
  }
}

export const capabilityRuntime = new CapabilityRuntime();
