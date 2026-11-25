import React, { useMemo, useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Search,
  Send,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { ConversationRecord } from '../types';

interface ConversationsPanelProps {
  businessId: number;
  conversations: ConversationRecord[];
  onRefreshAll: () => Promise<void>;
}

export function ConversationsPanel({
  businessId,
  conversations,
  onRefreshAll,
}: ConversationsPanelProps) {
  const [filter, setFilter] = useState<'all' | 'whatsapp' | 'website' | 'human_takeover'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(
    conversations[0]?.id ?? null
  );
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === 'whatsapp' && c.channel !== 'whatsapp') return false;
      if (filter === 'website' && c.channel !== 'website') return false;
      if (filter === 'human_takeover' && c.status !== 'human_takeover') return false;
      if (q) {
        const inName = c.customerName.toLowerCase().includes(q);
        const inPhone = c.customerPhone.toLowerCase().includes(q);
        const inMsgs = (c.messagesJson || []).some((m) =>
          m.text.toLowerCase().includes(q)
        );
        if (!inName && !inPhone && !inMsgs) return false;
      }
      return true;
    });
  }, [conversations, filter, search]);

  const activeConv =
    filtered.find((c) => c.id === selectedId) || filtered[0] || null;

  const updateStatus = async (convId: number, status: string) => {
    setSending(true);
    try {
      await apiFetch(`/api/businesses/${businessId}/conversations/${convId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefreshAll();
    } finally {
      setSending(false);
    }
  };

  const sendHumanReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConv || !replyText.trim()) return;
    setSending(true);
    try {
      await apiFetch(
        `/api/businesses/${businessId}/conversations/${activeConv.id}/reply`,
        {
          method: 'POST',
          body: JSON.stringify({ text: replyText.trim() }),
        }
      );
      setReplyText('');
      await onRefreshAll();
    } finally {
      setSending(false);
    }
  };

  const statusLabel = (s: string) => {
    if (s === 'human_takeover') return { text: 'Human Takeover', cls: 'text-amber-700' };
    if (s === 'resolved') return { text: 'Resolved', cls: 'text-emerald-700' };
    return { text: 'AI Active', cls: 'text-slate-600' };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[600px]">
      {/* Left Thread List */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-200 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search customer or message..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-xs focus:bg-white focus:border-teal-700 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['all', 'All'],
                ['whatsapp', 'WhatsApp'],
                ['website', 'Website'],
                ['human_takeover', 'Escalated'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={`flex-1 py-1 text-[11px] font-medium rounded-md whitespace-nowrap cursor-pointer ${
                  filter === k
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No conversations found.
            </div>
          ) : (
            filtered.map((conv) => {
              const lastMsg = conv.messagesJson?.[conv.messagesJson.length - 1];
              const st = statusLabel(conv.status);
              const isSelected = activeConv?.id === conv.id;
              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    isSelected ? 'bg-slate-50' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {conv.customerName}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {new Date(conv.lastMessageAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    <span className="capitalize">{conv.channel}</span>
                    <span className="mx-1.5">·</span>
                    <span className={`font-medium ${st.cls}`}>{st.text}</span>
                  </div>
                  {lastMsg && (
                    <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">
                      {lastMsg.text}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Transcript & Human Takeover Controls */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-sm text-slate-500">
            Select a conversation to inspect transcripts or step in manually.
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-slate-900">
                  {activeConv.customerName}
                </h3>
                <div className="text-xs text-slate-500 mt-0.5">
                  <span className="capitalize">{activeConv.channel}</span>
                  {activeConv.customerPhone ? ` · ${activeConv.customerPhone}` : ''}
                  {activeConv.escalationReason
                    ? ` · Escalation: ${activeConv.escalationReason}`
                    : ''}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeConv.status !== 'human_takeover' ? (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => updateStatus(activeConv.id, 'human_takeover')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    Take Over Manually
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => updateStatus(activeConv.id, 'ai_active')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    Return to AI
                  </button>
                )}

                {activeConv.status !== 'resolved' && (
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => updateStatus(activeConv.id, 'resolved')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Resolved
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50 max-h-[460px]">
              {(activeConv.messagesJson || []).map((msg) => {
                const isCustomer = msg.role === 'customer';
                const isHuman = msg.role === 'agent';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}
                  >
                    <div className="text-[11px] text-slate-400 mb-1 px-1">
                      {isCustomer
                        ? activeConv.customerName
                        : isHuman
                          ? `Human Staff (${activeConv.assignedTo || 'Team'})`
                          : 'AI Receptionist'}
                    </div>
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        isCustomer
                          ? 'bg-white border border-slate-200 text-slate-800'
                          : isHuman
                            ? 'bg-amber-900 text-white'
                            : 'bg-slate-900 text-white'
                      }`}
                    >
                      {msg.text}
                    </div>
                    {msg.toolActions && msg.toolActions.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 px-1">
                        <Wrench className="w-3 h-3" />
                        <span>{msg.toolActions.join(' · ')}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={sendHumanReply}
              className="p-3.5 border-t border-slate-200 bg-white flex items-center gap-2"
            >
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Send a manual human reply (automatically pauses AI for this thread)..."
                className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm focus:bg-white focus:border-teal-700 focus:outline-none"
              />
              <button
                type="submit"
                disabled={sending || !replyText.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#0F766E] hover:bg-[#0D625B] rounded-lg disabled:opacity-40 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                Reply
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
