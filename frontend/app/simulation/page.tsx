"use client";
import { useState, useEffect, useCallback } from "react";
import {
  connectAgentStream,
  simulateEvent,
  getInventoryAtRisk,
  getActiveEvents,
  InventoryAtRisk,
  ActiveEvent,
  simulateNewsEvent,
  simulateSandbox,
} from "../../lib/api";
function formatUSD(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function SimulationPage() {
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

  // Sandbox State
  const [sbxSource, setSbxSource] = useState("News");
  const [sbxSeverity, setSbxSeverity] = useState("Critical");
  const [sbxExposure, setSbxExposure] = useState<number>(5000000);
  const [sbxFreightType, setSbxFreightType] = useState("abundant");

  const handleSandboxSimulate = async () => {
    try {
      setTriggering(true);
      setActiveStep(1);

      // Construct mocked API data based on dropdowns
      let mockExposure = sbxExposure;
      let mockMatchedPos = mockExposure > 0 ? ["PO-SANDBOX-1", "PO-SANDBOX-2"] : [];
      
      let mockFreightQuotes: any[] = [];
      if (sbxFreightType === "abundant") {
        mockFreightQuotes = [
          { quote_id: "FQ-SBX-1", carrier: "Oceanic Lines (Ocean)", mode: "ocean", cost_usd: 8000, transit_days: 14 },
          { quote_id: "FQ-SBX-2", carrier: "Global Freight (Ocean)", mode: "ocean", cost_usd: 12000, transit_days: 12 }
        ];
      } else if (sbxFreightType === "expensive_air_only") {
        mockFreightQuotes = [
          { quote_id: "FQ-SBX-1", carrier: "SpeedAir (Air)", mode: "air", cost_usd: 85000, transit_days: 2 }
        ];
      } else if (sbxFreightType === "mixed") {
        mockFreightQuotes = [
          { quote_id: "FQ-SBX-1", carrier: "Oceanic Lines (Ocean)", mode: "ocean", cost_usd: 14000, transit_days: 18 },
          { quote_id: "FQ-SBX-2", carrier: "SpeedAir (Air)", mode: "air", cost_usd: 65000, transit_days: 3 }
        ];
      } else if (sbxFreightType === "rail") {
        mockFreightQuotes = [
          { quote_id: "FQ-SBX-1", carrier: "EuroRail (Train)", mode: "rail", cost_usd: 11000, transit_days: 8 }
        ];
      } else if (sbxFreightType === "none") {
        mockFreightQuotes = [{ error: "No capacity available on any mode" }];
      }

      const isNews = sbxSource === "News";

      const res = await simulateSandbox({
        event_headline: isNews ? "Sandbox News Scenario Triggered" : `Sandbox ${sbxSource} Alert Issued`,
        event_description: isNews ? "A custom news disruption was injected via the Sandbox mode." : `A severe ${sbxSource.toLowerCase()} event was detected.`,
        severity: sbxSeverity,
        exposure_value_usd: mockExposure,
        matched_pos: mockMatchedPos,
        freight_quotes: mockFreightQuotes
      });

      setToast(`Sandbox Agent started — Thread ${res.thread_id.split("-").pop()}`);
      setTimeout(() => setToast(null), 8000);
      setTimeout(refresh, 3000);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to trigger Sandbox: ${e.message || String(e)}`);
    } finally {
      setTriggering(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const [inv, evts] = await Promise.all([getInventoryAtRisk(), getActiveEvents()]);
      setInventory(inv);
      setActiveEvents(evts);
    } catch (e) {
      console.error("Failed to refresh data", e);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem("agentActiveStep", activeStep.toString());
  }, [activeStep]);

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
      setTimeout(refresh, 3000);
    } catch (e: any) {
      console.error(e);
      alert(`Failed to trigger disruption: ${e.message || String(e)}`);
    } finally {
      setTriggering(false);
    }
  };

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
      {/* Left Panel: Simulation Controls & Map */}
      <div className="flex-1 space-y-unit-lg overflow-y-auto pr-2 pb-8">
        <div className="flex justify-between items-center">
          <h1 className="font-headline-lg text-on-surface">Simulation Engine</h1>
        </div>

        {toast && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] rounded-lg px-unit-md py-unit-sm">
            {toast}
          </div>
        )}

        {/* Crisis Scenarios */}
        <div className="bg-surface-container-low p-unit-md rounded-xl border border-outline-variant space-y-unit-md">
          <div className="flex items-center space-x-2 text-primary">
            <span className="material-symbols-outlined text-[18px]">public</span>
            <h2 className="text-[13px] font-bold">Live Demo Scenarios (News Intelligence)</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              {
                label: "Hormuz Closed",
                headline: "Strait of Hormuz Blocked After Security Incident",
                description: "All commercial traffic through the Strait of Hormuz has been halted indefinitely following a major security incident, severely disrupting Middle East to Europe shipping routes.",
                source: "Reuters"
              },
              {
                label: "Bab el Mandeb Closed",
                headline: "Bab el Mandeb Strait Closed to Commercial Shipping",
                description: "Due to escalating regional tensions, maritime authorities have closed the Bab el Mandeb Strait. Vessels are being forced to reroute around the Cape of Good Hope, adding weeks to Asia-Europe transit times.",
                source: "Bloomberg"
              },
              {
                label: "Malacca Closed",
                headline: "Strait of Malacca Shut Down Due to Massive Collision",
                description: "A catastrophic collision involving three mega-ships has completely blocked the Strait of Malacca. Authorities state it may take weeks to clear the vital waterway connecting Asian manufacturing hubs to global markets.",
                source: "Lloyd's List"
              },
              {
                label: "Suez Blocked",
                headline: "Ever Given 2.0: Mega-Ship Runs Aground in Suez Canal",
                description: "A 24,000 TEU container ship has run aground and completely blocked the Suez Canal in both directions. Hundreds of ships are backing up as salvage crews struggle to free the vessel.",
                source: "WSJ"
              }
            ].map(scenario => (
              <button
                key={scenario.label}
                onClick={async () => {
                  try {
                    setTriggering(true);
                    setActiveStep(1);
                    const res = await simulateNewsEvent({
                      headline: scenario.headline,
                      description: scenario.description,
                      source: scenario.source
                    });
                    if (res.disruptions_triggered > 0) {
                      setToast(`Agent started — processing news disruption from ${scenario.source}`);
                    } else {
                      setToast(`News processed, but LLM did not confidently trigger a disruption.`);
                    }
                    setTimeout(() => setToast(null), 8000);
                  } catch (e: any) {
                    alert(`Failed to simulate news: ${e.message}`);
                  } finally {
                    setTriggering(false);
                  }
                }}
                disabled={triggering}
                className="bg-primary text-white text-[11px] px-unit-md py-unit-sm rounded-lg flex items-center shadow-sm hover:brightness-110 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[14px] mr-1.5">newspaper</span>
                {triggering ? "Starting…" : scenario.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sandbox / God Mode */}
        <div className="bg-surface-container-low p-unit-md rounded-xl border border-outline-variant space-y-unit-md">
          <div className="flex items-center space-x-2 text-primary">
            <span className="material-symbols-outlined text-[18px]">construction</span>
            <h2 className="text-[13px] font-bold">Sandbox Mode (API Override)</h2>
            <span className="text-[9px] bg-primary-container text-on-primary-container px-1.5 py-0.5 rounded uppercase tracking-widest font-bold ml-auto">God Mode</span>
          </div>
          <div className="grid grid-cols-4 gap-unit-md items-end">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Disruption Source</label>
              <select 
                value={sbxSource}
                onChange={(e) => setSbxSource(e.target.value)}
                className="w-full bg-surface text-[11px] text-on-surface p-2 rounded-lg border border-outline-variant"
              >
                <option value="News">News (Geopolitical / Strikes)</option>
                <option value="Weather">Weather (NOAA Alerts)</option>
                <option value="Supplier">Supplier (Bankruptcy / Fire)</option>
                <option value="Cyber">Cyber Attack (Port Hack)</option>
                <option value="Regulatory">Regulatory (Customs Ban)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Disruption Severity</label>
              <select 
                value={sbxSeverity}
                onChange={(e) => setSbxSeverity(e.target.value)}
                className="w-full bg-surface text-[11px] text-on-surface p-2 rounded-lg border border-outline-variant"
              >
                <option value="Minor">Minor (No known threat)</option>
                <option value="Moderate">Moderate (Possible threat)</option>
                <option value="Severe">Severe (Significant threat)</option>
                <option value="Extreme">Extreme (Extraordinary threat)</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">ERP Exposure Data</label>
              <select 
                value={sbxExposure}
                onChange={(e) => setSbxExposure(Number(e.target.value))}
                className="w-full bg-surface text-[11px] text-on-surface p-2 rounded-lg border border-outline-variant"
              >
                <option value={15000000}>Catastrophic ($15,000,000 at risk)</option>
                <option value={5000000}>High Risk ($5,000,000 at risk)</option>
                <option value={800000}>Medium Risk ($800,000 at risk)</option>
                <option value={50000}>Low Risk ($50,000 at risk)</option>
                <option value={0}>No Exposure ($0 at risk)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">Freight API Data</label>
              <select 
                value={sbxFreightType}
                onChange={(e) => setSbxFreightType(e.target.value)}
                className="w-full bg-surface text-[11px] text-on-surface p-2 rounded-lg border border-outline-variant"
              >
                <option value="abundant">Abundant Cheap Ocean ($8k)</option>
                <option value="mixed">Mixed Ocean & Air Options</option>
                <option value="rail">Overland Rail Available ($11k)</option>
                <option value="expensive_air_only">Expensive Air Only ($85k)</option>
                <option value="none">No Capacity (Error)</option>
              </select>
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={handleSandboxSimulate}
              disabled={triggering}
              className="w-full bg-primary text-white text-[12px] font-bold py-2 rounded-lg flex items-center justify-center hover:brightness-110 disabled:opacity-60 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] mr-2">precision_manufacturing</span>
              {triggering ? "Injecting Data to Agent..." : "Inject Custom Data & Run Agent"}
            </button>
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
            <div className="text-[10px] text-on-surface-variant flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1.5 shrink-0"></span>
              Tracking {activeEvents.length} event{activeEvents.length !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
