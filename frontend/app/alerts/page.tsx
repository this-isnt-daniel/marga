"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getPendingCards, ApprovalCard } from "../../lib/api";

export default function AlertsPage() {
  const [cards, setCards] = useState<ApprovalCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchCards = async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await getPendingCards();
      setCards(data);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCards();
  }, []);

  const totalExposure = cards.reduce((sum, card) => sum + card.exposure.total_inventory_value_usd, 0);

  return (
    <main className="ml-64 mt-16 p-unit-lg h-[calc(100vh-64px)] overflow-y-auto space-y-unit-lg">
      
      {/* Header bar */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-2">
          <h1 className="font-headline-lg text-on-surface">Active Alerts</h1>
          <span className="text-on-surface-variant">/</span>
          <span className="text-on-surface-variant text-sm font-medium">Live Disruptions</span>
        </div>
        <div className="flex items-center space-x-2 bg-surface-container-lowest border border-outline-variant px-3 py-1.5 rounded-full shadow-sm">
          <span className="text-error text-[10px]">●</span>
          <span className="text-on-surface font-medium text-xs">Live Status</span>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex justify-between items-center bg-surface-container-lowest p-2 rounded-lg border border-outline-variant shadow-sm">
        <div className="flex space-x-2">
          <button className="px-4 py-1.5 rounded-full bg-primary/10 text-primary font-bold text-xs uppercase tracking-widest">
            All
          </button>
          <button className="px-4 py-1.5 rounded-full bg-transparent text-on-surface-variant hover:bg-surface-container-high transition-colors font-bold text-xs uppercase tracking-widest">
            Awaiting Approval
          </button>
          <button className="px-4 py-1.5 rounded-full bg-transparent text-on-surface-variant hover:bg-surface-container-high transition-colors font-bold text-xs uppercase tracking-widest">
            In Progress
          </button>
          <button className="px-4 py-1.5 rounded-full bg-transparent text-on-surface-variant hover:bg-surface-container-high transition-colors font-bold text-xs uppercase tracking-widest">
            Monitoring
          </button>
        </div>
        
        <div className="relative w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
          <input
            type="text"
            placeholder="Search disruptions..."
            className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-1.5 pl-10 pr-4 text-xs text-on-surface focus:outline-none focus:border-primary transition-all placeholder:text-on-surface-variant"
          />
        </div>
      </div>

      {/* Alert Cards */}
      <div className="space-y-4">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="block card-surface rounded-xl border-l-4 border-l-surface-container-high p-unit-md animate-pulse">
                <div className="h-4 bg-surface-container-high rounded w-1/3 mb-4"></div>
                <div className="flex space-x-3 mb-4">
                  <div className="h-3 bg-surface-container-high rounded w-1/4"></div>
                  <div className="h-3 bg-surface-container-high rounded w-1/6"></div>
                  <div className="h-3 bg-surface-container-high rounded w-1/6"></div>
                </div>
                <div className="h-1.5 bg-surface-container-high rounded-full w-full mb-3"></div>
                <div className="h-2 bg-surface-container-high rounded w-1/4"></div>
              </div>
            ))}
          </>
        ) : error ? (
          <div className="bg-error/10 text-error rounded-xl p-unit-md flex justify-between items-center">
            <span className="text-sm font-semibold">Failed to fetch active alerts from the backend.</span>
            <button onClick={fetchCards} className="px-4 py-2 bg-error text-white rounded-lg text-xs font-bold hover:brightness-110">
              Retry
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="card-surface rounded-xl p-unit-md text-center text-on-surface-variant">
            No active disruptions found.
          </div>
        ) : (
          cards.map((card) => (
            <Link key={card.event.event_id} href={`/alerts/${card.event.event_id}`} className="block card-surface rounded-xl border-l-4 border-l-amber-500 p-unit-md hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-[12px] font-semibold text-on-surface">{card.event.description}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-error/10 text-error">
                  High Risk
                </span>
              </div>
              
              <div className="flex items-center space-x-3 mb-4">
                <p className="text-[10px] text-on-surface-variant font-medium flex items-center">
                  {card.event.route}
                </p>
                <span className="px-2 py-0.5 rounded bg-surface-container-high text-primary text-[10px] font-bold">
                  {card.exposure.matched_pos.length} POs Affected
                </span>
                <span className="px-2 py-0.5 rounded bg-error/10 text-error text-[10px] font-bold">
                  ${card.exposure.total_inventory_value_usd.toLocaleString()} at risk
                </span>
              </div>

              <div className="h-1.5 bg-surface-container-low rounded-full overflow-hidden mb-3">
                <div className="h-full bg-amber-500" style={{ width: card.status === 'pending' ? '50%' : '100%' }}></div>
              </div>
              
              <div className="flex justify-between items-center text-[9px] text-on-surface-variant font-bold uppercase tracking-widest">
                <span>Detected {new Date(card.event.detected_at).toLocaleTimeString()} · {card.status === 'pending' ? 'Awaiting Approval' : 'Action Taken'}</span>
                <span className="material-symbols-outlined text-primary text-[16px]">chevron_right</span>
              </div>
            </Link>
          ))
        )}
      </div>

      {!loading && !error && (
        <div className="pt-2 pb-6 flex justify-center">
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-widest">
            Showing {cards.length} active disruptions · Total exposure: ${totalExposure.toLocaleString()} · Last updated: just now
          </p>
        </div>
      )}
    </main>
  );
}
