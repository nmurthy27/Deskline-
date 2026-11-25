import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { publicFetch } from '../lib/api';
import type { ConversationMessage, PublicBusinessPayload } from '../types';

const RECEPTIONIST_AVATAR =
  '/src/assets/images/avatar_ai_receptionist_1795599721869.jpg';

interface LiveAgentChatProps {
  slug: string;
  channel: 'website' | 'whatsapp' | 'google_profile';
  businessData?: PublicBusinessPayload | null;
  onBookingActivity?: () => void;
  compact?: boolean;
  onSwitchToWhatsApp?: () => void;
}

function makeSessionId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function LiveAgentChat({
  slug,
  channel,
  businessData: externalData,
  onBookingActivity,
  compact = false,
  onSwitchToWhatsApp,
}: LiveAgentChatProps) {
  const [bizData, setBizData] = useState<PublicBusinessPayload | null>(
    externalData || null
  );
  const [loadingBiz, setLoadingBiz] = useState(!externalData);
  const [sessionKey, setSessionKey] = useState(() => makeSessionId(channel));
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convStatus, setConvStatus] = useState<string>('ai_active');
  const [waCustomerPhone, setWaCustomerPhone] = useState('+91 98450 77123');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (externalData) {
      setBizData(externalData);
      setLoadingBiz(false);
      return;
    }
    let cancelled = false;
    setLoadingBiz(true);
    publicFetch<PublicBusinessPayload>(`/api/public/business/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!cancelled) {
          setBizData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load receptionist.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingBiz(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, externalData]);

  // Reset session when business slug or channel switches
  useEffect(() => {
    setSessionKey(makeSessionId(channel));
    setMessages([]);
    setConvStatus('ai_active');
    setError(null);
  }, [slug, channel]);

  // Poll for human receptionist replies when escalated
  useEffect(() => {
    if (convStatus !== 'human_takeover' || messages.length === 0) return;
    const timer = window.setInterval(() => {
      publicFetch<{
        conversation: { status: string; messagesJson: ConversationMessage[] } | null;
      }>(
        `/api/public/conversation/${encodeURIComponent(slug)}/${encodeURIComponent(sessionKey)}?channel=${channel}`
      )
        .then((res) => {
          if (res.conversation) {
            setMessages(res.conversation.messagesJson || []);
            setConvStatus(res.conversation.status);
          }
        })
        .catch(() => {
          // ignore transient poll errors
        });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [convStatus, slug, sessionKey, channel, messages.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const sendMessage = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    const optimisticMsg: ConversationMessage = {
      id: `local_${Date.now()}`,
      role: 'customer',
      text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    if (!textOverride) setInput('');
    setSending(true);
    setError(null);

    try {
      const res = await publicFetch<{
        sessionKey: string;
        status: string;
        replyText: string;
        toolActions: string[];
        messages: ConversationMessage[];
      }>(`/api/public/chat/${encodeURIComponent(slug)}`, {
        method: 'POST',
        body: JSON.stringify({
          message: text,
          channel,
          sessionKey,
          customerPhone: channel === 'whatsapp' ? waCustomerPhone : undefined,
        }),
      });
      setMessages(res.messages);
      setConvStatus(res.status);
      if (res.toolActions && res.toolActions.length > 0 && onBookingActivity) {
        onBookingActivity();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const resetChat = () => {
    setSessionKey(makeSessionId(channel));
    setMessages([]);
    setConvStatus('ai_active');
    setError(null);
  };

  if (loadingBiz) {
    return (
      <div className="flex items-center justify-center h-96 bg-white border border-slate-200 rounded-xl">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!bizData) {
    return (
      <div className="p-6 bg-white border border-slate-200 rounded-xl text-sm text-slate-600">
        {error || 'Business profile is currently unavailable.'}
      </div>
    );
  }

  const isWhatsApp = channel === 'whatsapp';
  const brandColor = bizData.widgetConfig?.brandColor || bizData.business.widgetBrandColor || '#0F766E';
  const quickPrompts = bizData.widgetConfig?.quickPrompts?.length
    ? bizData.widgetConfig.quickPrompts
    : [
        'Book an appointment',
        'Explore services',
        'View pricing',
        'View packages',
        'Talk to someone',
      ];

  const greetingText =
    bizData.widgetConfig?.welcomeMessage ||
    bizData.business.agentGreeting ||
    'Hi! How can we help you today?';

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isWhatsApp ? 'border-emerald-900/20 bg-[#ECE5DD]' : 'border-slate-200 bg-white'
      } ${compact ? 'h-[540px]' : 'h-[600px]'}`}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 text-white ${
          isWhatsApp ? 'bg-[#075E54]' : ''
        }`}
        style={!isWhatsApp ? { backgroundColor: brandColor } : undefined}
      >
        <div className="flex items-center gap-3 min-w-0">
          {avatarFailed ? (
            <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center shrink-0 text-sm font-semibold">
              {bizData.business.agentName.slice(0, 1).toUpperCase()}
            </div>
          ) : (
            <img
              src={RECEPTIONIST_AVATAR}
              alt={`${bizData.business.agentName} receptionist`}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-9 h-9 rounded-full object-cover border border-white/25 shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">
              {bizData.business.businessName}
            </div>
            <div className="text-xs text-white/80 truncate">
              {bizData.business.agentName} ·{' '}
              {convStatus === 'human_takeover'
                ? 'Human Receptionist Active'
                : isWhatsApp
                  ? `WhatsApp Business ${bizData.business.whatsappPhone || ''}`
                  : 'AI Receptionist · Replies instantly'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={resetChat}
          title="Start new conversation"
          className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Optional WhatsApp sender simulation bar */}
      {isWhatsApp && (
        <div className="px-4 py-2 bg-[#F0F2F5] border-b border-slate-200/80 flex items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2 min-w-0">
            <Phone className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            <span className="whitespace-nowrap">Customer number:</span>
            <input
              type="text"
              value={waCustomerPhone}
              onChange={(e) => setWaCustomerPhone(e.target.value)}
              aria-label="Simulated customer WhatsApp phone number"
              className="bg-white border border-slate-200 rounded px-2 py-0.5 text-xs font-mono text-slate-800 w-36 focus:outline-none focus:border-emerald-600"
            />
          </div>
          <span className="text-[11px] text-slate-500 whitespace-nowrap">
            Cloud API Pipeline
          </span>
        </div>
      )}

      {/* Message Stream */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-4 py-4 space-y-3 ${
          isWhatsApp ? 'bg-[#EFEAE2]' : 'bg-slate-50/70'
        }`}
      >
        {/* Welcome greeting */}
        <div className="flex justify-start">
          <div
            className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
              isWhatsApp
                ? 'bg-white text-slate-900 shadow-xs'
                : 'bg-white border border-slate-200 text-slate-800'
            }`}
          >
            <p>{greetingText}</p>
            {messages.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="text-left text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Conversation turns */}
        {messages.map((msg) => {
          const isCustomer = msg.role === 'customer';
          const isHumanAgent = msg.role === 'agent';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}
            >
              {isHumanAgent && (
                <div className="flex items-center gap-1 text-[11px] text-amber-700 mb-1 px-1">
                  <UserCheck className="w-3 h-3" />
                  <span>Human Receptionist</span>
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  isCustomer
                    ? isWhatsApp
                      ? 'bg-[#D9FDD3] text-slate-900 shadow-xs'
                      : 'text-white'
                    : isWhatsApp
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-800'
                }`}
                style={
                  isCustomer && !isWhatsApp
                    ? { backgroundColor: brandColor }
                    : undefined
                }
              >
                {msg.text}
                <div
                  className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
                    isCustomer && !isWhatsApp ? 'text-white/75' : 'text-slate-400'
                  }`}
                >
                  <span>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {isCustomer &&
                    (isWhatsApp ? (
                      <CheckCheck className="w-3 h-3 text-sky-600" />
                    ) : (
                      <Check className="w-3 h-3" />
                    ))}
                </div>
              </div>

              {msg.toolActions && msg.toolActions.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-[11px] text-slate-500">
                  <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                  <span>{msg.toolActions.join(' · ')}</span>
                </div>
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-700" />
              <span>{bizData.business.agentName} is checking availability...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Footer / Input */}
      <div className="border-t border-slate-200 bg-white p-3">
        {!isWhatsApp && bizData.widgetConfig?.enableWhatsAppHandoff && onSwitchToWhatsApp && (
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Prefer messaging on your phone?</span>
            <button
              type="button"
              onClick={onSwitchToWhatsApp}
              className="font-medium text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Continue on WhatsApp
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isWhatsApp
                ? 'Type a WhatsApp message...'
                : 'Ask about services, prices, or book a slot...'
            }
            disabled={sending}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-teal-700 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Send message"
            className="inline-flex items-center justify-center rounded-lg px-3.5 py-2.5 text-sm font-medium text-white disabled:opacity-40 transition-colors cursor-pointer shrink-0"
            style={{ backgroundColor: isWhatsApp ? '#075E54' : brandColor }}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
