// components/pages/PrivacyPage.tsx — MITRA Privacy Policy Page
import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, ExternalLink, Lock, CheckCircle2, Database, Trash2, Building, Mail, Globe } from 'lucide-react';

export const PrivacyPage: React.FC<{ onBackToChat: () => void }> = ({ onBackToChat }) => {
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
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Privacy Policy for MITRA</h1>
            <p className="text-xs text-text-muted mt-1.5">Last Updated: October 26, 2026 | Effective Date: October 26, 2026</p>
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
              href="/privacy.html"
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
          <strong className="text-white">Summary:</strong> MITRA (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;), provided by <strong className="text-white">Blackhole Infiverse LLP</strong>, provides AI companion, productivity, and messaging automation services. We respect your privacy and are committed to protecting your personal data in full compliance with global standards, including Meta Platform Terms and WhatsApp Business Policies.
        </div>

        {/* Sections */}
        <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              1. Information We Collect
            </h2>
            <p className="mb-2">When you use MITRA and its integrated communication capabilities (including WhatsApp Business, Email, Calendar, and Ecosystem tools), we may collect the following categories of information:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li><strong className="text-text-primary">Account &amp; Contact Information:</strong> Name, business name, phone number, email address, and authentication credentials when linking services.</li>
              <li><strong className="text-text-primary">WhatsApp Business Platform Data:</strong> Phone Number ID, WhatsApp Business Account (WABA) ID, message delivery status, recipient phone numbers, and message template metadata required for sending and receiving messages.</li>
              <li><strong className="text-text-primary">Communications &amp; Interactions:</strong> Text queries, AI chat prompts, calendar scheduling events, and command preferences submitted through our companion interface.</li>
              <li><strong className="text-text-primary">Technical &amp; Usage Data:</strong> IP address, device metadata, browser type, interaction timestamps, and API latency logs to ensure system reliability and security.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              2. How We Use Your Information
            </h2>
            <p className="mb-2">We process your information strictly for the following authorized business and service purposes:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li>To provide and deliver automated AI companion services, conversational assistance, and workflow automation.</li>
              <li>To transmit user-initiated WhatsApp notifications, reminders, and alerts via the <strong>Meta WhatsApp Cloud API</strong>.</li>
              <li>To authenticate and manage customer onboarding via Meta-hosted Embedded Signup.</li>
              <li>To facilitate user-approved calendar synchronization, email drafting, and document analytics.</li>
              <li>To maintain system integrity, detect and prevent fraud or security breaches, and comply with applicable laws.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              3. Meta WhatsApp Cloud API Data Handling
            </h2>
            <p className="mb-2">MITRA operates as a Tech Provider leveraging Meta&apos;s official WhatsApp Business Platform. In accordance with Meta Platform Terms:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li>We process WhatsApp messages and customer phone numbers <strong>only on behalf of the customer</strong> and strictly according to their instructions.</li>
              <li>We do <strong>not</strong> use customer message contents or WhatsApp contact numbers for advertising, profiling, or cross-service tracking.</li>
              <li>All message transmission is encrypted in transit using industry-standard TLS protocols between MITRA servers and Meta Graph API endpoints.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              4. Data Sharing and Third-Party Disclosures
            </h2>
            <p className="mb-2">We do <strong>not</strong> sell, rent, or trade your personal or business data. We only share data with trusted service providers under strict confidentiality agreements:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li><strong className="text-text-primary">Meta Platforms, Inc.:</strong> Strictly to deliver WhatsApp Business messages, template management, and Embedded Signup authentication.</li>
              <li><strong className="text-text-primary">Cloud Infrastructure Providers:</strong> Secure hosting and database infrastructure operated in compliant data centers with enterprise-grade physical and digital security.</li>
              <li><strong className="text-text-primary">Legal Requirements:</strong> If compelled by applicable statutory law, court subpoena, or authorized law enforcement requests.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              5. Data Retention &amp; Deletion Rights
            </h2>
            <p className="mb-2">We retain your data only for as long as necessary to provide active companion services or fulfill statutory legal requirements:</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-text-muted">
              <li><strong className="text-text-primary">Account Data:</strong> Retained while your workspace or service connection remains active.</li>
              <li><strong className="text-text-primary">Message &amp; Transient Logs:</strong> Automatically purged on a rolling retention schedule.</li>
              <li><strong className="text-text-primary">Right to Erasure (Data Deletion):</strong> You have the absolute right to request the deletion of your personal data, phone number, and conversation history at any time.</li>
            </ul>
            <p className="mt-2 text-xs text-text-muted">
              To request complete deletion of your data, email us at <a href="mailto:support@blackholeinfiverse.com" className="text-brand-light underline">support@blackholeinfiverse.com</a> with the subject line <em>&quot;Data Deletion Request&quot;</em>. We will process and confirm deletion within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
              <span className="w-1.5 h-4.5 bg-brand rounded-full inline-block"></span>
              6. Security of Your Information
            </h2>
            <p>
              We implement technical and organizational security measures, including 256-bit encryption in transit (HTTPS/TLS 1.3), hashed secrets storage, role-based access control (RBAC), and automated vulnerability monitoring to safeguard your data against unauthorized access.
            </p>
          </section>

          {/* Contact Box */}
          <div className="mt-8 p-5 rounded-2xl bg-surface-elevated border border-border-subtle">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Building size={16} className="text-brand-light" />
              <span>Contact &amp; Grievance Officer — Blackhole Infiverse LLP</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-muted">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-brand-light" />
                <span>support@blackholeinfiverse.com / bh@blackholeinfiverse.com</span>
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

export default PrivacyPage;
