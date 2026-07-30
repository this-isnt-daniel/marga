"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
  connectAgentStream,
  simulateEvent,
  getInventoryAtRisk,
  getActiveEvents,
  InventoryAtRisk,
  ActiveEvent,
  POAtRisk,
} from "../lib/api";

function formatUSD(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: "bg-amber-100",   text: "text-amber-700",   label: "Pending Review" },
  approved: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Approved" },
  rejected: { bg: "bg-rose-100",    text: "text-rose-700",    label: "Rejected" },
};

export default function HomePage() {
  const [activeStep, setActiveStep] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("agentActiveStep");
      if (saved) return parseInt(saved, 10);
    }
    return 1;
  });

  const [toast, setToast] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryAtRisk | null>(null);
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [triggering, setTriggering] = useState(false);

  // Fetch live data
  const refresh = useCallback(async () => {
    try {
      const [inv, evts] = await Promise.all([getInventoryAtRisk(), getActiveEvents()]);
      setInventory(inv);
      setActiveEvents(evts);
    } catch (e) {
      console.error("Failed to refresh dashboard data", e);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    const interval = setInterval(refresh, 30_000); // Poll every 30s
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem("agentActiveStep", activeStep.toString());
  }, [activeStep]);

  // WebSocket — agent thought stream updates step AND triggers a data refresh
  useEffect(() => {
    const disconnect = connectAgentStream((data) => {
      const thought = data?.data?.thought?.toLowerCase() || "";
      const node = data?.data?.node || "";

      if (node === "execute" && thought.includes("rejected")) setActiveStep(7);
      else if (node === "execute" || thought.includes("executing")) setActiveStep(6);
      else if (node === "hitl_gate" || thought.includes("hitl") || thought.includes("pending")) setActiveStep(5);
      else if (thought.includes("cost") || thought.includes("stockout") || thought.includes("saving")) setActiveStep(4);
      else if (thought.includes("freight") || thought.includes("quote")) setActiveStep(3);
      else if (thought.includes("exposure") || thought.includes("erp") || thought.includes("po")) setActiveStep(2);

      // Refresh data whenever the agent reports something new
      refresh();
    });
    return () => disconnect();
  }, [refresh]);

  const handleSimulate = async (route?: string, vessel_id?: string) => {
    try {
      setTriggering(true);
      setActiveStep(1);
      const result = await simulateEvent({ route, vessel_id });
      setToast(`Agent started — tracking event ${result.event_id} on ${route ?? "Shanghai to Los Angeles"}`);
      setTimeout(() => setToast(null), 8000);
      // Refresh after a brief delay to pick up the new card
      setTimeout(refresh, 3000);
    } catch (e) {
      console.error(e);
      alert("Failed to trigger disruption");
    } finally {
      setTriggering(false);
    }
  };

  // Derived stats from live data
  const pendingCount = activeEvents.filter((e) => e.status === "pending").length;
  const totalExposure = inventory?.total_exposure_usd ?? 0;
  const atRiskPos = inventory?.at_risk_pos ?? 0;
  const totalPos = inventory?.total_pos ?? 0;
  const slaHealth = totalPos > 0 ? (((totalPos - pendingCount) / totalPos) * 100).toFixed(1) : "100.0";

  // Flatten all POs across all routes for the risk table
  const allPOs: (POAtRisk & { route: string })[] = (inventory?.routes ?? []).flatMap((r) =>
    r.pos.map((p) => ({ ...p, route: r.route }))
  );

  const getStepStatus = (step: number) => {
    if (activeStep > step) return "completed";
    if (activeStep === step) return "active";
    return "pending";
  };

  const renderStepIcon = (step: number) => {
    const status = getStepStatus(step);
    if (status === "completed") {
      return (
        <div className="w-6 h-6 rounded-full bg-emerald-100 border border-emerald-500 flex items-center justify-center mr-3 shrink-0">
          <span className="material-symbols-outlined text-emerald-600 text-[14px] font-bold">check</span>
        </div>
      );
    } else if (status === "active") {
      return (
        <div className="w-6 h-6 rounded-full border border-amber-500 flex items-center justify-center mr-3 shrink-0 bg-white relative">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          <div className="absolute inset-0 rounded-full border border-amber-500 animate-ping opacity-20"></div>
        </div>
      );
    } else {
      return (
        <div className="w-6 h-6 rounded-full border border-outline-variant flex items-center justify-center mr-3 shrink-0 bg-white">
          <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
        </div>
      );
    }
  };

  return (
    <main className="ml-64 mt-16 p-unit-lg flex space-x-unit-lg h-[calc(100vh-64px)] overflow-hidden">
      {/* Left Panel */}
      <div className="flex-1 space-y-unit-lg overflow-y-auto pr-2 pb-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-headline-lg text-on-surface">Dashboard</h1>
          <div className="flex items-center space-x-2">
            {/* NOAA poller indicator */}
            <span className="flex items-center text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
              NOAA Polling Active
            </span>
            <button
              onClick={() => handleSimulate()}
              disabled={triggering}
              className="bg-primary text-white text-[11px] px-unit-md py-unit-sm rounded-lg flex items-center shadow-sm hover:brightness-110 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[16px] mr-1">smart_toy</span>
              {triggering ? "Starting…" : "Simulate Disruption"}
            </button>
          </div>
        </div>

        {toast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg px-unit-md py-unit-sm">
            {toast}
          </div>
        )}

        {/* Live Stat Cards */}
        <div className="grid grid-cols-4 gap-unit-md">
          {/* Active Disruptions */}
          <div className="card-surface p-unit-md rounded-xl flex flex-col justify-between h-36">
            <div className="flex justify-between items-center text-on-surface-variant mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Active Disruptions</span>
              <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-on-surface leading-none">
                  {loadingInventory ? "—" : pendingCount}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">
                  {pendingCount === 0 ? "All clear" : `${pendingCount} awaiting review`}
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pendingCount > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                {pendingCount > 0 ? "Action needed" : "Nominal"}
              </span>
            </div>
          </div>

          {/* POs at Risk */}
          <div className="card-surface p-unit-md rounded-xl flex flex-col justify-between h-36">
            <div className="flex justify-between items-center text-on-surface-variant mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">POs Tracked</span>
              <span className="material-symbols-outlined text-primary text-[18px]">package_2</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-on-surface leading-none">
                  {loadingInventory ? "—" : atRiskPos}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">
                  Across {inventory?.routes.length ?? 0} route{inventory?.routes.length !== 1 ? "s" : ""}
                </div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Live ERP
              </span>
            </div>
          </div>

          {/* Est. Exposure */}
          <div className="card-surface p-unit-md rounded-xl flex flex-col justify-between h-36">
            <div className="flex justify-between items-center text-on-surface-variant mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">Est. Exposure</span>
              <span className="material-symbols-outlined text-error text-[18px]">payments</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-on-surface leading-none">
                  {loadingInventory ? "—" : formatUSD(totalExposure)}
                </div>
                <div className="text-[10px] text-on-surface-variant mt-1">Total inventory value</div>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-error/10 text-error">
                In Transit
              </span>
            </div>
          </div>

          {/* SLA Health */}
          <div className="card-surface p-unit-md rounded-xl flex flex-col justify-between h-36">
            <div className="flex justify-between items-center text-on-surface-variant mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest">SLA Health</span>
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold text-on-surface leading-none">{slaHealth}%</div>
                <div className="text-[10px] text-on-surface-variant mt-1">Target: 95%</div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${parseFloat(slaHealth) >= 95 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {parseFloat(slaHealth) >= 95 ? "On Target" : "Below Target"}
              </span>
            </div>
          </div>
        </div>

        {/* Routes & Alerts Grid */}
        <div className="grid grid-cols-3 gap-unit-lg">
          {/* Live Route Risk List */}
          <div className="card-surface rounded-xl flex flex-col col-span-1 h-[400px]">
            <div className="p-unit-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-xl">
              <h2 className="text-sm font-semibold text-on-surface">Routes at Risk</h2>
              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Live ERP</span>
            </div>
            <div className="p-unit-md space-y-unit-md flex-1 overflow-y-auto">
              {loadingInventory ? (
                <div className="text-[11px] text-on-surface-variant animate-pulse">Loading routes…</div>
              ) : inventory?.routes.length === 0 ? (
                <div className="text-[11px] text-on-surface-variant">No routes tracked.</div>
              ) : (
                inventory?.routes.map((r) => {
                  const maxExposure = Math.max(...(inventory?.routes.map(x => x.exposure_usd) ?? [1]));
                  const pct = Math.round((r.exposure_usd / maxExposure) * 100);
                  return (
                    <div key={r.route} className="space-y-1.5">
                      <div className="flex justify-between text-[11px]">
                        <span className="font-medium text-on-surface truncate max-w-[70%]">{r.route}</span>
                        <span className="font-bold text-error ml-2">{formatUSD(r.exposure_usd)}</span>
                      </div>
                      <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden">
                        <div className="h-full bg-error rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
                      </div>
                      <div className="flex justify-between text-[9px] text-on-surface-variant">
                        <span className="font-medium">{r.po_count} PO{r.po_count !== 1 ? "s" : ""} tracked</span>
                        <span className="font-medium">{pct}% of exposure</span>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Quick simulate buttons per route */}
              {!loadingInventory && inventory?.routes.map((r) => (
                <button
                  key={`sim-${r.route}`}
                  onClick={() => handleSimulate(r.route, r.pos[0]?.vessel_id)}
                  className="w-full mt-1 py-1.5 border border-outline-variant rounded-lg text-[10px] text-on-surface font-semibold hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors text-left px-2 flex items-center"
                >
                  <span className="material-symbols-outlined text-[12px] mr-1">bolt</span>
                  Simulate disruption on {r.route.split(" to ")[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Active Alerts Panel */}
          <div className="card-surface rounded-xl flex flex-col col-span-2 h-[400px]">
            <div className="p-unit-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-xl shrink-0">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">notifications_active</span>
              <h2 className="text-sm font-semibold text-on-surface">Active Alerts</h2>
              {pendingCount > 0 && (
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{pendingCount} pending</span>
              )}
            </div>
            <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">From agent</span>
          </div>
          <div className="divide-y divide-outline-variant flex-1 overflow-y-auto">
            {activeEvents.length === 0 ? (
              <div className="p-unit-md text-[12px] text-on-surface-variant">
                No active alerts. Use &quot;Simulate Disruption&quot; to trigger the agent.
              </div>
            ) : (
              activeEvents.map((evt) => {
                const s = STATUS_COLORS[evt.status] ?? STATUS_COLORS["pending"];
                return (
                  <div key={evt.event_id} className="p-unit-md flex items-start space-x-unit-md hover:bg-surface-container-low transition-colors">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${evt.status === "approved" ? "bg-emerald-100" : evt.status === "rejected" ? "bg-rose-100" : "bg-amber-100"}`}>
                      <span className={`material-symbols-outlined text-[20px] ${evt.status === "approved" ? "text-emerald-600" : evt.status === "rejected" ? "text-rose-600" : "text-amber-600"}`}>
                        {evt.status === "approved" ? "check_circle" : evt.status === "rejected" ? "cancel" : "warning"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[12px] font-bold text-on-surface truncate">{evt.event_id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ml-2 shrink-0 ${s.bg} ${s.text}`}>{s.label}</span>
                      </div>
                      <div className="text-[11px] text-on-surface-variant truncate">{evt.route} · {evt.vessel_id}</div>
                      <div className="text-[10px] text-on-surface-variant mt-0.5 truncate">{evt.description}</div>
                      <div className="flex items-center space-x-3 mt-1.5 text-[10px]">
                        <span className="text-error font-bold">{formatUSD(evt.exposure_usd)} exposure</span>
                        {evt.stockout_cost_usd > 0 && <span className="text-on-surface-variant">{formatUSD(evt.stockout_cost_usd)} stockout risk</span>}
                        <span className="text-on-surface-variant">{evt.matched_pos.length} PO{evt.matched_pos.length !== 1 ? "s" : ""} affected</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            </div>
          </div>
        </div>

        {/* PO Risk Table */}
        <div className="card-surface rounded-xl overflow-hidden pb-unit-lg">
          <div className="p-unit-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low rounded-t-xl">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-primary text-[18px]">table_rows</span>
              <h2 className="text-sm font-semibold text-on-surface">Purchase Orders — Inventory at Risk</h2>
            </div>
            <span className="text-[10px] text-on-surface-variant font-bold">{allPOs.length} POs tracked</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-low text-on-surface-variant uppercase tracking-widest text-[9px]">
                  <th className="text-left px-unit-md py-2 font-bold">PO ID</th>
                  <th className="text-left px-unit-md py-2 font-bold">Product</th>
                  <th className="text-left px-unit-md py-2 font-bold">Supplier</th>
                  <th className="text-left px-unit-md py-2 font-bold">Route</th>
                  <th className="text-left px-unit-md py-2 font-bold">Vessel</th>
                  <th className="text-right px-unit-md py-2 font-bold">Qty</th>
                  <th className="text-right px-unit-md py-2 font-bold">Value</th>
                  <th className="text-center px-unit-md py-2 font-bold">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {loadingInventory ? (
                  <tr>
                    <td colSpan={8} className="px-unit-md py-4 text-on-surface-variant text-center animate-pulse">Loading inventory…</td>
                  </tr>
                ) : allPOs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-unit-md py-4 text-on-surface-variant text-center">No POs found.</td>
                  </tr>
                ) : (
                  allPOs.map((po) => (
                    <tr key={po.po_id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-unit-md py-2.5 font-bold text-primary">{po.po_id}</td>
                      <td className="px-unit-md py-2.5 font-medium text-on-surface">{po.product}</td>
                      <td className="px-unit-md py-2.5 text-on-surface-variant">{po.supplier}</td>
                      <td className="px-unit-md py-2.5 text-on-surface-variant">{po.route}</td>
                      <td className="px-unit-md py-2.5 text-on-surface-variant">{po.vessel_id}</td>
                      <td className="px-unit-md py-2.5 text-right font-mono text-on-surface">{po.quantity.toLocaleString()}</td>
                      <td className="px-unit-md py-2.5 text-right font-bold text-error">{formatUSD(po.value_usd)}</td>
                      <td className="px-unit-md py-2.5 text-center">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${po.match_confidence >= 1.0 ? "bg-emerald-100 text-emerald-700" : po.match_confidence >= 0.8 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                          {Math.round(po.match_confidence * 100)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Right Panel: Agent Activity */}
      <div className="w-80 h-full overflow-hidden flex flex-col space-y-unit-lg">
        <div className="card-surface rounded-xl flex-1 flex flex-col">
          <div className="p-unit-md border-b border-outline-variant bg-surface-container-low flex items-center justify-between rounded-t-xl">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-primary text-[20px]">smart_toy</span>
              <h2 className="text-sm font-semibold text-on-surface">Agent Workflow</h2>
            </div>
            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">Active</span>
          </div>
          <div className="p-unit-md relative flex-1 overflow-y-auto">
            <div className="timeline-line"></div>
            <div className="space-y-6 relative z-10">
              {[
                { step: 1, title: "Monitor Surveillance", desc: "Polling NOAA weather & maritime feeds." },
                { step: 2, title: "Identify Exposure", desc: "Cross-referencing ERP for affected POs." },
                { step: 3, title: "Generate Alternatives", desc: "Fetching active freight quotes & routing." },
                { step: 4, title: "Reason Trade-offs", desc: "Analyzing cost vs. delay impacts." },
                { step: 5, title: "Propose & Confirm", desc: "Awaiting human oversight & HITL approval." },
              ].map(({ step, title, desc }) => (
                <div key={step} className={`flex items-start ${getStepStatus(step) === "pending" ? "opacity-40" : ""}`}>
                  {renderStepIcon(step)}
                  <div>
                    <div className={`text-[11px] font-bold ${getStepStatus(step) === "active" ? "text-amber-600" : "text-on-surface"}`}>{title}</div>
                    <div className="text-[10px] text-on-surface-variant mt-0.5 leading-relaxed font-medium">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="p-unit-md bg-surface-container-low border-t border-outline-variant rounded-b-xl space-y-2">
            {/* Poller status */}
            <div className="text-[10px] text-on-surface-variant flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5 shrink-0"></span>
              NOAA polling every 5 min · {activeEvents.length} event{activeEvents.length !== 1 ? "s" : ""} tracked
            </div>
            <Link href="/alerts" className="w-full bg-primary text-white py-2 rounded-lg text-xs font-bold hover:brightness-110 transition-all flex items-center justify-center space-x-2 shadow-sm">
              <span>View Pending Actions</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
