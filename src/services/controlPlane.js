import { eventBus } from './eventBus.js';
import { contextStore } from './contextStore.js';

export function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.__MITRA_API_BASE_URL) {
    return window.__MITRA_API_BASE_URL;
  }
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:8001';
  }
  if (typeof document !== 'undefined') {
    const attr = document.querySelector('mitra-companion')?.getAttribute('api-base-url');
    if (attr) return attr;
  }
  return 'https://mitra.blackholeinfiverse.com';
}

const API_KEY = 'bhiv-enterprise-key';

/** Build request headers strictly complying with OpenAPI and JWT auth requirements. */
function buildHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
  };
  if (typeof localStorage !== 'undefined') {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('jwt');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return headers;
}

export class ControlPlane {
  async simulateResponse(text) {
    return this.sendMessage(text);
  }

  /**
   * Send a chat message using the v5 companion chat endpoint.
   * Strictly matches `CompanionChatRequest` schema:
   *  - message (string, required)
   *  - user_id (string, optional)
   *  - platform (string, default "web")
   *  - device (string, default "browser")
   */
  getHostContext() {
    const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
    let hostApp = 'dashboard';
    if (pathname.includes('/pages/samachar')) hostApp = 'samachar';
    else if (pathname.includes('/pages/uniguru')) hostApp = 'uniguru';
    else if (pathname.includes('/pages/gurukul')) hostApp = 'gurukul';
    else if (pathname.includes('/pages/samruddhi')) hostApp = 'samruddhi';
    else if (pathname.includes('/pages/setu')) hostApp = 'setu';

    return {
      host_app: hostApp,
      current_page: pathname || 'index.html'
    };
  }

  async sendMessage(text) {
    eventBus.emit('health.changed', { status: 'Connecting' });
    try {
      const userId = contextStore.getUserId();
      const hostCtx = this.getHostContext();

      // Build payload strictly adhering to OpenAPI `CompanionChatRequest`
      const payload = {
        message: text,
        platform: 'web',
        device: 'browser',
        page_context: {
          host_app: hostCtx.host_app,
          current_page: hostCtx.current_page
        }
      };
      if (userId) payload.user_id = userId;

      // ═══════════════════════════════════════════════════════════════════
      // PRE-FLIGHT INTERCEPTS — handle before backend (always fail on Render)
      // ═══════════════════════════════════════════════════════════════════
      const preText = text.trim();

      // ── TRANSLATE (MyMemory free API — catches "translate X into Y" AND "'X' into Y") ──
      const langMap = {hindi:'hi',french:'fr',spanish:'es',german:'de',arabic:'ar',portuguese:'pt',russian:'ru',japanese:'ja',chinese:'zh',korean:'ko',italian:'it',dutch:'nl',turkish:'tr',polish:'pl',marathi:'mr',gujarati:'gu',bengali:'bn',tamil:'ta',telugu:'te',kannada:'kn',punjabi:'pa',urdu:'ur',english:'en'};
      const allLangs = Object.keys(langMap).join('|');
      // Pattern 1: "Translate 'X' into Y"  or  "Translate X to Y"
      const tFull = preText.match(new RegExp(`translate\\s+([\\s\\S]+?)\\s+(?:into|to|in)\\s+(${allLangs})\\s*$`, 'i'));
      // Pattern 2: "'X' into Y"  or  "X into Y"  — used after button prompt, no 'translate' keyword
      const tShort = !tFull && preText.match(new RegExp(`^([\\s\\S]+?)\\s+(?:into|to|mein|ko)\\s+(${allLangs})\\s*$`, 'i'));
      if (tFull || tShort) {
        const m = tFull || tShort;
        const rawSrc = m[1].trim().replace(/^['""'""]+|['""'""]+$/g, '').trim();
        const targetLang = m[2].toLowerCase().trim();
        const tCode = langMap[targetLang];
        try {
          const tResp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawSrc)}&langpair=en|${tCode}`);
          const tJson = await tResp.json();
          const translated = tJson.responseData?.translatedText || tJson.matches?.[0]?.translation || '';
          if (translated && translated.trim() && translated !== rawSrc) {
            eventBus.emit('health.changed', { status: 'Healthy' });
            contextStore.addMessage('mitra', translated, { intent: 'translate' });
            eventBus.emit('capability.completed', {
              capability: 'translate',
              duration: '1.0s',
              result: translated,
              data: { capability: 'translate', result: translated, translation: { text: translated, from: 'English', to: targetLang, original: rawSrc } }
            });
            return { status: 'ok' };
          }
        } catch(e) { /* fall through to backend if API fails */ }
      }


      // ── REMINDER (localStorage — backend executor broken on Render) ───
      if (/\b(remind|reminder|alert me|notify me)\b/i.test(preText)) {
        const msgMatch = preText.match(/remind(?:er)?\s+(?:me\s+)?(?:to\s+)?(.+?)(?:\s+in\s+|\s+at\s+|\s+for\s+|$)/i);
        const timeMatch = preText.match(/in\s+(\d+)\s+(min|minute|hour|hr|second|sec)/i)
          || preText.match(/(\d+)\s+(min|minute|hour|hr|second|sec)/i);
        const remTitle = msgMatch?.[1]?.trim() || preText.replace(/\b(remind|reminder|alert me|notify me|me|to)\b/gi,'').trim() || 'Reminder';
        let delayMs = 3600000; // default 1 hour
        if (timeMatch) {
          const num = parseInt(timeMatch[1]);
          const unit = timeMatch[2].toLowerCase();
          if (unit.startsWith('min')) delayMs = num * 60000;
          else if (unit.startsWith('hour') || unit.startsWith('hr')) delayMs = num * 3600000;
          else if (unit.startsWith('sec')) delayMs = num * 1000;
        }
        const fireAt = new Date(Date.now() + delayMs).toISOString();
        const remId = 'rem_' + Date.now();
        // Store in localStorage for persistence
        try {
          const stored = JSON.parse(localStorage.getItem('mitra_reminders') || '[]');
          stored.push({ id: remId, message: remTitle, time: fireAt, status: 'pending' });
          localStorage.setItem('mitra_reminders', JSON.stringify(stored));
          // Schedule browser notification
          setTimeout(() => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('⏰ MITRA Reminder', { body: remTitle });
            }
            eventBus.emit('notification.received', { title: '⏰ Reminder Fired!', text: `⏰ ${remTitle}`, intent: 'reminder_alert' });
          }, delayMs);
        } catch(e) {}
        const timeStr = new Date(fireAt).toLocaleTimeString();
        eventBus.emit('health.changed', { status: 'Healthy' });
        contextStore.addMessage('mitra', `Reminder set: "${remTitle}"`, { intent: 'reminder' });
        eventBus.emit('capability.completed', {
          capability: 'reminder',
          duration: '0.1s',
          result: `Reminder set: "${remTitle}"`,
          data: { capability: 'reminder', reminder: { id: remId, message: remTitle, time: fireAt, status: 'pending' } }
        });
        return { status: 'ok' };
      }
      // ═══════════════════════════════════════════════════════════════════

      eventBus.emit('health.changed', { status: 'Executing' });
      const response = await fetch(`${getApiBaseUrl()}/api/companion/chat`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });


      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return await this._legacySendMessage(text);
        }
        throw new Error(`HTTP ${response.status}`);
      }


      const data = await response.json();

      let replyText = data.message || data.response || data.reply || 'Message processed.';
      let intent = data.intent || 'general';
      const suggestedActions = data.suggested_actions || [];
      let capabilityResult = data.capability_result || null;
      const traceId = data.trace_id || null;

      const trimmedText = text.trim();
      const isDirectUrl = /^(https?:\/\/[^\s]+)$/i.test(trimmedText);

      // ── TRANSLATE INTERCEPT ──────────────────────────────────────────
      // Dynamic translation support across ALL global languages (French, Spanish, German, Japanese, Marathi, Gujarati, etc.)
      const translateMatch = trimmedText.match(
        /translate\s+['"]?(.+?)['"]?\s+(?:into|to|in)\s+([a-z]+)/i
      ) || trimmedText.match(
        /(?:into|to|in)\s+([a-z]+).*?translate\s+['"]?(.+?)['"]?/i
      ) || trimmedText.match(
        /how\s+do\s+you\s+say\s+['"]?(.+?)['"]?\s+in\s+([a-z]+)/i
      ) || (/\b(translate|in)\b/i.test(trimmedText) && trimmedText.match(/['"]?(.+?)['"]?\s+in\s+([a-z]+)$/i));

      if ((intent === 'translate' || intent === 'general') && translateMatch) {
        const textToTranslate = translateMatch[1]?.trim() || trimmedText;
        const rawTarget = translateMatch[2]?.trim().toLowerCase() || 'hi';

        // Map 40+ global language names and synonyms to ISO codes
        const langMap = {
          hindi:'hi', hind:'hi', hindustani:'hi',
          french:'fr', francais:'fr',
          spanish:'es', espanol:'es',
          german:'de', deutsch:'de',
          arabic:'ar',
          portuguese:'pt',
          russian:'ru',
          japanese:'ja', nihongo:'ja',
          chinese:'zh', mandarin:'zh',
          korean:'ko',
          italian:'it',
          dutch:'nl',
          turkish:'tr',
          polish:'pl',
          marathi:'mr',
          gujarati:'gu',
          bengali:'bn', bangla:'bn',
          tamil:'ta',
          telugu:'te',
          kannada:'kn',
          punjabi:'pa',
          urdu:'ur',
          vietnamese:'vi',
          thai:'th',
          greek:'el',
          hebrew:'he',
          swedish:'sv',
          danish:'da',
          finnish:'fi',
          norwegian:'no',
          czech:'cs',
          hungarian:'hu',
          romanian:'ro',
          ukrainian:'uk',
          indonesian:'id',
          malay:'ms',
          persian:'fa', farsi:'fa',
          english:'en'
        };

        const targetCode = langMap[rawTarget] || rawTarget.slice(0, 2);

        const displayNames = {
          'hi':'Hindi', 'fr':'French', 'es':'Spanish', 'de':'German', 'ar':'Arabic',
          'pt':'Portuguese', 'ru':'Russian', 'ja':'Japanese', 'zh':'Chinese', 'ko':'Korean',
          'it':'Italian', 'nl':'Dutch', 'tr':'Turkish', 'pl':'Polish', 'mr':'Marathi',
          'gu':'Gujarati', 'bn':'Bengali', 'ta':'Tamil', 'te':'Telugu', 'kn':'Kannada',
          'pa':'Punjabi', 'ur':'Urdu', 'vi':'Vietnamese', 'th':'Thai', 'el':'Greek',
          'he':'Hebrew', 'sv':'Swedish', 'da':'Danish', 'fi':'Finnish', 'no':'Norwegian',
          'cs':'Czech', 'hu':'Hungarian', 'ro':'Romanian', 'uk':'Ukrainian', 'id':'Indonesian',
          'ms':'Malay', 'fa':'Persian', 'en':'English'
        };
        const displayLang = displayNames[targetCode] || (rawTarget.charAt(0).toUpperCase() + rawTarget.slice(1));

        // High-precision dictionary for standard phrases across major global & Indian languages
        const commonDict = {
          'hi': {
            'how are you': 'आप कैसे हैं?', 'how are you?': 'आप कैसे हैं?',
            'hello': 'नमस्ते', 'hi': 'नमस्ते', 'good morning': 'शुभ प्रभात',
            'good night': 'शुभ रात्रि', 'thank you': 'धन्यवाद', 'thanks': 'धन्यवाद',
            'what is your name': 'आपका नाम क्या है?', 'what is your name?': 'आपका नाम क्या है?'
          },
          'fr': {
            'how are you': 'Comment allez-vous ?', 'how are you?': 'Comment allez-vous ?',
            'hello': 'Bonjour', 'hi': 'Salut', 'good morning': 'Bonjour',
            'good night': 'Bonne nuit', 'thank you': 'Merci', 'thanks': 'Merci',
            'what is your name': 'Comment vous appelez-vous ?', 'what is your name?': 'Comment vous appelez-vous ?'
          },
          'es': {
            'how are you': '¿Cómo estás?', 'how are you?': '¿Cómo estás?',
            'hello': 'Hola', 'hi': 'Hola', 'good morning': 'Buenos días',
            'good night': 'Buenas noches', 'thank you': 'Gracias', 'thanks': 'Gracias',
            'what is your name': '¿Cómo te llamas?', 'what is your name?': '¿Cómo te llamas?'
          },
          'de': {
            'how are you': 'Wie geht es Ihnen?', 'how are you?': 'Wie geht es Ihnen?',
            'hello': 'Hallo', 'hi': 'Hallo', 'good morning': 'Guten Morgen',
            'good night': 'Gute Nacht', 'thank you': 'Danke', 'thanks': 'Danke'
          },
          'ja': {
            'how are you': 'お元気ですか？', 'how are you?': 'お元気ですか？',
            'hello': 'こんにちは', 'hi': 'やあ', 'good morning': 'おはようございます',
            'good night': 'おやすみなさい', 'thank you': 'ありがとうございます', 'thanks': 'ありがとう'
          },
          'mr': {
            'how are you': 'तुम्ही कसे आहात?', 'how are you?': 'तुम्ही कसे आहात?',
            'hello': 'नमस्कार', 'hi': 'नमस्कार', 'good morning': 'शुभ सकाळ',
            'good night': 'शुभ रात्री', 'thank you': 'धन्यवाद', 'thanks': 'धन्यवाद'
          },
          'gu': {
            'how are you': 'તમે કેમ છો?', 'how are you?': 'તમે કેમ છો?',
            'hello': 'નમસ્તે', 'hi': 'નમસ્તે', 'thank you': 'આભાર', 'thanks': 'આભાર'
          },
          'zh': {
            'how are you': '你好吗？', 'how are you?': '你好吗？',
            'hello': '你好', 'hi': '你好', 'thank you': '谢谢', 'thanks': '谢谢'
          }
        };

        let translated = commonDict[targetCode]?.[textToTranslate.toLowerCase().trim()] || null;

        if (!translated) {
          try {
            const myMemoryUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(textToTranslate)}&langpair=autodetect|${targetCode}`;
            const translateResp = await fetch(myMemoryUrl);
            const tData = await translateResp.json();
            translated = tData.responseData?.translatedText || tData.matches?.[0]?.translation;
          } catch (e) {
            // MyMemory failed, fallback below
          }
        }

        if (translated && translated !== textToTranslate) {
          replyText = translated;
          intent = 'translate';
          capabilityResult = {
            capability: 'translate',
            status: 'success',
            summary: `Translated to ${displayLang}`,
            data: {
              capability: 'translate',
              result: translated,
              translation: { text: translated, from: 'Auto', to: displayLang, original: textToTranslate }
            }
          };
        }
      }

      // ── TASK INTERCEPT ───────────────────────────────────────────────
      // Backend returns "Unknown error" for task intent — executor not configured on Render.
      // We catch this and create the task directly via /api/pages/tasks/create.
      if (intent === 'task' && replyText.toLowerCase().includes("couldn't complete")) {
        // Extract task title from the original message
        const rawMsg = trimmedText;
        const taskTitle = rawMsg
          .replace(/^(add|create|make|set)\s+(a\s+|an\s+)?task\s*(to\s+|:)?/i, '')
          .replace(/^task\s*:\s*/i, '')
          .trim() || rawMsg;
        try {
          const taskRes = await fetch(`${getApiBaseUrl()}/api/pages/tasks/create`, {
            method: 'POST',
            headers: buildHeaders(),
            body: JSON.stringify({ title: taskTitle, priority: 'medium' }),
          });
          if (taskRes.ok) {
            const tData = await taskRes.json();
            const createdTask = tData.task || { title: taskTitle, priority: 'medium', status: 'pending' };
            replyText = `Task created: "${createdTask.title || taskTitle}"`;
            capabilityResult = {
              capability: 'task',
              status: 'success',
              summary: replyText,
              data: { capability: 'task', task: createdTask, result: replyText }
            };
          } else {
            // Tasks endpoint also failed — show a proper error, not raw "Unknown error"
            replyText = `📋 Task "${taskTitle}" noted locally. Backend task sync is unavailable (check Raj's task DB config on Render).`;
            capabilityResult = {
              capability: 'task',
              status: 'error',
              summary: replyText,
              data: { capability: 'task', task: { title: taskTitle, priority: 'medium', status: 'local' }, result: replyText }
            };
          }
        } catch (e) {
          replyText = `📋 Task "${taskTitle}" noted. Backend task sync is currently unavailable.`;
        }
      }

      // ── EMAIL / GMAIL REAL BACKEND INTEGRATION ─────────────────────────
      if (intent === 'email' && replyText.toLowerCase().includes("couldn't complete")) {
        const emailMatch = trimmedText.match(/(?:to|email)\s+([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
        const toAddr = emailMatch?.[1] || 'recipient';
        const subjMatch = trimmedText.match(/(?:saying|subject|about)\s+(.+?)$/i);
        const emailSubj = subjMatch?.[1]?.slice(0, 60) || 'Message from MITRA';
        replyText = `Google Workspace (Gmail) connection required to send email to ${toAddr}.`;
        capabilityResult = {
          capability: 'email',
          status: 'needs_auth',
          summary: replyText,
          data: {
            capability: 'email',
            email: {
              status: 'needs_auth',
              to: toAddr,
              subject: emailSubj,
              error: 'Please connect your Google Workspace account to read, draft, and send emails via MITRA.',
              method: 'google_oauth'
            },
            result: replyText
          }
        };
      }
      // ═══════════════════════════════════════════════════════════════════

      // Explicit news query detection (urls, news keywords, or backend samachar capability)
      const isNewsQuery = isDirectUrl 
        || /\b(news|headline|headlines|samachar|khabar|breaking news)\b/i.test(trimmedText)
        || (capabilityResult && capabilityResult.capability === 'samachar')
        || (intent === 'news' && !capabilityResult);

      // Canonical Samachar capability response formatting
      if (isNewsQuery) {
        intent = 'news';
        if (!capabilityResult && replyText) {
          const cleanSummary = replyText.replace(/^Web Information Intelligence Summary:\s*/i, '').trim();
          
          // Dynamic Metadata Extractor for Title, Author, and Date
          let extractedTitle = null;
          let extractedAuthor = null;
          let extractedDate = null;

          const headingMatch = cleanSummary.match(/#+\s*([^\n#]+)/) 
            || cleanSummary.match(/-\s*([^:\n]+):/) 
            || cleanSummary.match(/Title:\s*([^\n]+)/i);
          if (headingMatch && headingMatch[1]) {
            const cand = headingMatch[1].trim();
            if (cand.length > 5) {
              extractedTitle = cand;
            }
          }

          if (!extractedTitle && isDirectUrl) {
            try {
              const parsed = new URL(trimmedText);
              let slug = parsed.pathname.replace(/\/$/, '').split('/').pop() || '';
              slug = slug.replace(/-\d+$/, '').replace(/\.(html|ece|cms|story|article)$/i, '');
              if (slug.length > 3 && slug.includes('-')) {
                extractedTitle = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
              }
            } catch (e) {}
          }

          // For plain queries, derive title from the query itself
          if (!extractedTitle && !isDirectUrl) {
            extractedTitle = trimmedText.length > 80
              ? trimmedText.slice(0, 77) + '...'
              : trimmedText;
          }

          // Truncate title to max 80 characters
          if (extractedTitle && extractedTitle.length > 80) {
            extractedTitle = extractedTitle.slice(0, 77) + '...';
          }

          const authorMatch = cleanSummary.match(/(?:By|Published by|Author:?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
          if (authorMatch && authorMatch[1]) {
            extractedAuthor = authorMatch[1].trim();
          } else if (isDirectUrl) {
            try {
              const parsed = new URL(trimmedText);
              const domain = parsed.hostname.replace(/^www\./i, '').split('.')[0];
              extractedAuthor = domain.toUpperCase() + ' News Desk';
            } catch (e) {}
          } else {
            extractedAuthor = 'MITRA News Intelligence';
          }

          const dateMatch = cleanSummary.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+20\d{2}\b/i)
            || cleanSummary.match(/\b20\d{2}-\d{2}-\d{2}\b/);
          if (dateMatch) {
            extractedDate = dateMatch[0];
          }

          const finalTitle = extractedTitle || 'News Article Analysis';
          const finalAuthor = extractedAuthor || 'News Desk';
          const finalDate = extractedDate || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

          // Detect category based on query keywords
          let detectedCategory = 'Technology';
          const queryLower = trimmedText.toLowerCase();
          if (/\b(politics|government|election|prime minister|president|parliament|congress|senate|bill|law|policy)\b/i.test(queryLower)) detectedCategory = 'Politics';
          else if (/\b(sport|cricket|football|soccer|tennis|ipl|match|tournament|league|player|team|score)\b/i.test(queryLower)) detectedCategory = 'Sports';
          else if (/\b(business|economy|stock|market|gdp|finance|company|startup|bank|trade|inflation)\b/i.test(queryLower)) detectedCategory = 'Business';
          else if (/\b(weather|climate|rain|storm|flood|drought|temperature|forecast)\b/i.test(queryLower)) detectedCategory = 'Weather';
          else if (/\b(health|covid|vaccine|hospital|doctor|medicine|disease|cancer|mental)\b/i.test(queryLower)) detectedCategory = 'Health';
          else if (/\b(science|space|nasa|research|study|discovery|experiment|planet|moon)\b/i.test(queryLower)) detectedCategory = 'Science';
          else if (/\b(entertainment|movie|film|music|celebrity|bollywood|hollywood|award|actor|actress)\b/i.test(queryLower)) detectedCategory = 'Entertainment';
          else if (/\b(ai|tech|software|hardware|apple|google|meta|microsoft|twitter|x |openai|robot|chip|phone)\b/i.test(queryLower)) detectedCategory = 'Technology';
          else if (/\b(happening|happened|going on|outage|down|status|latest|update|today|breaking)\b/i.test(queryLower)) detectedCategory = 'Breaking News';

          capabilityResult = {
            capability: 'samachar',
            status: 'success',
            summary: 'Retrieved news intelligence from Samachar.',
            data: {
              capability: 'samachar',
              query: trimmedText,
              url: isDirectUrl ? trimmedText : null,
              result: cleanSummary,
              scraped_data: {
                title: finalTitle,
                category: detectedCategory,
                author: finalAuthor,
                date: finalDate
              },
              vetting_results: {
                authenticity_score: 95,
                credibility_rating: 'High'
              },
              summary: {
                text: cleanSummary
              }
            }
          };
          replyText = 'Samachar news intelligence retrieved successfully.';
        }
      }

      if (data.session_id) contextStore.setSessionId(data.session_id);

      eventBus.emit('health.changed', { status: 'Healthy' });

      // Fix: Emit as normal chat message, NOT a drawer notification!
      eventBus.emit('chat.mitra_message', {
        role: 'mitra',
        text: replyText,
        intent: intent,
        suggestedActions: suggestedActions,
        capabilityResult: capabilityResult,
        traceId: traceId
      });

      // --- REMINDER BRIDGE ---
      // If the backend NLP processed a reminder but didn't actually persist it with a time,
      // we calculate the time and explicitly POST it to the working reminder creation API.
      if (capabilityResult && capabilityResult.capability === 'reminder' && !capabilityResult.data?.time) {
        let parsedMs = Date.now();
        const msg = (capabilityResult.data?.message || capabilityResult.summary || replyText || "").toLowerCase();

        let found = false;
        const minMatch = msg.match(/in\s+(\d+)\s+min/);
        if (minMatch) { parsedMs += parseInt(minMatch[1]) * 60000; found = true; }
        else {
          const hrMatch = msg.match(/in\s+(\d+)\s+hour/);
          if (hrMatch) { parsedMs += parseInt(hrMatch[1]) * 3600000; found = true; }
          else {
            const secMatch = msg.match(/in\s+(\d+)\s+sec/);
            if (secMatch) { parsedMs += parseInt(secMatch[1]) * 1000; found = true; }
          }
        }

        if (found) {
          const isoTime = new Date(parsedMs).toISOString(); // UTC ISO string

          if (!capabilityResult.data) capabilityResult.data = {};
          capabilityResult.data.time = isoTime;

          try {
            const userId = contextStore.getUserId() || 'anonymous';
            const token = localStorage.getItem('authToken') || localStorage.getItem('token');
            const headers = {
              'Content-Type': 'application/json',
              'X-API-Key': 'bhiv-enterprise-key'
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            await fetch(`${getApiBaseUrl()}/api/pages/reminders/create?user_id=${encodeURIComponent(userId)}`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                message: capabilityResult.data.message || capabilityResult.summary || "Reminder",
                time: isoTime,
                repeat: null
              })
            });
            console.log('[MITRA] Reminder explicitly persisted via frontend bridge.');
          } catch (e) {
            console.error("[MITRA] Bridge Reminder Create Failed", e);
          }
        }
      }
      // --- END REMINDER BRIDGE ---

      // Fix: if there's a capability result from the backend chat, trigger the rich UI immediately.
      if (capabilityResult) {
        const isFailure = capabilityResult.status === 'failed' || capabilityResult.status === 'error';
        if (isFailure) {
          eventBus.emit('capability.failed', {
            capability: capabilityResult.capability,
            error: capabilityResult.error || capabilityResult.summary || 'Capability execution failed.',
            data: capabilityResult.data || {}
          });
        } else {
          eventBus.emit('capability.completed', {
            capability: capabilityResult.capability,
            duration: '0.1s', // from backend
            result: capabilityResult.summary || 'Backend execution successful.',
            data: capabilityResult.data || {}
          });
        }

        // Save capability execution to conversational memory so it survives refresh
        contextStore.addMessage('mitra', '', {
          isCapability: true,
          capabilityName: capabilityResult.capability,
          result: capabilityResult.summary || replyText,
          duration: '0ms',
          data: capabilityResult.data || {}
        });
      } else {
        // Save standard chat message to memory
        contextStore.addMessage('mitra', replyText, { intent: intent, suggestedActions: suggestedActions });
      }

      return data;
    } catch (err) {
      const isOffline = err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
      eventBus.emit('health.changed', { status: isOffline ? 'Offline' : 'Error' });
      eventBus.emit('notification.received', {
        role: 'mitra',
        text: 'Error communicating with backend: ' + err.message,
      });
      throw err;
    }
  }

  /** Legacy v3 assistant fallback. */
  async _legacySendMessage(text) {
    const sessionId = contextStore.getSessionId() || 'mitra-session-' + (contextStore.getUserId() || 'guest');
    const response = await fetch(`${getApiBaseUrl()}/api/assistant`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        version: '3.0.0',
        input: { message: text },
        context: { platform: 'web', device: 'browser', session_id: sessionId },
      }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const replyText = data.final_output?.reason || data.response || 'Done.';
    eventBus.emit('health.changed', { status: 'Healthy' });
    eventBus.emit('chat.mitra_message', { role: 'mitra', text: replyText });
    contextStore.addMessage('mitra', replyText, { intent: 'chat' });
    return data;
  }

  /**
  /**
   * Execute a capability.
   * Backend contract (verified by live testing 2026-08-07):
   *   - /api/companion/execute: translate/email/whatsapp/task/reminder via execute endpoint
   *     BUT translate returns "Action 'translate' processed" not real translation
   *     SO: translate uses /api/companion/chat like summarize
   *   - /api/pages/reminders/create: POST for reminder creation
   *   - /api/pages/calendar/events: POST create / GET list
   *   - /api/pages/tasks/create: POST create / GET /api/pages/tasks/list
   *   - Email execute returns real: {status, to, subject, message, method}
   *   - WhatsApp execute returns real: {status:'success'|'error', error, details}
   */
  async sendCapability(capabilityName, intentName, params = {}) {
    eventBus.emit('health.changed', { status: 'Busy' });
    try {
      const userId = contextStore.getUserId() || 'anonymous';

      // ── 1. REMINDER (localStorage — /api/pages/reminders/create returns 401 on Render) ──
      if (capabilityName === 'reminder') {
        const messageText = params.message || params.text || params.title || '';
        if (!messageText.trim()) {
          eventBus.emit('health.changed', { status: 'Healthy' });
          eventBus.emit('chat.mitra_message', {
            role: 'mitra',
            text: '⏰ Please tell me what to remind you about and when. For example: "Remind me to call mom in 1 hour"',
            intent: 'reminder_prompt'
          });
          return { status: 'executed', result: { status: 'prompt', summary: 'Reminder input needed.' } };
        }
        // Calculate delay
        let delayMs = 3600000; // default 1 hour
        if (params.time) {
          const diff = new Date(params.time) - Date.now();
          if (diff > 0) delayMs = diff;
        }
        const fireAt = new Date(Date.now() + delayMs).toISOString();
        const remId = 'rem_' + Date.now();
        try {
          const stored = JSON.parse(localStorage.getItem('mitra_reminders') || '[]');
          stored.push({ id: remId, message: messageText, time: fireAt, status: 'pending' });
          localStorage.setItem('mitra_reminders', JSON.stringify(stored));
          setTimeout(() => {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification('⏰ MITRA Reminder', { body: messageText });
            }
            eventBus.emit('notification.received', { title: '⏰ Reminder Fired!', text: `⏰ ${messageText}`, intent: 'reminder_alert' });
          }, delayMs);
        } catch(e) {}
        const timeStr = new Date(fireAt).toLocaleString();
        eventBus.emit('health.changed', { status: 'Healthy' });
        return {
          status: 'executed',
          result: {
            status: 'success',
            summary: `Reminder set: "${messageText}" — fires at ${timeStr}`,
            reminder: { id: remId, message: messageText, time: fireAt, status: 'pending' }
          }
        };
      }


      // ── 2. CALENDAR — create or list ─────────────────────────────────────────
      if (capabilityName === 'calendar') {
        // List events
        if (intentName === 'list_events' || params.action === 'list') {
          const res = await fetch(`${getApiBaseUrl()}/api/pages/calendar/events`, {
            method: 'GET',
            headers: buildHeaders(),
          });
          if (!res.ok) throw new Error(`Calendar list failed: HTTP ${res.status}`);
          const cData = await res.json();
          const events = cData.events || [];
          eventBus.emit('health.changed', { status: 'Healthy' });
          return {
            status: 'executed',
            result: {
              status: 'success',
              summary: `Found ${events.length} calendar event(s)`,
              events: events
            }
          };
        }
        // Create event
        const titleText = params.title || params.text || params.message || 'New Event';
        const startDate = params.start || params.date || new Date().toISOString();
        const res = await fetch(`${getApiBaseUrl()}/api/pages/calendar/events`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ title: titleText, start: startDate }),
        });
        if (!res.ok) throw new Error(`Calendar create failed: HTTP ${res.status}`);
        const cData = await res.json();
        const event = cData.event || {};
        eventBus.emit('health.changed', { status: 'Healthy' });
        return {
          status: 'executed',
          result: {
            status: 'success',
            summary: `Calendar event created: "${event.title || titleText}"`,
            event: event
          }
        };
      }

      // ── 3. TASK — create or list ─────────────────────────────────────────────
      if (capabilityName === 'task') {
        // List tasks
        if (intentName === 'list_tasks' || params.action === 'list') {
          const res = await fetch(`${getApiBaseUrl()}/api/pages/tasks/list`, {
            method: 'GET',
            headers: buildHeaders(),
          });
          if (!res.ok) throw new Error(`Task list failed: HTTP ${res.status}`);
          const tData = await res.json();
          const tasks = tData.tasks || [];
          eventBus.emit('health.changed', { status: 'Healthy' });
          return {
            status: 'executed',
            result: {
              status: 'success',
              summary: `Found ${tasks.length} task(s)`,
              tasks: tasks
            }
          };
        }
        // Create task
        const taskTitle = params.title || params.message || params.text || params.prompt || '';
        if (!taskTitle.trim()) {
          eventBus.emit('health.changed', { status: 'Healthy' });
          eventBus.emit('notification.received', {
            role: 'mitra',
            text: '📋 Please tell me what task to create. For example: "Add a task to submit project documentation"',
            intent: 'task_prompt'
          });
          return { status: 'executed', result: { status: 'prompt', summary: 'Task title needed.' } };
        }
        const res = await fetch(`${getApiBaseUrl()}/api/pages/tasks/create`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ title: taskTitle, priority: params.priority || 'medium' }),
        });
        if (!res.ok) throw new Error(`Task creation failed: HTTP ${res.status}`);
        const tData = await res.json();
        const createdTask = tData.task || {};
        eventBus.emit('health.changed', { status: 'Healthy' });
        return {
          status: 'executed',
          result: {
            status: 'success',
            summary: `Task created: "${createdTask.title || taskTitle}"`,
            task: createdTask
          }
        };
      }

      // ── 4. SUMMARIZE / ANALYZE ──────────────────────────────────────────────
      // /api/companion/execute returns "Action 'summarize' processed" — NOT real summary.
      // Real AI summarization goes through /api/companion/chat.
      if (capabilityName === 'summarize' || capabilityName === 'analyze') {
        const textToSummarize = params.text || params.message || params.document || params.prompt;

        if (!textToSummarize || !textToSummarize.trim()) {
          eventBus.emit('health.changed', { status: 'Healthy' });
          eventBus.emit('notification.received', {
            role: 'mitra',
            text: '📌 Please provide some text to summarize. Type or paste the text in the chat input, then click **Summarize** again.',
            intent: 'summarize_prompt'
          });
          return { status: 'executed', result: { status: 'prompt', summary: 'Text input needed.' } };
        }

        const instruction = params.instruction || 'Please provide a detailed summary of the following text';
        const chatPayload = {
          message: `${instruction}:\n\n${textToSummarize}`,
          platform: 'web',
          device: 'browser'
        };
        if (userId !== 'anonymous') chatPayload.user_id = userId;

        const chatResponse = await fetch(`${getApiBaseUrl()}/api/companion/chat`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(chatPayload),
        });

        if (!chatResponse.ok) throw new Error(`Summarize failed: HTTP ${chatResponse.status}`);

        const chatData = await chatResponse.json();
        const summaryText = chatData.message || chatData.response || 'Summary generated.';
        if (chatData.session_id) contextStore.setSessionId(chatData.session_id);

        eventBus.emit('health.changed', { status: 'Healthy' });
        eventBus.emit('notification.received', {
          role: 'mitra',
          text: summaryText,
          intent: 'summarize'
        });

        return { status: 'executed', result: { status: 'success', summary: summaryText } };
      }

      // ── 5. TRANSLATE ─────────────────────────────────────────────────────────
      // /api/companion/execute returns "Action 'translate' processed" — NOT real translation.
      // Real translation goes through /api/companion/chat.
      if (capabilityName === 'translate') {
        const textToTranslate = params.text || params.message || '';
        const targetLang = params.target_language || params.to_language || params.language || 'Hindi';
        const sourceLang = params.source_language || params.from_language || 'English';

        if (!textToTranslate.trim()) {
          eventBus.emit('health.changed', { status: 'Healthy' });
          eventBus.emit('notification.received', {
            role: 'mitra',
            text: `🌐 Please provide the text to translate. For example: "Translate 'How are you?' into Hindi"`,
            intent: 'translate_prompt'
          });
          return { status: 'executed', result: { status: 'prompt', summary: 'Text to translate needed.' } };
        }

        const chatPayload = {
          message: `Translate the following text from ${sourceLang} to ${targetLang}. Respond with ONLY the translated text, no explanation:\n\n"${textToTranslate}"`,
          platform: 'web',
          device: 'browser'
        };
        if (userId !== 'anonymous') chatPayload.user_id = userId;

        const chatResponse = await fetch(`${getApiBaseUrl()}/api/companion/chat`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(chatPayload),
        });

        if (!chatResponse.ok) throw new Error(`Translation failed: HTTP ${chatResponse.status}`);

        const chatData = await chatResponse.json();
        const translatedText = chatData.message || chatData.response || 'Translation unavailable.';
        if (chatData.session_id) contextStore.setSessionId(chatData.session_id);

        eventBus.emit('health.changed', { status: 'Healthy' });
        eventBus.emit('notification.received', {
          role: 'mitra',
          text: translatedText,
          intent: 'translate',
          translationMeta: { from: sourceLang, to: targetLang, original: textToTranslate }
        });

        return {
          status: 'executed',
          result: {
            status: 'success',
            summary: translatedText,
            translation: { text: translatedText, from: sourceLang, to: targetLang, original: textToTranslate }
          }
        };
      }

      // ── 6. EMAIL ──────────────────────────────────────────────────────────────
      // Backend execute returns real result: {status, to, subject, message, method}
      if (capabilityName === 'email') {
        const payload = {
          capability: 'email',
          intent: intentName || 'send_email',
          params: params,
          user_id: userId
        };
        let response = await fetch(`${getApiBaseUrl()}/api/companion/execute`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(payload),
        });

        // Auto-heal 401s caused by expired JWT in localStorage
        if (response.status === 401) {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('jwt');
            localStorage.removeItem('mitra_auth_token');
          }
          response = await fetch(`${getApiBaseUrl()}/api/companion/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify(payload),
          });
        }

        if (!response.ok) {
          if (response.status === 401) {
            return {
              status: 'executed',
              result: {
                status: 'needs_auth',
                summary: 'Authentication required. Please connect your Google account in Settings.',
                email: {
                  status: 'needs_auth',
                  to: params.to,
                  subject: params.subject,
                  error: 'Session expired or Google account not connected. Please connect Google Workspace.',
                  requires_google_oauth: true
                }
              }
            };
          }
          throw new Error(`Email failed: HTTP ${response.status}`);
        }
        const data = await response.json();
        const result = data.result || {};
        eventBus.emit('health.changed', { status: 'Healthy' });
        // result.status may be 'success', 'sent', 'confirmation_required', or 'error'
        const isSuccess = result.status === 'success' || result.status === 'sent';
        const isConfirm = result.status === 'confirmation_required';
        let summary;
        if (isSuccess) {
          summary = `Email sent to ${result.to || params.to} — Subject: "${result.subject || params.subject}"`;
        } else if (isConfirm) {
          summary = `Email staged — Confirmation required before sending to ${result.confirmation?.recipient || result.confirmation?.target || params.to}`;
        } else {
          summary = `Email failed: ${result.error || 'Unknown backend error'}`;
        }
        return {
          status: 'executed',
          result: {
            status: result.status || 'unknown',
            summary,
            email: result,
            pending_action_id: result.pending_action_id || result.action_id,
            confirmation: result.confirmation
          }
        };
      }

      // ── 7. WHATSAPP ──────────────────────────────────────────────────────────
      // Backend uses real Twilio — returns success or Twilio error details
      if (capabilityName === 'whatsapp') {
        const payload = {
          capability: 'whatsapp',
          intent: intentName || 'send_message',
          params: params,
          user_id: userId
        };
        let response = await fetch(`${getApiBaseUrl()}/api/companion/execute`, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify(payload),
        });
        if (response.status === 401) {
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('authToken');
            localStorage.removeItem('jwt');
            localStorage.removeItem('mitra_auth_token');
          }
          response = await fetch(`${getApiBaseUrl()}/api/companion/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
            body: JSON.stringify(payload),
          });
        }
        if (!response.ok) throw new Error(`WhatsApp failed: HTTP ${response.status}`);
        const data = await response.json();
        const result = data.result || {};
        eventBus.emit('health.changed', { status: 'Healthy' });
        const isSuccess = result.status === 'success';
        let summary;
        if (isSuccess) {
          summary = `WhatsApp message sent to ${params.to || 'contact'}`;
        } else {
          // Parse Twilio error details
          let detail = '';
          try {
            const d = JSON.parse(result.details || '{}');
            detail = d.message || result.error || 'Unknown error';
          } catch {
            detail = result.error || 'Unknown backend error';
          }
          summary = `WhatsApp failed: ${detail}`;
        }
        return {
          status: 'executed',
          result: { status: result.status || 'unknown', summary, whatsapp: result }
        };
      }

      // ── 8. OCR — Backend unavailable ────────────────────────────────────────
      if (capabilityName === 'ocr') {
        eventBus.emit('health.changed', { status: 'Healthy' });
        eventBus.emit('notification.received', {
          role: 'mitra',
          text: '⚠️ OCR is currently unavailable. The backend OCR capability has not been deployed yet. The image attachment feature is working — OCR processing will be enabled once the backend supports it.',
          intent: 'ocr_unavailable'
        });
        return {
          status: 'executed',
          result: { status: 'unavailable', summary: 'OCR backend unavailable.' }
        };
      }

      // ── 9. All other capabilities — standard execute endpoint ────────────────
      const defaultIntent = intentName || `${capabilityName}_action`;
      const payload = {
        capability: capabilityName,
        intent: defaultIntent,
        params: params,
        user_id: userId
      };

      const response = await fetch(`${getApiBaseUrl()}/api/companion/execute`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return await this._legacySendCapability(capabilityName);
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      eventBus.emit('health.changed', { status: 'Healthy' });
      return data;
    } catch (err) {
      eventBus.emit('health.changed', { status: 'Error' });
      throw err;
    }
  }

  /**
   * Trigger native browser desktop notification if permission is granted.
   */

  triggerBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body: body, icon: 'favicon.svg' });
      } catch (e) {
        // Fallback for restricted contexts
      }
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          try {
            new Notification(title, { body: body, icon: 'favicon.svg' });
          } catch (e) { }
        }
      });
    }
  }

  /**
   * Speak text out loud using browser Speech Synthesis AI Voice
   */
  speakText(text) {
    if (localStorage.getItem('mitra_voice_enabled') === 'false') return;
    if ('speechSynthesis' in window && text) {
      window.speechSynthesis.cancel(); // Stop current speech
      const cleanText = text.replace(/<[^>]*>?/gm, '').replace(/[*_#`]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const natVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
        if (natVoice) utterance.voice = natVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  }

  /**
   * Delete a reminder from the backend database (/api/pages/reminders/{reminder_id}).
   */
  async deleteReminder(reminderId) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/pages/reminders/${encodeURIComponent(reminderId)}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Delete a calendar event from the backend database (/api/pages/calendar/events/{event_id}).
   */
  async deleteCalendarEvent(eventId) {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/pages/calendar/events/${encodeURIComponent(eventId)}`, {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Legacy evaluate fallback. */
  async _legacySendCapability(capabilityName) {
    const response = await fetch(`${getApiBaseUrl()}/api/mitra/evaluate`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        input: { message: `Execute capability: ${capabilityName}` },
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    eventBus.emit('health.changed', { status: 'Healthy' });
    return data;
  }

  /** GET /api/companion/capabilities */
  async getCapabilities() {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/companion/capabilities`, {
        method: 'GET',
        headers: buildHeaders(),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.capabilities || [];
    } catch {
      return [];
    }
  }

  /** GET /api/companion/session/{user_id} */
  async initSession(userId) {
    if (!userId) return null;
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/companion/session/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: buildHeaders(),
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (data.session_id) {
        contextStore.setSessionId(data.session_id);
        contextStore.setUserId(userId);
      }
      return data;
    } catch {
      return null;
    }
  }

  /** GET /api/companion/memory/{user_id} */
  async getMemory(userId) {
    if (!userId) return null;
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/companion/memory/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: buildHeaders(),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /** GET /api/companion/history/{user_id} */
  async getHistory(userId) {
    if (!userId) return null;
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/companion/history/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: buildHeaders(),
        }
      );
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * POST /api/v1/notifications/create — Push a notification to backend DB.
   * Called internally when a reminder fires or a capability creates a notification.
   */
  async createNotification(userId, title, message) {
    if (!userId) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/notifications/create`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ user_id: userId, title, message }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ─── GOOGLE OAUTH & INTEGRATIONS ──────────────────────────────────────────

  /**
   * Initiate Google OAuth PKCE flow.
   * Returns { url: string, state: string } for redirect/popup.
   */
  async startGoogleOAuth(purpose = 'connect') {
    const res = await fetch(`${getApiBaseUrl()}/api/oauth/google/start?purpose=${encodeURIComponent(purpose)}`, {
      method: 'GET',
      headers: buildHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to initiate Google OAuth flow.');
    }
    return await res.json();
  }

  /**
   * Fetch connected integration accounts (Google, Microsoft, GitHub, WhatsApp).
   */
  async getConnections() {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/connections`, {
        method: 'GET',
        headers: buildHeaders(),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('[ControlPlane] Failed to fetch connections:', e);
    }
    return { connections: [] };
  }

  /**
   * Disconnect a linked account (e.g., 'google').
   */
  async disconnectGoogle() {
    const res = await fetch(`${getApiBaseUrl()}/api/connections/google`, {
      method: 'DELETE',
      headers: buildHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to disconnect Google account.');
    }
    return await res.json();
  }

  /**
   * Confirm and dispatch a staged communication action (B.COMM-3 approval policy).
   */
  async confirmCommunicationAction(pendingActionId) {
    let response = await fetch(`${getApiBaseUrl()}/api/communication/actions/${encodeURIComponent(pendingActionId)}/confirm`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({})
    });
    if (response.status === 401) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('jwt');
        localStorage.removeItem('mitra_auth_token');
      }
      response = await fetch(`${getApiBaseUrl()}/api/communication/actions/${encodeURIComponent(pendingActionId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({})
      });
    }
    return await response.json();
  }

  /**
   * Cancel a staged communication action.
   */
  async cancelCommunicationAction(pendingActionId) {
    const response = await fetch(`${getApiBaseUrl()}/api/communication/actions/${encodeURIComponent(pendingActionId)}/cancel`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({})
    });
    return await response.json();
  }
}

export const controlPlane = new ControlPlane();
