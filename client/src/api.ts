// Plain fetch-based RPC client for the standalone SMM panel server.
// Every server action is exposed as POST /api/<actionName> with a JSON body.
// Types mirror the server responses so existing `ApiResponse<typeof api, "...">`
// usages in App.tsx keep working.

export interface Service {
  id: number;
  provider_service_id: string;
  platform: string;
  name: string;
  provider_rate_usd: number;
  price_pkr: number;
  min: number;
  max: number;
  refill: boolean;
  cancel: boolean;
}

export interface JazzCashPublic {
  configured: boolean;
  account_name: string;
  account_number: string;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  role: "admin" | "customer";
  balance_pkr: number;
}

export interface OrderRow {
  id: number;
  customer: string;
  service: string;
  platform: string;
  link: string;
  quantity: number;
  charge_pkr: number;
  provider_cost_pkr: number;
  profit_pkr: number;
  status: string;
  provider_order_id: string | null;
  remains: number | null;
  error: string | null;
  created_at: string;
  last_synced_at: string | null;
}

export interface FundRow {
  id: number;
  customer: string;
  amount_pkr: number;
  tid: string;
  status: string;
  note: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface LedgerRow {
  id: number;
  type: string;
  amount_pkr: number;
  note: string;
  created_at: string;
}

interface OkMessage {
  ok: boolean;
  message: string;
}

interface ActionMap {
  getPublic: { req: Record<string, never>; res: { has_owner: boolean; services: Service[]; jazzcash: JazzCashPublic } };
  signup: { req: { name: string; email: string; password: string }; res: OkMessage & { token?: string; role?: "admin" | "customer" } };
  login: { req: { email: string; password: string }; res: OkMessage & { token?: string; role?: "admin" | "customer" } };
  resetOwnerPassword: { req: { email: string; new_password: string; recovery_secret: string }; res: OkMessage };
  logout: { req: { token: string }; res: { ok: boolean } };
  getDashboard: {
    req: { token: string };
    res: OkMessage & {
      me?: Me;
      services?: Service[];
      orders?: OrderRow[];
      funds?: FundRow[];
      ledger?: LedgerRow[];
      provider?: { connected: boolean; connected_at: string | null };
      totals?: { revenue_pkr: number; provider_cost_pkr: number; profit_pkr: number; pending_funds: number };
      jazzcash?: { account_name: string; account_number: string };
    };
  };
  submitFundRequest: { req: { token: string; amount_pkr: number; tid: string }; res: OkMessage };
  reviewFundRequest: { req: { token: string; request_id: number; decision: "approved" | "rejected"; note?: string }; res: OkMessage };
  configureJazzCash: { req: { token: string; account_name: string; account_number: string }; res: OkMessage };
  provisionProvider: { req: { api_key: string }; res: OkMessage };
  connectProvider: { req: { token: string; api_key: string }; res: OkMessage & { balance?: string } };
  refreshProviderCatalog: { req: Record<string, never>; res: OkMessage & { imported?: number; active?: number } };
  syncProviderServices: { req: { token: string }; res: OkMessage & { imported?: number; active?: number } };
  disconnectProvider: { req: { token: string }; res: OkMessage };
  createOrder: { req: { token: string; service_id: number; link: string; quantity: number }; res: OkMessage & { order_id?: number } };
  syncOrder: { req: { token: string; order_id: number }; res: OkMessage & { status?: string } };
}

async function callAction<K extends keyof ActionMap>(name: K, args: ActionMap[K]["req"]): Promise<ActionMap[K]["res"]> {
  const response = await fetch(`/api/${name}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args ?? {}),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as { message?: string };
      if (data && typeof data.message === "string") detail = `: ${data.message}`;
    } catch {
      // fall through with status-only message
    }
    throw new Error(`Request failed (${response.status})${detail}`);
  }
  return (await response.json()) as ActionMap[K]["res"];
}

type ApiClient = {
  [K in keyof ActionMap]: (args: ActionMap[K]["req"]) => Promise<ActionMap[K]["res"]>;
};

export const api: ApiClient = new Proxy({} as ApiClient, {
  get: (_target, name: string) => {
    if (name === "__esModule") return false;
    return (args: unknown) => callAction(name as keyof ActionMap, (args ?? {}) as never);
  },
});

// Keeps `ApiResponse<typeof api, "getPublic">` style type lookups working.
export type ApiResponse<T, K extends keyof T> = Awaited<ReturnType<T[K]>>;
