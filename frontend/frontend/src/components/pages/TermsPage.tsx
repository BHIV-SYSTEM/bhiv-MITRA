// components/pages/TermsPage.tsx — MITRA Terms of Service Page
import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, ExternalLink, FileText, CheckCircle2, AlertTriangle, Building, Mail, Globe } from 'lucide-react';

export const TermsPage: React.FC<{ onBackToChat: () => void }> = ({ onBackToChat }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-4xl mx-auto w-full px-4 py-8 text-text-primary"
    >
      {/* Top Header Card */}
      <div className="bg-surface-raised border border-border-subtle rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-card mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle/60 pb-6 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand/15 border border-brand/30 text-brand-light text-xs font-semibold mb-3">
              <ShieldCheck size={14} />
              <span>Blackhole Infiverse LLP</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Terms of Service for MITRA</h1>
            <p className="text-xs text-text-muted mt-1.5">Last Updated: October 27, 2026 | Effective Date: October 27, 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onBackToChat}
              className="px-4 py-2 rounded-xl bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-white border border-border-subtle text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to Companion</span>
            </button>
            <a
              href="/terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 rounded-xl bg-brand/10 hover:bg-brand/20 text-brand-light border border-brand/30 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <span>HTML Version</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Overview Highlight Box */}
        <div className="p-4 rounded-xl bg-brand/10 border border-brand/25 text-sm text-text-secondary leading-relaxed mb-6">
          <strong className="text-white">Overview:</strong> These Terms of Service (&quot;Terms&quot;) govern your access to and use of <strong className="text-brand-light">MITRA</strong> (&quot;the Platform&quot;), an intelligent AI companion and enterprise integration service developed and operated by <strong className="text-white">Blackhole Infiverse LLP</strong> (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;). By accessing or using MITRA, you agree to be bound by these Terms.
        </div>

        {/* Sections */}
        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              1. Acceptance of Terms
            </h2>
            <p>
              By registering for, linking your account to, or interacting with MITRA via web, mobile, WhatsApp Business Platform, or third-party integrations, you acknowledge that you have read, understood, and agreed to be legally bound by these Terms and our Privacy Policy. If you do not agree, do not use MITRA.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              2. Scope of MITRA Services
            </h2>
            <p className="mb-2">MITRA is an autonomous AI assistant and productivity engine providing:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li><strong className="text-text-primary">Conversational Intelligence:</strong> Natural language chat, contextual recall, document analysis, and daily planning assistance.</li>
              <li><strong className="text-text-primary">Communication &amp; WhatsApp Integration:</strong> Automated drafting and transmission of notifications, customer communications, and schedule reminders via the official Meta WhatsApp Cloud API.</li>
              <li><strong className="text-text-primary">Ecosystem Synchronization:</strong> Unified connectivity with learning (UniGuru, Gurukul), resource management (Samruddhi), and runtime tools (SETU, Artha).</li>
              <li><strong className="text-text-primary">Calendar &amp; Task Operations:</strong> Calendar synchronization, to-do management, and proactive alert scheduling.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              3. Compliance with Meta Platform Terms
            </h2>
            <p className="mb-2">When using MITRA&apos;s WhatsApp Business capabilities, you agree to comply with:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li><strong className="text-text-primary">Meta Platform Terms &amp; Developer Policies:</strong> All messaging and data flows adhere strictly to Meta&apos;s technical and security requirements.</li>
              <li><strong className="text-text-primary">WhatsApp Business Messaging Policy:</strong> Users must maintain valid customer opt-ins before sending proactive notifications or template messages. Spam, harassment, unapproved commercial broadcasts, or prohibited categories are strictly prohibited.</li>
              <li><strong className="text-text-primary">Tech Provider Terms:</strong> MITRA acts as a technical solution provider. You remain the data controller for your customer communications and recipient lists.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              4. User Responsibilities &amp; Acceptable Use
            </h2>
            <p className="mb-2">You agree to use MITRA solely for lawful purposes. You shall not:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li>Transmit or solicit defamatory, hateful, abusive, obscene, fraudulent, or illegal content.</li>
              <li>Attempt to reverse-engineer, decompile, scrape, or probe the vulnerabilities of MITRA&apos;s API, neural models, or vault credentials.</li>
              <li>Misrepresent automated AI responses as certified medical, legal, or financial professional counsel.</li>
              <li>Send unsolicited commercial bulk communications (spam) violating applicable anti-spam and telecom regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              5. AI Output &amp; Verification Disclaimer
            </h2>
            <p className="mb-2">MITRA utilizes state-of-the-art generative language models. While designed for high accuracy and contextual relevance:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li>AI-generated text, summaries, and recommendations are provided for productivity and informational assistance only.</li>
              <li>Users are responsible for verifying critical facts, financial figures, medical assessments, and legal statutes before making high-stakes decisions.</li>
              <li>Blackhole Infiverse LLP does not warrant that AI responses will always be error-free or uninterrupted.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              6. Intellectual Property Rights
            </h2>
            <p>
              All platform software, algorithms, companion orb designs, interfaces, trademarks, and documentation are the proprietary property of <strong>Blackhole Infiverse LLP</strong>. You retain full ownership of the text, prompts, documents, and messages you submit to the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              7. Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by applicable law, Blackhole Infiverse LLP shall not be liable for any indirect, incidental, punitive, or consequential damages resulting from the use or inability to use MITRA, third-party platform downtime (including Meta, Google, or telecom outages), or unauthorized access resulting from user credential compromise.
            </p>
          </section>

          {/* Contact Box */}
          <div className="mt-8 p-5 rounded-2xl bg-surface-elevated border border-border-subtle">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Building size={16} className="text-brand-light" />
              <span>Contact &amp; Support — Blackhole Infiverse LLP</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-brand-light" />
                <span>support@blackholeinfiverse.com</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe size={14} className="text-brand-light" />
                <a href="https://blackholeinfiverse.com" target="_blank" rel="noopener noreferrer" className="text-brand-light hover:underline">
                  blackholeinfiverse.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TermsPage;
