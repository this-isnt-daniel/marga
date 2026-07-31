export interface EventSchema {
  event_id: string;
  detected_at: string;
  source: string;
  vessel_id: string;
  route: string;
  description: string;
}

export interface ExposureSchema {
  matched_pos: string[];
  total_inventory_value_usd: number;
}

export interface FreightQuoteSchema {
  quote_id: string;
  carrier: string;
  mode: string;
  cost_usd: number;
  transit_days: number;
}

export interface CostAnalysisSchema {
  stockout_cost_usd: number;
  reroute_savings_usd: number;
  recommendation: string;
  best_reroute_option?: { quote_id: string } | null;
}

export interface FreightOptionsSchema {
  quotes: FreightQuoteSchema[];
}

export interface ApprovalCard {
  event: EventSchema;
  exposure: ExposureSchema;
  cost_analysis: CostAnalysisSchema;
  freight_options: FreightOptionsSchema;
  status: string;
  chosen_quote_id?: string | null;
}

export interface POAtRisk {
  po_id: string;
  supplier: string;
  vessel_id: string;
  product: string;
  item_code: string;
  quantity: number;
  value_usd: number;
  match_confidence: number;
}

export interface RouteRisk {
  route: string;
  po_count: number;
  exposure_usd: number;
  pos: POAtRisk[];
}

export interface InventoryAtRisk {
  total_pos: number;
  at_risk_pos: number;
  total_exposure_usd: number;
  routes: RouteRisk[];
}

export interface ActiveEvent {
  event_id: string;
  status: string;
  route: string;
  vessel_id: string;
  source: string;
  description: string;
  detected_at: string;
  matched_pos: string[];
  exposure_usd: number;
  stockout_cost_usd: number;
  reroute_savings_usd: number;
  chosen_quote_id: string | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8004";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8004/ws/dashboard";

export async function getPendingCards(): Promise<ApprovalCard[]> {
  const response = await fetch(`${API_BASE}/cards/pending`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Failed to fetch pending cards');
  }
  return response.json();
}

export async function getCard(eventId: string): Promise<ApprovalCard> {
  const res = await fetch(`${API_BASE}/cards/${eventId}`);
  if (!res.ok) throw new Error('Card not found');
  return res.json();
}

export async function submitDecision(
  eventId: string,
  decision: 'approved' | 'rejected' | 'redirected',
  chosenQuoteId: string | null,
  managerNote: string
): Promise<{ status: string; decision: string }> {
  const response = await fetch(`${API_BASE}/cards/${eventId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_id: eventId,
      decision: decision,
      chosen_quote_id: chosenQuoteId,
      manager_note: managerNote
    })
  });
  if (!response.ok) {
    throw new Error('Failed to submit decision');
  }
  return response.json();
}

export async function triggerDemoDisruption(eventId: string): Promise<{ status: string; thread_id: string }> {
  const response = await fetch(`${API_BASE}/trigger_disruption?event_id=${eventId}`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error('Failed to trigger disruption');
  }
  return response.json();
}

export async function simulateSandbox(payload: {
  event_headline: string;
  event_description: string;
  severity: string;
  exposure_value_usd: number;
  matched_pos: string[];
  freight_quotes: any[];
}): Promise<{ status: string; event_id: string; thread_id: string }> {
  const response = await fetch(`${API_BASE}/simulate-sandbox`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error('Failed to start sandbox simulation');
  }
  return response.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function connectAgentStream(onMessage: (data: any) => void): () => void {
  let ws: WebSocket | null = null;
  let isIntentionalClose = false;
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  const connect = () => {
    console.log("Connecting WebSocket to:", WS_URL);
    ws = new WebSocket(WS_URL);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error("Failed to parse websocket message", e);
      }
    };
    
    ws.onerror = (error) => {
      if (isIntentionalClose) return;
      console.error("WebSocket error:", error);
    };

    ws.onclose = () => {
      console.log("WebSocket closed.");
      if (!isIntentionalClose) {
        console.log("Reconnecting in 2 seconds...");
        reconnectTimeout = setTimeout(connect, 2000);
      }
    };
  };

  connect();
  
  return () => {
    isIntentionalClose = true;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (ws) ws.close();
  };
}

export async function getInventoryAtRisk(): Promise<InventoryAtRisk> {
  const res = await fetch(`${API_BASE}/inventory/at-risk`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch inventory data');
  return res.json();
}

export async function getActiveEvents(): Promise<ActiveEvent[]> {
  const res = await fetch(`${API_BASE}/events/active`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch active events');
  return res.json();
}

export async function simulateEvent(params: {
  route?: string;
  vessel_id?: string;
  description?: string;
  event_type?: string;
}): Promise<{ status: string; event_id: string; thread_id: string }> {
  const payload = {
    route: params.route ?? 'Shanghai to Los Angeles',
    vessel_id: params.vessel_id ?? 'Evergreen',
    description: params.description ?? 'Simulated maritime disruption.',
    event_type: params.event_type ?? 'Gale Warning',
  };
  const res = await fetch(`${API_BASE}/events/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to simulate event');
  return res.json();
}

export async function simulateNewsEvent(params: {
  headline: string;
  description: string;
  source: string;
}): Promise<any> {
  const payload = {
    headline: params.headline,
    description: params.description,
    source: params.source,
  };
  const res = await fetch(`${API_BASE}/events/news/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('Failed to simulate news event');
  return res.json();
}
