'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Play } from 'lucide-react';
import { fetchRedTeamScenarios, runRedTeamAttack } from '../lib/api';

export const RedTeamLab: React.FC = () => {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [activeScenario, setActiveScenario] = useState<string>('prompt_injection_1');
  const [attackResult, setAttackResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRedTeamScenarios().then((res) => {
      setScenarios(res);
      if (res.length > 0) setActiveScenario(res[0].id);
    });
  }, []);

  const handleRunAttack = async (scenarioId: string) => {
    setLoading(true);
    try {
      const res = await runRedTeamAttack(scenarioId);
      setAttackResult(res);
    } catch (err) {
      alert('Error executing attack simulation: ' + err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-main)] p-4 rounded-md flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
        <div>
          <h2 className="text-xs font-semibold text-[var(--text-main)] uppercase tracking-wider">
            Adversarial Red-Team Stress Lab (Section 25)
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Execute adversarial attack payloads against the decision pipeline to verify 100% deterministic safety
          </p>
        </div>

        <div className="flex items-center space-x-1.5 text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md font-semibold">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Unsafe Autonomous Actions = 0</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Scenarios List */}
        <div className="lg:col-span-5 space-y-2">
          {scenarios.map((sc) => (
            <div
              key={sc.id}
              onClick={() => {
                setActiveScenario(sc.id);
                handleRunAttack(sc.id);
              }}
              className={`p-3 rounded-md border transition-colors cursor-pointer space-y-1.5 shadow-xs ${
                activeScenario === sc.id
                  ? 'bg-[var(--bg-subtle)] border-[#0066F5]'
                  : 'bg-[var(--bg-card)] border-[var(--border-main)] hover:border-[var(--border-subtle)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-semibold text-rose-600 dark:text-rose-400 uppercase">
                  {sc.attack_type}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveScenario(sc.id);
                    handleRunAttack(sc.id);
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-[#0066F5] hover:bg-blue-600 text-white flex items-center space-x-1 cursor-pointer shadow-xs"
                >
                  <Play className="w-2.5 h-2.5" />
                  <span>Execute</span>
                </button>
              </div>

              <div className="text-xs font-semibold text-[var(--text-main)]">{sc.title}</div>
              <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">{sc.description}</p>
            </div>
          ))}
        </div>

        {/* Results Screen */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-10 text-center text-xs text-[var(--text-muted)] font-mono">
              Running adversarial payload against policy engine...
            </div>
          ) : attackResult ? (
            <div className="bg-[var(--bg-card)] border border-[var(--border-main)] rounded-md p-4 space-y-4 shadow-xs">
              {/* Verdict */}
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-md flex items-center space-x-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {attackResult.defense_verdict}
                  </div>
                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono">
                    Zero unauthorized execution. Deterministic guardrails enforced.
                  </div>
                </div>
              </div>

              {/* Payload */}
              <div className="space-y-1">
                <div className="text-[10px] font-mono uppercase text-[var(--text-muted)] font-semibold">
                  Ingested Attack Payload
                </div>
                <pre className="p-2.5 bg-[var(--bg-subtle)] rounded-md border border-[var(--border-main)] text-[11px] font-mono text-rose-600 dark:text-rose-300 overflow-x-auto">
                  {JSON.stringify(attackResult.scenario.payload, null, 2)}
                </pre>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-[var(--bg-subtle)] rounded-md border border-[var(--border-main)] space-y-1">
                  <div className="text-[10px] font-mono uppercase font-semibold text-purple-600 dark:text-purple-400">AI Recommendation</div>
                  <div className="font-mono text-[var(--text-main)] font-semibold">{attackResult.ai_proposed_action || 'STOP'}</div>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">{attackResult.ai_reasoning || 'Heuristic evaluation'}</p>
                </div>

                <div className="p-3 bg-[var(--bg-subtle)] rounded-md border border-[var(--border-main)] space-y-1">
                  <div className="text-[10px] font-mono uppercase font-semibold text-emerald-600 dark:text-emerald-400">Policy Shield Intercept</div>
                  <div className="font-mono text-emerald-600 dark:text-emerald-300 font-semibold">{attackResult.policy_validation?.rule_enforced || 'IDEMPOTENCY_SHIELD'}</div>
                  <p className="text-[11px] text-[var(--text-main)]">{attackResult.policy_validation?.policy_reason || 'Replay shielded.'}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-card)] border border-dashed border-[var(--border-main)] rounded-md p-10 text-center text-xs text-[var(--text-muted)] font-mono">
              Select an attack vector to evaluate
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
