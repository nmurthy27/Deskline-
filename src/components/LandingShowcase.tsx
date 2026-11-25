import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Globe,
  MessageCircle,
  MessageSquare,
  ShieldCheck,
  X,
} from 'lucide-react';
import { publicFetch } from '../lib/api';
import { formatCurrency, type PublicBusinessPayload } from '../types';
import { LiveAgentChat } from './LiveAgentChat';

const HERO_CLINIC_IMAGE =
  '/src/assets/images/reception_clinic_preview_1795599722689.jpg';

const INDUSTRIES = [
  { name: 'Healthcare', examples: 'Clinics, dentists, physiotherapists' },
  { name: 'Beauty & Wellness', examples: 'Salons, spas, skin clinics' },
  { name: 'Fitness', examples: 'Gyms, personal trainers, yoga studios' },
  { name: 'Professional Services', examples: 'Consultants, accountants, lawyers' },
  { name: 'Automotive', examples: 'Car servicing, detailing, repair' },
  { name: 'Education', examples: 'Training centres, tutors, coaching' },
  { name: 'Hospitality', examples: 'Private dining, curated experiences' },
  { name: 'Home Services', examples: 'Plumbers, electricians, cleaning' },
  { name: 'Pet Care', examples: 'Veterinary clinics, grooming studios' },
];

interface LandingShowcaseProps {
  onSignIn: () => Promise<void>;
  onStartDemo: () => void;
  authError: string | null;
}

export function LandingShowcase({
  onSignIn,
  onStartDemo,
  authError,
}: LandingShowcaseProps) {
  const [demoBiz, setDemoBiz] = useState<PublicBusinessPayload | null>(null);
  const [demoChannel, setDemoChannel] = useState<'website' | 'whatsapp'>('website');
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  useEffect(() => {
    publicFetch<PublicBusinessPayload>('/api/public/business/soma-wellness')
      .then((res) => setDemoBiz(res))
      .catch(() => {
        // handled cleanly inside chat component if unavailable
      });
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900">
      {/* 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Deskline
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
            <a
              href="#live-demo"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Live Demo
            </a>
            <a
              href="#workflow"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Onboarding
            </a>
            <a
              href="#capabilities"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Capabilities
            </a>
            <a
              href="#industries"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Industries
            </a>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onStartDemo}
              className="px-3.5 py-2 text-sm font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Explore Full Demo
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {authError && (
          <div className="max-w-7xl mx-auto px-6 pt-4">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {authError}
            </div>
          </div>
        )}

        {/* Editorial Split Hero */}
        <section className="max-w-7xl mx-auto px-6 pt-12 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between py-2">
              <div>
                <p className="text-sm font-medium text-[#0F766E] mb-4">
                  WhatsApp Business · Website Chat · MIS & Google Public Profile
                </p>
                <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 leading-[1.1] max-w-xl [text-wrap:balance]">
                  Your AI Receptionist. Available 24/7.
                </h1>
                <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-lg">
                  Convert website, WhatsApp, and Google Search visitors into confirmed
                  appointments automatically. Explore every module right now with
                  realistic sample data—no API keys or sign-in required.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={onStartDemo}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Explore Full Demo (All Features)
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Sign in with Google
                  </button>
                  <a
                    href="#live-demo"
                    className="inline-flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Try Live Chat
                  </a>
                </div>
              </div>

              <div className="mt-10 pt-6 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span>MIS & Business Value</span>
                <span aria-hidden="true">·</span>
                <span>2,000-User Offer Broadcasts</span>
                <span aria-hidden="true">·</span>
                <span>Google Master Profile Sync</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="relative h-full min-h-[340px] lg:min-h-[420px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100">
                {heroImgFailed ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center bg-slate-100">
                    <CalendarCheck className="w-10 h-10 text-teal-700 mb-3" />
                    <p className="font-display text-lg font-semibold text-slate-800">
                      Soma Wellness & Dental
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      24/7 AI Receptionist Preview
                    </p>
                  </div>
                ) : (
                  <img
                    src={HERO_CLINIC_IMAGE}
                    alt="Soma Wellness & Dental sunlit travertine reception desk"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/15 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                  <div className="text-white">
                    <p className="text-xs text-white/80">
                      Live Showcase Tenant · Bengaluru
                    </p>
                    <p className="font-display text-lg font-semibold mt-0.5">
                      Soma Wellness & Dental
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWidgetOpen(true)}
                    className="px-4 py-2 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Open Website Widget
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width 4-column metric strip below hero split */}
          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 border border-slate-200 bg-white rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
            <div className="p-5">
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                24/7
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Instant responses across WhatsApp & Web
              </div>
            </div>
            <div className="p-5">
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                8 Steps
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Website URL crawl to live booking agent
              </div>
            </div>
            <div className="p-5">
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                0
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Double bookings via atomic slot engine
              </div>
            </div>
            <div className="p-5">
              <div className="font-mono text-2xl font-semibold text-slate-900 tabular-nums">
                &lt; 5s
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Real-time tool-backed slot verification
              </div>
            </div>
          </div>
        </section>

        {/* Interactive Dual-Channel Live Demo */}
        <section id="live-demo" className="max-w-7xl mx-auto px-6 py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                Test the Live AI Booking Agent
              </h2>
              <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
                Chat naturally with Maya at Soma Wellness & Dental. Ask about
                consultation differences, packages, check real-time slots for tomorrow,
                confirm a booking, or reschedule using reference{' '}
                <span className="font-mono text-slate-900">AP10245</span>.
              </p>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start">
              <button
                type="button"
                onClick={() => setDemoChannel('website')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  demoChannel === 'website'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Website Chat Widget
              </button>
              <button
                type="button"
                onClick={() => setDemoChannel('whatsapp')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  demoChannel === 'whatsapp'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                WhatsApp Business
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Verified Business Context Card */}
            <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    {demoBiz?.business.businessName || 'Soma Wellness & Dental'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {demoBiz?.business.address || 'Indiranagar, Bengaluru'}
                  </p>
                </div>
                <span className="text-xs font-medium text-emerald-700">
                  Live Calendar Connected
                </span>
              </div>

              <div className="mt-5">
                <h4 className="text-xs font-semibold text-slate-500 mb-3">
                  Verified Services & Pricing
                </h4>
                <div className="divide-y divide-slate-100">
                  {(demoBiz?.services || []).map((svc) => (
                    <div
                      key={svc.id}
                      className="py-2.5 flex items-baseline justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900">
                          {svc.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {svc.durationMinutes} min · {svc.staffMember}
                        </div>
                      </div>
                      <div className="font-mono text-sm font-medium text-slate-900 tabular-nums shrink-0">
                        {formatCurrency(svc.price, svc.currency)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {demoBiz?.packages && demoBiz.packages.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-200">
                  <h4 className="text-xs font-semibold text-slate-500 mb-3">
                    Active Packages
                  </h4>
                  <div className="space-y-3">
                    {demoBiz.packages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className="flex items-baseline justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-900">
                            {pkg.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {pkg.sessionCount} sessions · Valid {pkg.validityDays} days
                          </div>
                        </div>
                        <div className="font-mono text-sm font-medium text-slate-900 tabular-nums shrink-0">
                          {formatCurrency(pkg.price, pkg.currency)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-5 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
                <p className="font-medium text-slate-700">Try asking Maya:</p>
                <p>“What is the difference between general and premium consultation?”</p>
                <p>“I want to book a general consultation for tomorrow morning.”</p>
                <p>“Can you check my booking AP10245 for Rahul Sharma?”</p>
              </div>
            </div>

            {/* Live Dual-Channel Chat */}
            <div className="lg:col-span-7">
              <LiveAgentChat
                slug="soma-wellness"
                channel={demoChannel}
                businessData={demoBiz}
                onSwitchToWhatsApp={() => setDemoChannel('whatsapp')}
              />
            </div>
          </div>
        </section>

        {/* Architecture & Capabilities */}
        <section
          id="capabilities"
          className="border-t border-slate-200 bg-white py-14"
        >
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              One AI Agent. Every Customer Channel.
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-2xl">
              Built on a structured tool-calling architecture where PostgreSQL remains the
              authoritative source of truth for live availability and tenant isolation.
            </p>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <Globe className="w-5 h-5 text-[#0F766E] mb-3" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  01. Website-First Onboarding
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Paste your company website URL. Deskline extracts services, pricing,
                  packages, hours, and FAQs for your review and approval—eliminating
                  manual flow builders.
                </p>
              </div>
              <div>
                <CalendarCheck className="w-5 h-5 text-[#0F766E] mb-3" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  02. Deterministic Booking Engine
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  The AI never invents slots. Every request queries live availability
                  rules, breaks, buffers, and existing bookings before confirming a
                  unique booking reference.
                </p>
              </div>
              <div>
                <ShieldCheck className="w-5 h-5 text-[#0F766E] mb-3" />
                <h3 className="font-display text-base font-semibold text-slate-900">
                  03. Unified Inbox & Human Takeover
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Monitor every WhatsApp and website thread from one dashboard. Step in
                  manually whenever a customer requests assistance or complex support.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 8-Step Onboarding Summary */}
        <section id="workflow" className="max-w-7xl mx-auto px-6 py-14">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                Go Live in Eight Guided Steps
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Designed for non-technical business owners across appointment-driven
                industries.
              </p>
            </div>
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2.5 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg transition-colors whitespace-nowrap self-start cursor-pointer"
            >
              Start Onboarding Free
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 border border-slate-200 rounded-xl overflow-hidden">
            {[
              ['01', 'Business Registration', 'Register name, timezone, category, and contact channels.'],
              ['02', 'Website AI Analysis', 'Crawl website content and approve extracted services & FAQs.'],
              ['03', 'Services & Pricing', 'Configure durations, buffer times, prices, and assigned staff.'],
              ['04', 'Packages & Offers', 'Add multi-session packs, combos, and promotional validity.'],
              ['05', 'Availability Rules', 'Set working hours, breaks, holidays, and cancellation policies.'],
              ['06', 'WhatsApp Cloud API', 'Connect verified Meta phone number ID, webhooks, and templates.'],
              ['07', 'AI Receptionist Persona', 'Tailor agent name, greeting, tone, and escalation rules.'],
              ['08', 'Website Widget Embed', 'Copy one JS snippet for WordPress, Shopify, Webflow, or Wix.'],
            ].map(([num, title, desc]) => (
              <div key={num} className="bg-white p-5">
                <div className="font-mono text-xs text-slate-400 tabular-nums">{num}</div>
                <div className="mt-1.5 font-display text-sm font-semibold text-slate-900">
                  {title}
                </div>
                <p className="mt-1 text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Industries */}
        <section
          id="industries"
          className="border-t border-slate-200 bg-white py-14"
        >
          <div className="max-w-7xl mx-auto px-6">
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Built for Every Appointment-Driven Business
            </h2>
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5">
              {INDUSTRIES.map((ind) => (
                <div
                  key={ind.name}
                  className="flex items-start gap-3 pb-4 border-b border-slate-100"
                >
                  <Check className="w-4 h-4 text-[#0F766E] mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {ind.name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{ind.examples}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-[#F8FAFC] py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div>Deskline · Multi-Tenant AI Appointment Booking Platform</div>
          <div className="flex items-center gap-4">
            <span>English MVP</span>
            <span aria-hidden="true">·</span>
            <span>WhatsApp & Website Channels</span>
            <span aria-hidden="true">·</span>
            <span>Voice IVR & Multilingual Roadmap</span>
          </div>
        </div>
      </footer>

      {/* Floating Website Chat Widget */}
      {widgetOpen && (
        <div className="fixed bottom-20 right-6 z-50 w-[390px] max-w-[calc(100vw-2rem)] shadow-2xl rounded-xl">
          <div className="flex items-center justify-end mb-2">
            <button
              type="button"
              onClick={() => setWidgetOpen(false)}
              aria-label="Close chat widget"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              Close
            </button>
          </div>
          <LiveAgentChat
            slug="soma-wellness"
            channel="website"
            businessData={demoBiz}
            compact
            onSwitchToWhatsApp={() => {
              setWidgetOpen(false);
              setDemoChannel('whatsapp');
              document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      )}

      <button
        type="button"
        onClick={() => setWidgetOpen((v) => !v)}
        aria-label="Open Website AI Receptionist Widget"
        className="fixed bottom-5 right-6 z-40 inline-flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-full shadow-lg transition-colors cursor-pointer"
      >
        {widgetOpen ? (
          <X className="w-4 h-4" />
        ) : (
          <MessageCircle className="w-4 h-4" />
        )}
        <span className="whitespace-nowrap">
          {widgetOpen ? 'Close Receptionist' : 'Chat with Soma AI'}
        </span>
      </button>
    </div>
  );
}
