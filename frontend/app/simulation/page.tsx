"use client";
import { useState, useEffect, useCallback, useRef } from "react";
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

interface FeedItem {
  id: number;
  timestamp: number;
  type: string;
  data: Record<string, unknown>;
}

const FEED_ICONS: Record<string, { icon: string; color: string; bg: string }> = {
  agent_thought:  { icon: "psychology",  color: "text-blue-600",    bg: "bg-blue-50" },
  reasoning_step: { icon: "neurology",   color: "text-violet-600",  bg: "bg-violet-50" },
  api_call:       { icon: "api",         color: "text-emerald-600", bg: "bg-emerald-50" },
  state_update:   { icon: "route",       color: "text-gray-500",    bg: "bg-gray-50" },
};

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

  // Reasoning Feed State
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const feedIdRef = useRef(0);
  const feedScrollRef = useRef<HTMLDivElement>(null);

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
      const mockExposure = sbxExposure;
      const mockMatchedPos = mockExposure > 0 ? ["PO-SANDBOX-1", "PO-SANDBOX-2"] : [];
      
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
      
      let realisticHeadline = "";
      let realisticDescription = "";
      
      if (sbxSource === "News") {
        realisticHeadline = `Global Supply Chain Alert: Massive Strike Action Detected`;
        realisticDescription = `Major union workers have initiated an unannounced strike affecting operations at key logistics hubs.`;
      } else if (sbxSource === "Weather") {
        realisticHeadline = `NOAA Alert: Category 5 Hurricane Approaching Major Port`;
        realisticDescription = `NOAA National Hurricane Center has issued extreme weather warnings. All port operations in the projected path are being suspended.`;
      } else if (sbxSource === "Supplier") {
        realisticHeadline = `Tier 1 Supplier Crisis: Factory Fire Halts Production`;
        realisticDescription = `A devastating fire has broken out at a primary manufacturing facility, causing an immediate halt to all production lines.`;
      } else if (sbxSource === "Cyber") {
        realisticHeadline = `Ransomware Attack Disables Terminal Operating System`;
        realisticDescription = `A sophisticated cyber attack has encrypted critical port infrastructure, forcing a complete shutdown of automated terminal operations.`;
      } else if (sbxSource === "Regulatory") {
        realisticHeadline = `Emergency Customs Embargo Enforced`;
        realisticDescription = `Government regulatory bodies have implemented an immediate embargo on specific imports pending a massive customs investigation.`;
      } else {
        realisticHeadline = `Sandbox ${sbxSource} Alert Issued`;
        realisticDescription = `A severe ${sbxSource.toLowerCase()} event was detected.`;
      }

      const res = await simulateSandbox({
        event_headline: realisticHeadline,
        event_description: realisticDescription,
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

  // WebSocket: update both step indicator AND reasoning feed
  useEffect(() => {
    const disconnect = connectAgentStream((data: { type: string; data: Record<string, unknown> }) => {
      // Add to feed
      const item: FeedItem = {
        id: feedIdRef.current++,
        timestamp: Date.now() / 1000,
        type: data.type,
        data: data.data,
      };
      setFeedItems((prev) => [...prev.slice(-98), item]);

      // Update step indicator
      const thought = (data?.data?.thought as string)?.toLowerCase() || "";
      const node = (data?.data?.node as string) || "";
      const stepTitle = (data?.data?.step_title as string)?.toLowerCase() || "";

      if (node === "execute" && thought.includes("rejected")) setActiveStep(7);
      else if (node === "execute" || thought.includes("executing") || thought.includes("booking")) setActiveStep(6);
      else if (node === "hitl_gate" || thought.includes("hitl") || thought.includes("pending") || thought.includes("approval")) setActiveStep(5);
      else if (thought.includes("cost") || thought.includes("stockout") || thought.includes("saving") || stepTitle.includes("cost")) setActiveStep(4);
      else if (thought.includes("freight") || thought.includes("quote") || stepTitle.includes("freight")) setActiveStep(3);
      else if (thought.includes("exposure") || thought.includes("erp") || thought.includes("po") || stepTitle.includes("erp")) setActiveStep(2);
      
      refresh();
    });
    return () => disconnect();
  }, [refresh]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedScrollRef.current) {
      feedScrollRef.current.scrollTop = feedScrollRef.current.scrollHeight;
    }
  }, [feedItems]);

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
        <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-500 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-emerald-600 text-[12px] font-bold">check</span>
        </div>
      );
    } else if (status === "active") {
      return (
        <div className="w-5 h-5 rounded-full border border-amber-500 flex items-center justify-center shrink-0 bg-white relative">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
        </div>
      );
    } else {
      return (
        <div className="w-5 h-5 rounded-full border border-outline-variant flex items-center justify-center shrink-0 bg-white">
          <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
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
                    setFeedItems([]);
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

      {/* Right Panel: Agent Reasoning Feed */}
      <div className="w-96 h-full overflow-hidden flex flex-col space-y-unit-sm">
        {/* Compact Step Progress */}
        <div className="card-surface rounded-xl p-unit-md">
          <div className="flex items-center justify-between mb-unit-sm">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-primary text-[18px]">smart_toy</span>
              <h2 className="text-[12px] font-bold text-on-surface">Agent Progress</h2>
            </div>
            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold uppercase">
              {activeEvents.length} event{activeEvents.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            {[
              { step: 1, label: "Monitor" },
              { step: 2, label: "ERP" },
              { step: 3, label: "Freight" },
              { step: 4, label: "Cost" },
              { step: 5, label: "HITL" },
            ].map(({ step, label }) => (
              <div key={step} className="flex items-center space-x-1">
                {renderStepIcon(step)}
                <span className={`text-[9px] font-bold ${getStepStatus(step) === "active" ? "text-amber-600" : getStepStatus(step) === "completed" ? "text-emerald-600" : "text-on-surface-variant opacity-40"}`}>
                  {label}
                </span>
                {step < 5 && <span className="text-outline-variant text-[8px] mx-0.5">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Live Reasoning Feed */}
        <div className="card-surface rounded-xl flex-1 flex flex-col overflow-hidden">
          <div className="p-unit-md border-b border-outline-variant bg-surface-container-low flex items-center justify-between rounded-t-xl shrink-0">
            <div className="flex items-center space-x-2">
              <span className="material-symbols-outlined text-violet-600 text-[18px]">neurology</span>
              <h2 className="text-[12px] font-bold text-on-surface">Reasoning Feed</h2>
              <span className="flex items-center text-[9px] text-emerald-600 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1"></span>
                Live
              </span>
            </div>
            <button
              onClick={() => { setFeedItems([]); feedIdRef.current = 0; }}
              className="text-[9px] text-on-surface-variant hover:text-on-surface font-bold uppercase tracking-widest transition-colors"
            >
              Clear
            </button>
          </div>
          <div ref={feedScrollRef} className="flex-1 overflow-y-auto p-unit-sm space-y-1.5">
            {feedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] mb-2 opacity-20">neurology</span>
                <p className="text-[11px] font-medium">Waiting for agent activity...</p>
                <p className="text-[9px] mt-1 text-center">Trigger a scenario to see the agent&apos;s<br />reasoning in real-time</p>
              </div>
            ) : (
              feedItems.map((item) => {
                const config = FEED_ICONS[item.type] || FEED_ICONS.agent_thought;
                const d = item.data;
                const confidenceVal = (d.confidence_score || d.confidence) as number | undefined;
                return (
                  <div key={item.id} className={`rounded-lg p-2.5 border transition-all ${item.type === "reasoning_step" ? "border-violet-200 bg-violet-50/50" : item.type === "api_call" ? "border-emerald-200 bg-emerald-50/30" : "border-outline-variant bg-surface-container-low"}`}>
                    <div className="flex items-start space-x-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${config.bg}`}>
                        <span className={`material-symbols-outlined text-[14px] ${config.color}`}>{config.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-1.5 mb-0.5">
                          {d.node ? <span className="text-[8px] font-mono bg-white/70 text-on-surface-variant px-1 py-0.5 rounded">{String(d.node)}</span> : null}
                          {d.step_title ? <span className="text-[8px] font-bold text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">{String(d.step_title)}</span> : null}
                          {d.service ? <span className="text-[8px] font-mono bg-white/70 text-on-surface-variant px-1 py-0.5 rounded">{String(d.service)}</span> : null}
                          {d.status !== undefined && (
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${Number(d.status) === 200 ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {String(d.status)}
                            </span>
                          )}
                          {confidenceVal !== undefined && (
                            <span className={`text-[8px] font-bold px-1 py-0.5 rounded ${confidenceVal >= 0.8 ? "bg-emerald-100 text-emerald-700" : confidenceVal >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                              {Math.round(confidenceVal * 100)}%
                            </span>
                          )}
                        </div>
                        {d.thought || d.reasoning_text ? (
                          <p className="text-[10px] text-on-surface leading-relaxed font-medium">
                            {String(d.reasoning_text || d.thought)}
                          </p>
                        ) : null}
                        {d.endpoint && !d.thought && !d.reasoning_text ? (
                          <p className="text-[10px] text-on-surface font-mono truncate">{String(d.endpoint)}</p>
                        ) : null}
                        {Array.isArray(d.tool_calls) && d.tool_calls.length > 0 ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {d.tool_calls.map((tc: any, i) => (
                              <span key={i} className="text-[8px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold">{tc.tool_name}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
