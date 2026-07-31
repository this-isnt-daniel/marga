"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { connectAgentStream } from "../../lib/api";

interface AuditEntry {
  id: number;
  timestamp: number;
  type: "agent_thought" | "api_call" | "reasoning_step" | "state_update";
  data: Record<string, unknown>;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string; bg: string }> = {
  agent_thought:  { icon: "psychology", label: "Agent Thought", color: "text-blue-600",    bg: "bg-blue-50 border-blue-200" },
  reasoning_step: { icon: "neurology",  label: "Reasoning",     color: "text-violet-600",  bg: "bg-violet-50 border-violet-200" },
  api_call:       { icon: "api",        label: "API Call",      color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  state_update:   { icon: "route",      label: "State Update",  color: "text-gray-500",    bg: "bg-gray-50 border-gray-200" },
};

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() / 1000) - ts);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const idCounter = useRef(0);

  // Fetch existing audit logs from backend on mount
  const fetchExisting = useCallback(async () => {
    try {
      const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8004";
      const res = await fetch(`${API_BASE}/audit/logs?limit=200`, { cache: "no-store" });
      if (res.ok) {
        const logs: { timestamp: number; type: string; data: Record<string, unknown> }[] = await res.json();
        const mapped = logs.reverse().map((l) => ({
          id: idCounter.current++,
          timestamp: l.timestamp,
          type: l.type as AuditEntry["type"],
          data: l.data,
        }));
        setEntries(mapped);
      }
    } catch {
      // Backend might not be up yet
    }
  }, []);

  useEffect(() => {
    fetchExisting();
  }, [fetchExisting]);

  // Live WebSocket stream
  useEffect(() => {
    const disconnect = connectAgentStream((msg: { type: string; data: Record<string, unknown> }) => {
      const entry: AuditEntry = {
        id: idCounter.current++,
        timestamp: Date.now() / 1000,
        type: msg.type as AuditEntry["type"],
        data: msg.data,
      };
      setEntries((prev) => [...prev.slice(-498), entry]);
    });
    return () => disconnect();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = entries.filter((e) => {
    if (filter !== "all" && e.type !== filter) return false;
    if (eventFilter && !JSON.stringify(e.data).toLowerCase().includes(eventFilter.toLowerCase())) return false;
    return true;
  });

  const uniqueEventIds = Array.from(
    new Set(
      entries
        .map((e) => {
          const d = e.data as Record<string, unknown>;
          const thought = (d.thought as string) || "";
          const match = thought.match(/NEWS-[A-Z0-9]+|EVT-[A-Z0-9]+|SIM-[A-Z0-9]+|SBX-[A-Z0-9]+/);
          return match?.[0] || "";
        })
        .filter(Boolean)
    )
  );

  return (
    <main className="ml-64 mt-16 p-unit-lg flex flex-col h-[calc(100vh-64px)] overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center mb-unit-lg shrink-0">
        <div className="flex items-center space-x-3">
          <h1 className="font-headline-lg text-on-surface">Audit Trail</h1>
          <span className="flex items-center text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
            Live
          </span>
          <span className="text-[10px] text-on-surface-variant bg-surface-container-low border border-outline-variant px-2 py-1 rounded-lg font-bold">
            {filtered.length} entries
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${autoScroll ? "bg-primary text-white" : "bg-surface-container-low text-on-surface-variant border border-outline-variant"}`}
          >
            <span className="material-symbols-outlined text-[14px] mr-1 align-middle">vertical_align_bottom</span>
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </button>
          <button
            onClick={() => { setEntries([]); idCounter.current = 0; }}
            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[14px] mr-1 align-middle">delete_sweep</span>
            Clear
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-2 mb-unit-md shrink-0">
        {[
          { key: "all", label: "All", icon: "list" },
          { key: "agent_thought", label: "Thoughts", icon: "psychology" },
          { key: "reasoning_step", label: "Reasoning", icon: "neurology" },
          { key: "api_call", label: "API Calls", icon: "api" },
          { key: "state_update", label: "State", icon: "route" },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center space-x-1 ${filter === f.key ? "bg-primary/10 text-primary" : "bg-transparent text-on-surface-variant hover:bg-surface-container-high"}`}
          >
            <span className="material-symbols-outlined text-[14px]">{f.icon}</span>
            <span>{f.label}</span>
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative w-56">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">search</span>
          <input
            type="text"
            placeholder="Filter by keyword..."
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 pl-9 pr-3 text-[11px] text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant"
          />
        </div>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 pb-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] mb-3 opacity-30">receipt_long</span>
            <p className="text-sm font-medium">No audit entries yet</p>
            <p className="text-[11px] mt-1">Trigger a simulation to see the agent&apos;s actions in real-time</p>
          </div>
        ) : (
          filtered.map((entry) => {
            const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.state_update;
            const isExpanded = expandedIds.has(entry.id);
            const d = entry.data as Record<string, unknown>;

            return (
              <div
                key={entry.id}
                className={`border rounded-xl p-unit-md cursor-pointer transition-all hover:shadow-sm ${config.bg}`}
                onClick={() => toggleExpand(entry.id)}
              >
                <div className="flex items-start space-x-3">
                  {/* Icon */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${config.color} bg-white/70`}>
                    <span className="material-symbols-outlined text-[18px]">{config.icon}</span>
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <span className={`text-[9px] font-bold uppercase tracking-widest ${config.color}`}>{config.label}</span>
                        {d.node ? <span className="text-[9px] bg-white/70 text-on-surface-variant px-1.5 py-0.5 rounded font-mono">{String(d.node)}</span> : null}
                        {d.service ? <span className="text-[9px] bg-white/70 text-on-surface-variant px-1.5 py-0.5 rounded font-mono">{String(d.service)}</span> : null}
                        {d.step_title ? <span className="text-[9px] bg-white/70 text-violet-700 px-1.5 py-0.5 rounded font-bold">{String(d.step_title)}</span> : null}
                        {d.confidence_score !== undefined || d.confidence !== undefined ? (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            Number(d.confidence_score || d.confidence) >= 0.8 ? "bg-emerald-100 text-emerald-700" :
                            Number(d.confidence_score || d.confidence) >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {Math.round(Number(d.confidence_score || d.confidence) * 100)}%
                          </span>
                        ) : null}
                        {d.status !== undefined && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${Number(d.status) === 200 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {String(d.status)}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-on-surface-variant font-mono shrink-0">{relativeTime(entry.timestamp)}</span>
                    </div>
                    {/* Main text */}
                    {d.thought ? <p className="text-[11px] text-on-surface leading-relaxed font-medium">{String(d.thought)}</p> : null}
                    {d.reasoning_text ? <p className="text-[11px] text-on-surface leading-relaxed font-medium">{String(d.reasoning_text)}</p> : null}
                    {d.endpoint && !d.thought ? <p className="text-[11px] text-on-surface font-mono">{String(d.service)} → {String(d.endpoint)}</p> : null}
                    {d.state_summary ? <p className="text-[11px] text-on-surface-variant">{String(d.state_summary)}</p> : null}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {Array.isArray(d.tool_calls) && d.tool_calls.length > 0 ? (
                          <div>
                            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Tool Calls</span>
                            <div className="mt-1 space-y-1">
                              {d.tool_calls.map((tc: any, i) => (
                                <div key={i} className="text-[10px] bg-white/50 rounded px-2 py-1 font-mono">
                                  <span className="text-primary font-bold">{tc.tool_name}</span>
                                  <span className="text-on-surface-variant ml-2">{tc.rationale}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {d.data_snapshot && typeof d.data_snapshot === 'object' && Object.keys(d.data_snapshot as object).length > 0 ? (
                          <div>
                            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Data Snapshot</span>
                            <pre className="mt-1 text-[10px] bg-white/50 rounded p-2 font-mono overflow-x-auto max-h-40 overflow-y-auto text-on-surface-variant">
                              {JSON.stringify(d.data_snapshot, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {d.request ? (
                          <div>
                            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Request</span>
                            <pre className="mt-1 text-[10px] bg-white/50 rounded p-2 font-mono overflow-x-auto max-h-32 overflow-y-auto text-on-surface-variant">
                              {JSON.stringify(d.request, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                        {d.response ? (
                          <div>
                            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">Response</span>
                            <pre className="mt-1 text-[10px] bg-white/50 rounded p-2 font-mono overflow-x-auto max-h-32 overflow-y-auto text-on-surface-variant">
                              {JSON.stringify(d.response, null, 2)}
                            </pre>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {/* Expand indicator */}
                  <span className={`material-symbols-outlined text-[16px] text-on-surface-variant transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`}>expand_more</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}
