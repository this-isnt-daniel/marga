"use client";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import {
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
  const [inventory, setInventory] = useState<InventoryAtRisk | null>(null);
  const [activeEvents, setActiveEvents] = useState<ActiveEvent[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);

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
    refresh();
    const interval = setInterval(refresh, 30_000); // Poll every 30s
    return () => clearInterval(interval);
  }, [refresh]);

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

  return (
    <main className="ml-64 mt-16 p-unit-lg flex flex-col space-y-unit-lg h-[calc(100vh-64px)] overflow-y-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="font-headline-lg text-on-surface">Dashboard</h1>
        <div className="flex items-center space-x-2">
          {/* NOAA poller indicator */}
          <span className="flex items-center text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
            Agent Surveillance Active
          </span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-unit-lg">
        {/* Total Exposure */}
        <div className="card-surface p-unit-lg rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Total Exposure</div>
            <div className="font-headline-lg text-on-surface">{formatUSD(totalExposure)}</div>
            <div className="text-xs text-error font-medium mt-1">Value at risk</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-error-container flex items-center justify-center">
            <span className="material-symbols-outlined text-on-error-container text-[24px]">payments</span>
          </div>
        </div>

        {/* POs at Risk */}
        <div className="card-surface p-unit-lg rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">POs At Risk</div>
            <div className="font-headline-lg text-on-surface">
              {loadingInventory ? "-" : atRiskPos} <span className="text-xl text-on-surface-variant">/ {totalPos}</span>
            </div>
            <div className="text-xs text-error font-medium mt-1">Require rerouting</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-700 text-[24px]">inventory_2</span>
          </div>
        </div>

        {/* Active Disruptions */}
        <div className="card-surface p-unit-lg rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Active Disruptions</div>
            <div className="font-headline-lg text-on-surface">{activeEvents.length}</div>
            <div className="text-xs text-amber-600 font-medium mt-1">{pendingCount} pending review</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[24px]">tsunami</span>
          </div>
        </div>

        {/* Resolution Health */}
        <div className="card-surface p-unit-lg rounded-xl flex items-center justify-between">
          <div>
            <div className="text-[12px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Resolution Health</div>
            <div className="font-headline-lg text-on-surface">{slaHealth}%</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">Agent mitigation rate</div>
          </div>
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
            <span className="material-symbols-outlined text-emerald-700 text-[24px]">health_and_safety</span>
          </div>
        </div>
      </div>


      {/* PO Risk Table */}
      <div className="card-surface rounded-xl overflow-hidden pb-unit-lg flex-shrink-0">
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
    </main>
  );
}

