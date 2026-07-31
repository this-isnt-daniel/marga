"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getPendingCards, submitDecision, ApprovalCard } from "../../../lib/api";

export default function AlertDetailsPage() {
  const params = useParams();
  const id = params.id as string;
  
  const [card, setCard] = useState<ApprovalCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [decision, setDecision] = useState<null | 'approved' | 'rejected' | 'redirected' | 'info' | 'executing'>(null);
  const [redirectOption, setRedirectOption] = useState<null | string>(null);
  const [infoLoading, setInfoLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchCard = async () => {
      try {
        const cards = await getPendingCards();
        const found = cards.find(c => c.event.event_id === id);
        if (found) {
          setCard(found);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchCard();
  }, [id]);

  const handleApprove = async () => {
    if (!card) return;
    setIsSubmitting(true);
    setDecision('executing');
    try {
      await submitDecision(card.event.event_id, 'approved', card.cost_analysis.best_reroute_option?.quote_id || null, 'Proceed with recommended action.');
      setTimeout(() => setDecision('approved'), 4000); // Wait for agent simulation to finish before showing confirmation
    } catch (e) {
      console.error(e);
      alert('Failed to submit decision');
      setDecision(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!card) return;
    setIsSubmitting(true);
    try {
      await submitDecision(card.event.event_id, 'rejected', null, 'No action taken.');
      setDecision('rejected');
    } catch (e) {
      console.error(e);
      alert('Failed to submit decision');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleRedirectSubmit = async (quoteId: string) => {
    if (!card) return;
    setIsSubmitting(true);
    try {
      await submitDecision(card.event.event_id, 'redirected', quoteId, 'Alternative route selected.');
      const quote = card.freight_options.quotes.find(q => q.quote_id === quoteId);
      setRedirectOption(`${quote?.mode} via ${quote?.carrier}`);
      setDecision('redirected');
    } catch (e) {
      console.error(e);
      alert('Failed to submit decision');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInfoClick = () => {
    setDecision('info');
    setInfoLoading(true);
    setTimeout(() => {
      setInfoLoading(false);
    }, 2000);
  };

  if (loading) {
    return <main className="ml-64 mt-16 p-unit-lg h-[calc(100vh-64px)] flex items-center justify-center text-on-surface-variant font-bold">Loading...</main>;
  }
  
  if (error || !card) {
    return <main className="ml-64 mt-16 p-unit-lg h-[calc(100vh-64px)] flex items-center justify-center text-error font-bold">Failed to load alert details.</main>;
  }

  const bestQuoteId = card.cost_analysis.best_reroute_option?.quote_id;
  const bestQuote = card.freight_options.quotes.find(q => q.quote_id === bestQuoteId);

  const renderDecisionContent = () => {
    if (decision === 'executing') {
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
          <span className="material-symbols-outlined text-primary text-[48px] animate-spin">sync</span>
          <div className="space-y-2">
            <h2 className="text-on-surface text-xl font-bold">Agent Executing...</h2>
            <p className="text-on-surface-variant text-sm mt-2 font-medium">
              Transmitting approval to booking API. Rerouting POs {card.exposure.matched_pos.slice(0, 3).join(", ")}...
            </p>
          </div>
        </div>
      );
    }

    if (decision === 'approved') {
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
          <span className="material-symbols-outlined text-emerald-500 text-[48px]">check_circle</span>
          <div>
            <h2 className="text-on-surface text-xl font-bold">Reroute Approved</h2>
            <p className="text-on-surface-variant text-sm mt-2">
              Booking confirmed via {bestQuote?.carrier || "Selected Carrier"}. ETA: {bestQuote?.transit_days || "?"} days.
            </p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 w-full">
            <p className="text-emerald-700 text-sm font-medium">
              Event ID {card.event.event_id} has been logged. ERP records updated.
            </p>
          </div>
          <Link href="/" className="w-full bg-surface-container-low hover:bg-surface-container-high transition-colors text-on-surface border border-outline-variant rounded-lg py-3 font-medium flex items-center justify-center mt-4">
            <span className="material-symbols-outlined text-[16px] mr-2">arrow_back</span> Back to Dashboard
          </Link>
        </div>
      );
    }

    if (decision === 'rejected') {
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
          <span className="material-symbols-outlined text-error text-[48px]">cancel</span>
          <div>
            <h2 className="text-on-surface text-xl font-bold">Action Rejected</h2>
            <p className="text-on-surface-variant text-sm mt-2">
              No action taken. This disruption has been logged and closed.
            </p>
          </div>
          <Link href="/alerts" className="w-full bg-surface-container-low hover:bg-surface-container-high transition-colors text-on-surface border border-outline-variant rounded-lg py-3 font-medium flex items-center justify-center mt-4">
            <span className="material-symbols-outlined text-[16px] mr-2">arrow_back</span> Back to Alerts
          </Link>
        </div>
      );
    }

    if (decision === 'redirected') {
      if (redirectOption) {
        return (
          <div className="flex flex-col items-center justify-center text-center space-y-4 py-4">
            <span className="material-symbols-outlined text-primary text-[48px]">check_circle</span>
            <div>
              <h2 className="text-on-surface text-xl font-bold">Alternative Selected</h2>
              <p className="text-on-surface-variant text-sm mt-2">
                {redirectOption} booked successfully.
              </p>
            </div>
            <Link href="/" className="w-full bg-surface-container-low hover:bg-surface-container-high transition-colors text-on-surface border border-outline-variant rounded-lg py-3 font-medium flex items-center justify-center mt-4">
              <span className="material-symbols-outlined text-[16px] mr-2">arrow_back</span> Back to Dashboard
            </Link>
          </div>
        );
      }

      // Sort quotes: Recommended first, then by cheapest
      const sortedQuotes = [...card.freight_options.quotes].sort((a, b) => {
        const isRecA = a.quote_id === card.cost_analysis.best_reroute_option?.quote_id;
        const isRecB = b.quote_id === card.cost_analysis.best_reroute_option?.quote_id;
        if (isRecA) return -1;
        if (isRecB) return 1;
        return a.cost_usd - b.cost_usd;
      });

      const minCost = Math.min(...card.freight_options.quotes.map(q => q.cost_usd));
      const minTime = Math.min(...card.freight_options.quotes.map(q => q.transit_days));

      return (
        <div className="space-y-4">
          <h2 className="text-on-surface text-lg font-bold mb-4">Select Alternative Route</h2>
          {sortedQuotes.map(q => {
            const isRecommended = q.quote_id === card.cost_analysis.best_reroute_option?.quote_id;
            const isCheapest = q.cost_usd === minCost;
            const isFastest = q.transit_days === minTime;

            return (
              <div 
                key={q.quote_id}
                onClick={() => handleRedirectSubmit(q.quote_id)}
                className={`border rounded-lg p-3 cursor-pointer transition-colors relative ${isRecommended ? 'bg-emerald-50 border-emerald-400 hover:bg-emerald-100' : 'bg-surface-container-lowest border-outline-variant hover:border-primary'}`}
              >
                {isRecommended && (
                   <span className="absolute -top-2.5 right-3 bg-emerald-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest shadow-sm">Recommended</span>
                )}
                
                <div className="flex justify-between items-start mb-2">
                  <p className={`font-bold text-sm ${isRecommended ? 'text-emerald-900' : 'text-on-surface'}`}>{q.mode} via {q.carrier}</p>
                  <p className={`font-bold text-sm ${isRecommended ? 'text-emerald-700' : 'text-primary'}`}>${q.cost_usd.toLocaleString()}</p>
                </div>
                
                <div className="flex justify-between items-center text-xs">
                  <span className={`${isRecommended ? 'text-emerald-700' : 'text-on-surface-variant'} font-medium`}>ETA: {q.transit_days} days</span>
                  
                  <div className="flex space-x-1">
                    {isCheapest && !isRecommended && (
                      <span className="bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Most Cost Effective</span>
                    )}
                    {isFastest && !isRecommended && (
                      <span className="bg-blue-100 text-blue-800 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Fastest Route</span>
                    )}
                    {isRecommended && (
                      <span className="bg-emerald-200 text-emerald-900 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Best Balance</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <button 
            onClick={() => setDecision(null)}
            className="w-full mt-4 bg-transparent hover:bg-surface-container-high text-on-surface-variant border border-outline-variant py-2 rounded-lg text-sm transition-colors font-medium"
          >
            Cancel
          </button>
        </div>
      );
    }

    if (decision === 'info') {
      return (
        <div className="flex flex-col items-center justify-center text-center space-y-6 py-4">
          <span className={`material-symbols-outlined text-amber-500 text-[48px] ${infoLoading ? 'animate-spin' : ''}`}>sync</span>
          
          {infoLoading ? (
            <div className="space-y-4 w-full">
              <h2 className="text-on-surface text-xl font-bold">Re-querying Systems...</h2>
              <ul className="text-left space-y-2 text-sm text-on-surface-variant animate-pulse font-medium">
                <li className="flex items-center"><span className="text-outline-variant mr-2">●</span> ERP: Re-checking PO match...</li>
                <li className="flex items-center"><span className="text-outline-variant mr-2">●</span> API: Refreshing freight quotes...</li>
                <li className="flex items-center"><span className="text-outline-variant mr-2">●</span> Feed: Confirming status...</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-4 w-full">
              <h2 className="text-on-surface text-xl font-bold">Data Refreshed</h2>
              <p className="text-on-surface-variant text-sm">
                All sources confirmed. No changes to original recommendation.
              </p>
              <button 
                onClick={() => setDecision(null)}
                className="w-full bg-surface-container-low hover:bg-surface-container-high transition-colors text-on-surface border border-outline-variant rounded-lg py-3 font-medium flex items-center justify-center mt-4"
              >
                <span className="material-symbols-outlined text-[16px] mr-2">arrow_back</span> Back to Options
              </button>
            </div>
          )}
        </div>
      );
    }

    // Default decision = null
    return (
      <>
        <h2 className="text-on-surface text-sm font-semibold mb-1">Your Decision</h2>
        <p className="text-on-surface-variant text-[10px] mb-6 font-medium">
          Review the recommendation and choose an action. This cannot be undone.
        </p>

        <div className="space-y-3">
          <button 
            onClick={handleApprove}
            disabled={isSubmitting}
            className="w-full bg-primary hover:brightness-110 disabled:opacity-50 transition-all text-white rounded-lg py-3 font-semibold flex items-center justify-center shadow-sm text-sm"
          >
            <span className="material-symbols-outlined text-[18px] mr-2">check</span> {isSubmitting ? 'Approving...' : 'Approve — Book Recommended Reroute'}
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleReject}
              disabled={isSubmitting}
              className="bg-transparent hover:bg-error/10 disabled:opacity-50 transition-colors text-on-surface-variant hover:text-error hover:border-error border border-outline-variant rounded-lg py-2 font-medium flex items-center justify-center text-sm"
            >
              <span className="material-symbols-outlined text-[16px] mr-2">close</span> Reject
            </button>
            <button 
              onClick={() => setDecision('redirected')}
              disabled={isSubmitting}
              className="bg-transparent hover:bg-primary/10 disabled:opacity-50 transition-colors text-on-surface-variant hover:text-primary hover:border-primary border border-outline-variant rounded-lg py-2 font-medium flex items-center justify-center text-sm"
            >
              <span className="material-symbols-outlined text-[16px] mr-2">swap_horiz</span> Redirect
            </button>
          </div>
          
          <button 
            onClick={handleInfoClick}
            className="w-full bg-transparent hover:bg-surface-container-high transition-colors text-on-surface-variant border border-outline-variant rounded-lg py-2 font-bold flex items-center justify-center text-[10px] uppercase tracking-widest"
          >
            <span className="material-symbols-outlined text-[16px] mr-2">help</span> Request More Info
          </button>
        </div>

        <div className="mt-6 bg-surface-container-low rounded-lg p-3 flex items-start space-x-2">
          <span className="material-symbols-outlined text-on-surface-variant text-[16px] shrink-0">schedule</span>
          <p className="text-[10px] text-on-surface-variant font-medium">
            No response will escalate this alert — it will never auto-approve.
          </p>
        </div>
      </>
    );
  };

  return (
    <main className="ml-64 mt-16 p-unit-lg h-[calc(100vh-64px)] overflow-y-auto">
      <div className="space-y-6 max-w-7xl mx-auto pb-8">
        
        {/* Top: Back navigation */}
        <div>
          <Link href="/alerts" className="inline-flex items-center text-primary hover:brightness-110 transition-colors mb-4 text-[12px] font-bold uppercase tracking-widest">
            <span className="material-symbols-outlined text-[16px] mr-1">arrow_back</span>
            Back to Alerts
          </Link>
          <div className="flex items-center space-x-4">
            <h1 className="text-on-surface font-headline-lg">{card.event.description}</h1>
            <span className="bg-error/10 text-error text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full">
              High Risk
            </span>
          </div>
        </div>

        {/* Main layout */}
        <div className="flex space-x-unit-lg">
          
          {/* Left column */}
          <div className="flex-1 space-y-unit-lg">
            
            {/* Card 1: Disruption Summary */}
            <div className="card-surface rounded-xl p-unit-md space-y-4">
              <div className="flex items-center space-x-2">
                <span className="material-symbols-outlined text-amber-500 text-[20px]">warning</span>
                <h2 className="text-on-surface text-sm font-semibold">Disruption Summary</h2>
              </div>
              
              <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">Event</p>
                  <p className="text-on-surface text-[11px] font-medium mt-1">{card.event.description}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">Affected Route</p>
                  <p className="text-on-surface text-[11px] font-medium mt-1">{card.event.route}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">Vessel</p>
                  <p className="text-on-surface text-[11px] font-medium mt-1">{card.event.vessel_id}</p>
                </div>
                <div>
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest">Detected</p>
                  <p className="text-on-surface text-[11px] font-medium mt-1">{new Date(card.event.detected_at).toLocaleString()} via {card.event.source}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-amber-700 text-[10px] font-medium">
                  Agent confidence: High · All data sourced from live {card.event.source} feed + ERP match
                </p>
              </div>
            </div>

            {/* Card 2: Exposure Analysis */}
            <div className="card-surface rounded-xl p-unit-md space-y-4">
              <h2 className="text-on-surface text-sm font-semibold">Exposure Analysis</h2>
              
              <div className="grid grid-cols-3 gap-unit-md">
                <div className="bg-surface-container-low rounded-lg p-unit-md">
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">POs Affected</p>
                  <p className="text-on-surface text-2xl font-bold">{card.exposure.matched_pos.length}</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-unit-md">
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Inventory at Risk</p>
                  <p className="text-error text-2xl font-bold">${card.exposure.total_inventory_value_usd.toLocaleString()}</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-unit-md">
                  <p className="text-on-surface-variant text-[10px] font-bold uppercase tracking-widest mb-1">Stockout Risk</p>
                  <p className="text-error text-2xl font-bold">High</p>
                </div>
              </div>

              <div className="border border-outline-variant rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant text-[10px] font-bold text-on-surface-variant uppercase tracking-widest bg-surface-container-low">
                      <th className="px-3 py-2 font-medium">PO Number</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {card.exposure.matched_pos.map(po => (
                      <tr key={po} className="hover:bg-surface-container-lowest transition-colors">
                        <td className="p-3 text-on-surface text-[11px] font-medium">{po}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Card 3: Recommended vs Alternative */}
            <div className="card-surface rounded-xl p-unit-md space-y-4">
              <h2 className="text-on-surface text-sm font-semibold">Recommended vs Alternative</h2>
              
              <div className="grid grid-cols-2 gap-unit-md">
                {/* Left - RECOMMENDED */}
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-unit-md flex flex-col justify-between">
                  <div>
                    <span className="text-emerald-600 text-[10px] font-bold tracking-widest mb-2 block uppercase">Recommended</span>
                    <h3 className="text-on-surface font-bold text-sm">{card.cost_analysis.recommendation}</h3>
                    <p className="text-on-surface-variant text-[11px] mt-2 leading-relaxed font-medium">
                      Via {bestQuote?.carrier || "N/A"}<br />
                      ETA: {bestQuote?.transit_days || "?"} days<br />
                      {bestQuote?.mode || "N/A"}
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-emerald-200 flex justify-between items-end">
                    <div>
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Cost Impact</span>
                      <p className="text-emerald-700 text-2xl font-bold">${bestQuote?.cost_usd?.toLocaleString() || "0"}</p>
                    </div>
                  </div>
                </div>

                {/* Right - ALTERNATIVE */}
                <div className="bg-surface-container-low border border-outline-variant rounded-xl p-unit-md flex flex-col justify-between">
                  <div>
                    <span className="text-on-surface-variant text-[10px] font-bold tracking-widest mb-2 block uppercase">Alternative</span>
                    <h3 className="text-on-surface font-bold text-sm">Accept Delay</h3>
                    <p className="text-on-surface-variant text-[11px] mt-2 leading-relaxed font-medium">
                      Projected stockout: ${card.cost_analysis.stockout_cost_usd.toLocaleString()}<br />
                      No reroute action taken<br />
                      Inventory depletion expected
                    </p>
                  </div>
                  <div className="mt-4 pt-4 border-t border-outline-variant flex justify-between items-end">
                    <div>
                      <span className="block text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Cost Impact</span>
                      <p className="text-error text-2xl font-bold">${card.cost_analysis.stockout_cost_usd.toLocaleString()} <span className="text-xs font-normal opacity-80">est.</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>

          {/* Right column */}
          <div className="w-80 space-y-unit-lg">
            
            {/* Card 1: Agent Decision */}
            <div className="card-surface rounded-xl p-unit-md transition-all duration-300">
              {renderDecisionContent()}
            </div>

            {/* Card 2: Data Sources Timeline */}
            <div className="card-surface rounded-xl p-unit-md relative">
              <h2 className="text-on-surface text-sm font-semibold mb-4 relative z-10">Data Sources</h2>
              
              <div className="relative">
                <div className="timeline-line" style={{ top: '0px' }}></div>
                <div className="space-y-6 relative z-10">
                  <div className="relative pl-8">
                    <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full left-[7px] top-1 shadow-[0_0_8px_rgba(16,185,129,0.8)] ring-2 ring-surface-container-lowest"></div>
                    <p className="text-on-surface-variant text-[10px] font-mono uppercase tracking-widest block mb-1">Live</p>
                    <h4 className="text-on-surface text-[11px] font-bold">Maritime Feed</h4>
                    <p className="text-on-surface-variant text-[10px] font-medium mt-1">Disruption detected</p>
                  </div>
                  
                  <div className="relative pl-8">
                    <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full left-[7px] top-1 shadow-[0_0_8px_rgba(16,185,129,0.8)] ring-2 ring-surface-container-lowest"></div>
                    <p className="text-on-surface-variant text-[10px] font-mono uppercase tracking-widest block mb-1">Live</p>
                    <h4 className="text-on-surface text-[11px] font-bold">ERP</h4>
                    <p className="text-on-surface-variant text-[10px] font-medium mt-1">{card.exposure.matched_pos.length} POs matched, ${card.exposure.total_inventory_value_usd.toLocaleString()} exposure</p>
                  </div>
                  
                  <div className="relative pl-8">
                    <div className="absolute w-2.5 h-2.5 bg-emerald-500 rounded-full left-[7px] top-1 shadow-[0_0_8px_rgba(16,185,129,0.8)] ring-2 ring-surface-container-lowest"></div>
                    <p className="text-on-surface-variant text-[10px] font-mono uppercase tracking-widest block mb-1">Live</p>
                    <h4 className="text-on-surface text-[11px] font-bold">Freight API</h4>
                    <p className="text-on-surface-variant text-[10px] font-medium mt-1">{card.freight_options.quotes.length} alternative quotes fetched</p>
                  </div>
                  
                  <div className="relative pl-8">
                    <div className="absolute w-2.5 h-2.5 bg-amber-500 rounded-full left-[7px] top-1 ring-2 ring-surface-container-lowest"></div>
                    <p className="text-on-surface-variant text-[10px] font-mono uppercase tracking-widest block mb-1">Live</p>
                    <h4 className="text-on-surface text-[11px] font-bold">Cost Engine</h4>
                    <p className="text-on-surface-variant text-[10px] font-medium mt-1">Stockout vs Reroute calculated</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-outline-variant pt-4 mt-6">
                <p className="text-on-surface-variant font-bold text-[10px] uppercase tracking-widest">
                  Logged at {new Date(card.event.detected_at).toLocaleTimeString()} · Event ID: {card.event.event_id}
                </p>
              </div>
            </div>
            
          </div>
        </div>
        
      </div>
    </main>
  );
}
