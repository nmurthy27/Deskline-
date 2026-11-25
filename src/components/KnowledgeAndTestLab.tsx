import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { BusinessWorkspaceData } from '../types';
import { LiveAgentChat } from './LiveAgentChat';

interface KnowledgeAndTestLabProps {
  workspace: BusinessWorkspaceData;
  onRefreshAll: () => Promise<void>;
}

export function KnowledgeAndTestLab({
  workspace,
  onRefreshAll,
}: KnowledgeAndTestLabProps) {
  const biz = workspace.business;
  const [testChannel, setTestChannel] = useState<'website' | 'whatsapp'>('website');
  const [newEntry, setNewEntry] = useState({
    sourceType: 'faq',
    title: '',
    content: '',
  });
  const [saving, setSaving] = useState(false);

  const addKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntry.title.trim() || !newEntry.content.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/businesses/${biz.id}/knowledge`, {
        method: 'POST',
        body: JSON.stringify(newEntry),
      });
      setNewEntry({ sourceType: 'faq', title: '', content: '' });
      await onRefreshAll();
    } finally {
      setSaving(false);
    }
  };

  const deleteKnowledge = async (itemId: number) => {
    setSaving(true);
    try {
      await apiFetch(`/api/businesses/${biz.id}/knowledge/${itemId}`, {
        method: 'DELETE',
      });
      await onRefreshAll();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Verified Knowledge Base */}
      <div className="lg:col-span-6 space-y-5">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              AI Knowledge Base & FAQs
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Every approved entry is injected immediately into {biz.agentName}’s
              verified context. No retraining delay required.
            </p>
          </div>

          <form onSubmit={addKnowledge} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newEntry.sourceType}
                onChange={(e) =>
                  setNewEntry({ ...newEntry, sourceType: e.target.value })
                }
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs"
              >
                <option value="faq">FAQ</option>
                <option value="policy">Booking Policy</option>
                <option value="document">Document Note</option>
              </select>
              <input
                type="text"
                required
                placeholder="Topic / Question title"
                value={newEntry.title}
                onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })}
                className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <textarea
              rows={3}
              required
              placeholder="Write the verified answer, policy text, or document excerpt..."
              value={newEntry.content}
              onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
            />
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Verified Entry
            </button>
          </form>

          <div className="divide-y divide-slate-100 border-t border-slate-100 pt-2">
            {workspace.knowledge.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                No FAQs or documents added yet.
              </p>
            ) : (
              workspace.knowledge.map((item) => (
                <div
                  key={item.id}
                  className="py-3 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900">
                      {item.title}
                      <span className="ml-2 font-normal text-slate-400 capitalize">
                        · {item.sourceType.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {item.content}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteKnowledge(item.id)}
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right: Live AI Receptionist Test Sandbox */}
      <div className="lg:col-span-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-base font-semibold text-slate-900">
              Live Agent Test Lab
            </h3>
            <p className="text-xs text-slate-500">
              Tests run against your real PostgreSQL calendar & verified services.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => setTestChannel('website')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                testChannel === 'website'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              Website
            </button>
            <button
              type="button"
              onClick={() => setTestChannel('whatsapp')}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                testChannel === 'whatsapp'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>

        <LiveAgentChat
          slug={biz.slug}
          channel={testChannel}
          onBookingActivity={onRefreshAll}
          onSwitchToWhatsApp={() => setTestChannel('whatsapp')}
        />
      </div>
    </div>
  );
}
