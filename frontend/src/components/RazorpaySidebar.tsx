'use client';

import React from 'react';
import {
  LayoutDashboard, UserCheck, Sliders, History, ShieldAlert, Award,
  GitCompare, Smartphone, FileText, ChevronRight, Zap, CheckCircle2
} from 'lucide-react';

export type ActiveView = 'dashboard' | 'reviews' | 'policies' | 'replay' | 'redteam' | 'evaluation';

interface RazorpaySidebarProps {
  activeTab: ActiveView;
  onSelectTab: (tab: ActiveView) => void;
  pendingReviewsCount: number;
  onOpenCustomerPreview: () => void;
  isTestMode: boolean;
  onToggleTestMode: () => void;
  merchantName: string;
}

export const RazorpaySidebar: React.FC<RazorpaySidebarProps> = ({
  activeTab,
  onSelectTab,
  pendingReviewsCount,
  onOpenCustomerPreview,
  isTestMode,
  onToggleTestMode,
  merchantName,
}) => {
  return (
    <aside className="w-64 bg-[#0C2340] text-slate-300 flex flex-col justify-between shrink-0 h-screen sticky top-0 border-r border-[#13335A] select-none font-sans">
      {/* Top Section: Brand & Test Mode Toggle */}
      <div>
        {/* Razorpay Brand Header */}
        <div className="p-4 border-b border-[#13335A] flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            {/* Razorpay Icon */}
            <div className="w-8 h-8 rounded-md bg-[#0C8CE9] flex items-center justify-center font-black text-sm text-white shadow-md">
              R
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-extrabold text-white text-sm tracking-tight">Razorpay</span>
                <span className="text-[10px] font-bold text-[#0C8CE9] tracking-wider uppercase">X</span>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">RecoverAI Platform</div>
            </div>
          </div>
        </div>

        {/* Live / Test Mode Switcher Pill */}
        <div className="p-3">
          <div
            onClick={onToggleTestMode}
            className={`p-2 rounded-md border flex items-center justify-between cursor-pointer transition-colors ${
              isTestMode
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${isTestMode ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                {isTestMode ? 'TEST MODE' : 'LIVE PRODUCTION'}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 underline">Switch</span>
          </div>
        </div>

        {/* Navigation Categories */}
        <div className="px-3 py-2 space-y-6 overflow-y-auto max-h-[calc(100vh-220px)] scrollbar-none text-xs">
          {/* Group 1: REVENUE & RECOVERY */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Payments & Recovery
            </div>

            <button
              onClick={() => onSelectTab('dashboard')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Revenue Dashboard</span>
              </div>
              <ChevronRight className={`w-3.5 h-3.5 ${activeTab === 'dashboard' ? 'text-white' : 'text-slate-500'}`} />
            </button>

            <button
              onClick={() => onSelectTab('reviews')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'reviews'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <UserCheck className="w-4 h-4" />
                <span>Escalation Queue</span>
              </div>
              {pendingReviewsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-amber-400 text-slate-900">
                  {pendingReviewsCount}
                </span>
              )}
            </button>

            <button
              onClick={onOpenCustomerPreview}
              className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-slate-300 hover:bg-[#13335A] hover:text-white transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5">
                <Smartphone className="w-4 h-4 text-purple-400" />
                <span>Customer Blade Drawer</span>
              </div>
              <span className="text-[9px] font-mono text-purple-300 bg-purple-500/20 px-1 py-0.2 rounded border border-purple-500/30">
                PREVIEW
              </span>
            </button>
          </div>

          {/* Group 2: INTELLIGENCE & POLICY */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Intelligence & Rules
            </div>

            <button
              onClick={() => onSelectTab('policies')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'policies'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Sliders className="w-4 h-4" />
                <span>Policy Simulator & ROI</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('replay')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'replay'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <History className="w-4 h-4" />
                <span>Time-Travel Replay</span>
              </div>
            </button>
          </div>

          {/* Group 3: SAFETY & BENCHMARK */}
          <div className="space-y-1">
            <div className="px-2 py-1 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              Safety & Security
            </div>

            <button
              onClick={() => onSelectTab('redteam')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'redteam'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Red-Team Safety Lab</span>
              </div>
            </button>

            <button
              onClick={() => onSelectTab('evaluation')}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer ${
                activeTab === 'evaluation'
                  ? 'bg-[#0C8CE9] text-white font-semibold shadow-xs'
                  : 'text-slate-300 hover:bg-[#13335A] hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>Evaluation Benchmark</span>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Merchant Account Profile Card */}
      <div className="p-3 border-t border-[#13335A] bg-[#07162C]">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-full bg-[#13335A] border border-[#1E487C] flex items-center justify-center font-bold text-xs text-white">
            {merchantName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">{merchantName}</div>
            <div className="text-[10px] text-slate-400 font-mono">MID_8492049 • HDFC Verified</div>
          </div>
        </div>
      </div>
    </aside>
  );
};
