import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ApiResponse } from "./api";

type PublicData = ApiResponse<typeof api, "getPublic">;
type Dashboard = ApiResponse<typeof api, "getDashboard">;
type Service = PublicData["services"][number];
type Tab = "home" | "order" | "orders" | "funds" | "admin";

const money = (value: number) => `Rs. ${value.toLocaleString("en-PK", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const compact = (value: number) => value >= 1_000_000 ? `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(value % 1_000 ? 1 : 0)}K` : value.toLocaleString();
const when = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function Status({ value }: { value: string }) {
  return <span className={`status status-${value.toLowerCase().replace(/\s+/g, "_")}`}><span />{value.replaceAll("_", " ")}</span>;
}

function Notice({ tone = "info", children }: { tone?: "info" | "good" | "bad"; children: ReactNode }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>;
}

function PublicLanding({ data, onAuth }: { data: PublicData; onAuth: (mode: "login" | "signup") => void }) {
  const [search, setSearch] = useState("");
  const grouped = useMemo(() => {
    const map = new Map<string, Service[]>();
    const query = search.trim().toLowerCase();
    for (const service of data.services) {
      if (query && !`${service.platform} ${service.name} ${service.provider_service_id}`.toLowerCase().includes(query)) continue;
      map.set(service.platform, [...(map.get(service.platform) ?? []), service]);
    }
    return map;
  }, [data.services, search]);
  const visibleCount = [...grouped.values()].reduce((count, services) => count + services.length, 0);

  return <div className="public-page">
    <section className="public-hero">
      <div className="hero-inner">
        <div className="hero-copy">
          <p className="overline">Pakistan-ready SMM ordering</p>
          <h1>Choose the reach.<br /><em>See the price.</em><br />Place the order.</h1>
          <p className="hero-sub">{data.services.length.toLocaleString()} provider services, priced in PKR with clear limits before checkout.</p>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => onAuth("signup")}>{data.has_owner ? "Create customer account" : "Set up owner account"}</button>
            {data.has_owner ? <button className="btn btn-ghost-light" onClick={() => onAuth("login")}>Sign in</button> : null}
          </div>
        </div>
        <div className="price-ticket" aria-label="Pricing promise">
          <span>Margin model</span><strong>Rs. 150</strong><small>included per 1,000 units</small>
          <div className="ticket-rule" />
          <p>Order price = (rate ÷ 1,000) × quantity, calculated before submission.</p>
        </div>
      </div>
    </section>

    <main className="public-main">
      <section className="price-intro">
        <div><p className="overline dark">Service menu</p><h2>Direct rates, no calculator needed.</h2></div>
        <p>Every rate is per 1,000. Minimum and maximum quantities are enforced at checkout.</p>
      </section>
      <label className="catalog-search"><span>Find a service</span><input aria-label="Search services" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, category, or service ID" /><small>{visibleCount.toLocaleString()} of {data.services.length.toLocaleString()} services</small></label>
      {visibleCount === 0 ? <Empty title="No matching services" text="Try a broader service name, category, or provider ID." /> : null}
      {[...grouped.entries()].map(([platform, services]) => <section className="platform-block" key={platform}>
        <div className="platform-heading"><h3>{platform}</h3><span>{services.length} services</span></div>
        <div className="service-grid">{services.map((service) => <article className="service-card" key={service.id}>
          <div className="service-top"><span>ID {service.provider_service_id}</span>{service.refill ? <b>Refill</b> : <b className="muted-badge">No refill</b>}</div>
          <h4>{service.name}</h4>
          <div className="service-price"><strong>{money(service.price_pkr)}</strong><span>/ 1,000</span></div>
          <div className="service-limits"><span>Min {compact(service.min)}</span><span>Max {compact(service.max)}</span></div>
          <button className="text-action" onClick={() => onAuth("signup")}>Order this service →</button>
        </article>)}</div>
      </section>)}
      <section className="how-strip">
        <h2>One balance. Three clear steps.</h2>
        <ol><li><span>01</span><b>Add funds</b><p>Send through JazzCash and submit the TID.</p></li><li><span>02</span><b>Owner verifies</b><p>Your balance changes only after approval.</p></li><li><span>03</span><b>Order & track</b><p>Place an order and refresh its provider status.</p></li></ol>
      </section>
      <section className="owner-card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "20px", padding: "24px", margin: "32px 0", background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.1)", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}>
        <img src="/owner.jpg" alt="Sajeel Rajpoot" style={{ width: "100px", height: "100px", borderRadius: "50%", objectFit: "cover", border: "3px solid #25D366", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: "1 1 200px" }}>
          <p className="overline dark" style={{ margin: "0 0 6px" }}>Your panel owner</p>
          <h3 style={{ margin: "0 0 8px", fontSize: "1.3rem", wordBreak: "break-word" }}>Sajeel Rajpoot</h3>
          <p style={{ margin: "0 0 12px", opacity: 0.8 }}>Koi masla ho? Direct rabta karein!</p>
          <a href="https://wa.me/923266040350?text=Assalam-o-Alaikum!%20Mujhe%20SMM%20panel%20me%20masla%20hai." target="_blank" rel="noopener noreferrer" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>WhatsApp karein</a>
        </div>
      </section>
    </main>
  </div>;
}

function AuthPanel({ initialMode, hasOwner, onClose, onSuccess }: { initialMode: "login" | "signup"; hasOwner: boolean; onClose: () => void; onSuccess: (token: string) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoverySecret, setRecoverySecret] = useState("");
  const action = useMutation({
    mutationFn: () => mode === "login" ? api.login({ email, password }) : mode === "signup" ? api.signup({ name, email, password }) : api.resetOwnerPassword({ email, new_password: password, recovery_secret: recoverySecret }),
    onSuccess: (result) => {
      setMessage(result.message);
      if ("token" in result && result.ok && typeof result.token === "string") onSuccess(result.token);
      if (mode === "forgot" && result.ok) {
        setPassword("");
        setConfirmPassword("");
        setRecoverySecret("");
      }
    },
    onError: () => setMessage("Something went wrong. Please try again."),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (mode === "forgot" && password !== confirmPassword) {
      setMessage("The two passwords do not match.");
      return;
    }
    action.mutate();
  };
  const changeMode = (next: "login" | "signup" | "forgot") => { setMode(next); setMessage(""); setPassword(""); setConfirmPassword(""); setRecoverySecret(""); };
  const heading = mode === "login" ? "Welcome back." : mode === "forgot" ? "Reset owner access." : hasOwner ? "Start ordering." : "Set up the owner account.";
  const description = mode === "login" ? "Your balance, fund requests and orders are waiting." : mode === "forgot" ? "Enter the recovery secret configured on the server to reset the owner password." : hasOwner ? "Create your customer account to add funds and place orders." : "The first account becomes the panel owner and unlocks payments and provider settings.";
  return <div className="auth-shell">
    <div className="auth-side"><button className="back-button" onClick={onClose}>← Back to services</button><div><p className="overline">Account access</p><h1>{heading}</h1><p>{description}</p></div></div>
    <form className="auth-form" onSubmit={submit}>
      <div><p className="overline dark">{mode === "login" ? "Sign in" : mode === "forgot" ? "Password recovery" : "Create account"}</p><h2>{mode === "login" ? "Use your email" : mode === "forgot" ? "Choose a new password" : "Your details"}</h2></div>
      {mode === "signup" ? <Field label="Full name"><input aria-label="Full name" value={name} onChange={(e) => setName(e.target.value)} minLength={2} required autoComplete="name" /></Field> : null}
      <Field label={mode === "forgot" ? "Owner email address" : "Email address"}><input aria-label={mode === "forgot" ? "Owner email address" : "Email address"} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></Field>
      <Field label={mode === "forgot" ? "New password" : "Password"} hint={mode !== "login" ? "At least 8 characters" : undefined}><input aria-label={mode === "forgot" ? "New password" : "Password"} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={mode === "login" ? 1 : 8} required autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
      {mode === "forgot" ? <Field label="Confirm new password"><input aria-label="Confirm new password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} required autoComplete="new-password" /></Field> : null}
      {mode === "forgot" ? <Field label="Recovery secret" hint="The RECOVERY_SECRET value set on the server"><input aria-label="Recovery secret" type="password" value={recoverySecret} onChange={(e) => setRecoverySecret(e.target.value)} minLength={8} required autoComplete="off" /></Field> : null}
      {message ? <Notice tone={message.toLowerCase().includes("incorrect") || message.toLowerCase().includes("could not") || message.toLowerCase().includes("does not") || message.toLowerCase().includes("match") ? "bad" : "info"}>{message}</Notice> : null}
      <button className="btn btn-primary dark-button" type="submit" disabled={action.isPending}>{action.isPending ? "Please wait…" : mode === "login" ? "Sign in" : mode === "forgot" ? "Reset owner password" : hasOwner ? "Create customer account" : "Create owner account"}</button>
      {mode === "login" && hasOwner ? <button className="forgot-link" type="button" onClick={() => changeMode("forgot")}>Forgot password?</button> : null}
      {mode === "forgot" ? <button className="switch-auth" type="button" onClick={() => changeMode("login")}>Back to sign in</button> : null}
      {hasOwner && mode !== "forgot" ? <button className="switch-auth" type="button" onClick={() => changeMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button> : null}
    </form>
  </div>;
}

function OrderComposer({ services, token, balance, onDone }: { services: Service[]; token: string; balance: number; onDone: () => void }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? 0);
  const selected = services.find((s) => s.id === serviceId) ?? services[0];
  const [quantity, setQuantity] = useState(selected?.min ?? 0);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { if (selected) setQuantity(selected.min); }, [selected?.id]);
  const total = selected ? (selected.price_pkr * quantity) / 1000 : 0;
  const order = useMutation({ mutationFn: () => api.createOrder({ token, service_id: selected?.id ?? 0, link, quantity }), onSuccess: (result) => { setMessage(result.message); if (result.ok) { setLink(""); onDone(); } }, onError: () => setMessage("Order could not be submitted.") });
  const validQuantity = Boolean(selected && quantity >= selected.min && quantity <= selected.max);
  return <section className="composer">
    <div className="section-heading"><div><p className="overline dark">New order</p><h2>Build the order</h2></div><div className="balance-chip"><span>Available</span><strong>{money(balance)}</strong></div></div>
    <form onSubmit={(event) => { event.preventDefault(); setMessage(""); order.mutate(); }}>
      <Field label="Service"><select aria-label="Service" value={serviceId} onChange={(e) => setServiceId(Number(e.target.value))}>{services.map((service) => <option key={service.id} value={service.id}>{service.platform} · {service.name} — {money(service.price_pkr)}/1k</option>)}</select></Field>
      {selected ? <div className="service-rule"><span>Service {selected.provider_service_id}</span><b>{compact(selected.min)} min</b><b>{compact(selected.max)} max</b>{selected.refill ? <b>Refill</b> : <span>No refill</span>}</div> : null}
      <Field label="Profile or post link" hint="Use the exact public link required for this service"><input aria-label="Profile or post link" type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" required /></Field>
      <Field label="Quantity" hint={selected ? `Allowed: ${selected.min.toLocaleString()}–${selected.max.toLocaleString()}` : undefined}><input aria-label="Order quantity" type="number" value={quantity || ""} min={selected?.min} max={selected?.max} onChange={(e) => setQuantity(Number(e.target.value))} required /></Field>
      <div className="quote"><div><span>Rate</span><b>{selected ? money(selected.price_pkr) : "—"} / 1,000</b></div><div><span>Quantity</span><b>{quantity.toLocaleString()}</b></div><div><span>Calculation</span><b>rate ÷ 1,000 × quantity</b></div><div className="quote-total"><span>Total</span><strong>{money(total)}</strong></div></div>
      {!validQuantity && selected ? <Notice tone="bad">Quantity must stay between {selected.min.toLocaleString()} and {selected.max.toLocaleString()}.</Notice> : null}
      {total > balance ? <Notice tone="bad">Add {money(total - balance)} more to your balance before checkout.</Notice> : null}
      {message ? <Notice tone={message.includes("submitted") ? "good" : "bad"}>{message}</Notice> : null}
      <button className="btn btn-primary dark-button wide" type="submit" disabled={order.isPending || !validQuantity || total > balance || !link}>{order.isPending ? "Submitting…" : `Place order · ${money(total)}`}</button>
    </form>
  </section>;
}

function OrdersView({ orders, token, onRefresh }: { orders: NonNullable<Dashboard["orders"]>; token: string; onRefresh: () => void }) {
  const [message, setMessage] = useState("");
  const sync = useMutation({ mutationFn: (orderId: number) => api.syncOrder({ token, order_id: orderId }), onSuccess: (result) => { setMessage(result.message); if (result.ok) onRefresh(); } });
  return <section>
    <div className="section-heading"><div><p className="overline dark">Order history</p><h2>Every order, in one place</h2></div><span className="count-chip">{orders.length}</span></div>
    {message ? <Notice tone={message.includes("refreshed") ? "good" : "bad"}>{message}</Notice> : null}
    {orders.length === 0 ? <Empty title="No orders yet" text="Your first order will appear here with its provider status." /> : <div className="order-list">{orders.map((order) => <article className="order-row" key={order.id}>
      <div className="order-id"><span>#{order.id}</span><Status value={order.status} /></div>
      <div className="order-main"><h3>{order.platform} · {order.service}</h3><a href={order.link} target="_blank" rel="noreferrer">{order.link}</a><div><span>{order.quantity.toLocaleString()} units</span><span>{money(order.charge_pkr)}</span>{order.remains !== null ? <span>{order.remains.toLocaleString()} remaining</span> : null}</div></div>
      <div className="order-meta"><span>{when(order.created_at)}</span>{order.provider_order_id ? <button className="small-button" onClick={() => sync.mutate(order.id)} disabled={sync.isPending}>Refresh status</button> : null}</div>
      {order.error ? <p className="error-line">{order.error}</p> : null}
    </article>)}</div>}
  </section>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty"><div className="empty-mark">0</div><h3>{title}</h3><p>{text}</p></div>; }

function FundsView({ dashboard, token, onDone }: { dashboard: Dashboard; token: string; onDone: () => void }) {
  const [amount, setAmount] = useState(1000);
  const [tid, setTid] = useState("");
  const [message, setMessage] = useState("");
  const fund = useMutation({ mutationFn: () => api.submitFundRequest({ token, amount_pkr: amount, tid }), onSuccess: (result) => { setMessage(result.message); if (result.ok) { setTid(""); onDone(); } } });
  const jazz = dashboard.jazzcash;
  return <section>
    <div className="section-heading"><div><p className="overline dark">Wallet</p><h2>Add funds with JazzCash</h2></div><div className="balance-chip"><span>Balance</span><strong>{money(dashboard.me?.balance_pkr ?? 0)}</strong></div></div>
    <div className="fund-layout">
      <form className="fund-form" onSubmit={(e) => { e.preventDefault(); setMessage(""); fund.mutate(); }}>
        {jazz?.account_number ? <div className="jazz-ticket"><span>Send payment to</span><strong>{jazz.account_number}</strong><p>{jazz.account_name}</p></div> : <Notice>JazzCash details are waiting for owner setup.</Notice>}
        <Field label="Amount sent (PKR)"><input aria-label="JazzCash amount" type="number" min={100} max={1000000} value={amount} onChange={(e) => setAmount(Number(e.target.value))} required /></Field>
        <Field label="Transaction ID (TID)" hint="Each TID can only be used once"><input aria-label="JazzCash transaction ID" value={tid} onChange={(e) => setTid(e.target.value)} minLength={4} maxLength={80} required /></Field>
        {message ? <Notice tone={message.includes("submitted") ? "good" : "bad"}>{message}</Notice> : null}
        <button className="btn btn-primary dark-button wide" type="submit" disabled={fund.isPending || !jazz?.account_number}>{fund.isPending ? "Submitting…" : "Submit for approval"}</button>
      </form>
      <div className="history-block"><h3>Fund requests</h3>{(dashboard.funds ?? []).length === 0 ? <p className="quiet">No fund requests yet.</p> : (dashboard.funds ?? []).map((item) => <div className="fund-row" key={item.id}><div><b>{money(item.amount_pkr)}</b><span>TID {item.tid}</span></div><div><Status value={item.status} /><small>{when(item.created_at)}</small></div></div>)}</div>
    </div>
    <div className="ledger"><h3>Balance activity</h3>{(dashboard.ledger ?? []).length === 0 ? <p className="quiet">Your balance activity will appear here.</p> : (dashboard.ledger ?? []).map((entry) => <div className="ledger-row" key={entry.id}><div><b>{entry.note}</b><span>{when(entry.created_at)}</span></div><strong className={entry.amount_pkr >= 0 ? "positive" : "negative"}>{entry.amount_pkr >= 0 ? "+" : ""}{money(entry.amount_pkr)}</strong></div>)}</div>
  </section>;
}

function AdminView({ dashboard, token, onDone }: { dashboard: Dashboard; token: string; onDone: () => void }) {
  const [notice, setNotice] = useState("");
  const [key, setKey] = useState("");
  const [accountName, setAccountName] = useState(dashboard.jazzcash?.account_name ?? "");
  const [accountNumber, setAccountNumber] = useState(dashboard.jazzcash?.account_number ?? "");
  const [noteById, setNoteById] = useState<Record<number, string>>({});
  const connect = useMutation({ mutationFn: () => api.connectProvider({ token, api_key: key }), onSuccess: (result) => { setNotice(result.message + (result.balance ? ` Provider balance: ${result.balance}.` : "")); if (result.ok) { setKey(""); onDone(); } } });
  const syncServices = useMutation({ mutationFn: () => api.syncProviderServices({ token }), onSuccess: (result) => { setNotice(result.message); if (result.ok) onDone(); }, onError: () => setNotice("Provider services could not be synced.") });
  const disconnect = useMutation({ mutationFn: () => api.disconnectProvider({ token }), onSuccess: (result) => { setNotice(result.message); onDone(); } });
  const jazz = useMutation({ mutationFn: () => api.configureJazzCash({ token, account_name: accountName, account_number: accountNumber }), onSuccess: (result) => { setNotice(result.message); if (result.ok) onDone(); } });
  const review = useMutation({ mutationFn: ({ id, decision }: { id: number; decision: "approved" | "rejected" }) => api.reviewFundRequest({ token, request_id: id, decision, note: noteById[id] ?? "" }), onSuccess: (result) => { setNotice(result.message); if (result.ok) onDone(); } });
  const pending = (dashboard.funds ?? []).filter((fund) => fund.status === "pending");
  return <section>
    <div className="section-heading"><div><p className="overline dark">Owner desk</p><h2>Operations and profit</h2></div><Status value={dashboard.provider?.connected ? "connected" : "disconnected"} /></div>
    {notice ? <Notice tone={notice.includes("connected") || notice.includes("saved") || notice.includes("approved") ? "good" : "info"}>{notice}</Notice> : null}
    <div className="metric-row"><div><span>Revenue</span><strong>{money(dashboard.totals?.revenue_pkr ?? 0)}</strong></div><div><span>Provider cost</span><strong>{money(dashboard.totals?.provider_cost_pkr ?? 0)}</strong></div><div className="metric-profit"><span>Projected profit</span><strong>{money(dashboard.totals?.profit_pkr ?? 0)}</strong></div><div><span>Pending funds</span><strong>{dashboard.totals?.pending_funds ?? 0}</strong></div></div>

    <div className="admin-grid">
      <div className="admin-panel">
        <div className="panel-head"><div><h3>Provider connection</h3><p>Stored server-side for automatic orders and never returned to the browser.</p></div><Status value={dashboard.provider?.connected ? "connected" : "disconnected"} /></div>
        {dashboard.provider?.connected ? <div className="connected-actions"><div className="connected-box"><div><b>API v2 connected</b><span>Since {when(dashboard.provider.connected_at ?? null)}</span></div><button className="small-button danger" onClick={() => disconnect.mutate()} disabled={disconnect.isPending || syncServices.isPending}>Disconnect</button></div><button className="btn btn-secondary wide" onClick={() => syncServices.mutate()} disabled={syncServices.isPending}>{syncServices.isPending ? "Syncing all provider services…" : "Sync all provider services"}</button><p className="sync-note">Updates the full catalog and prices each service at provider cost converted to PKR + Rs. 150 per 1,000.</p></div> : <form onSubmit={(e) => { e.preventDefault(); connect.mutate(); }}><Field label="Provider API key" hint="The key is checked against the provider balance endpoint"><input aria-label="Provider API key" type="password" value={key} onChange={(e) => setKey(e.target.value)} minLength={20} required autoComplete="off" /></Field><button className="btn btn-secondary wide" type="submit" disabled={connect.isPending}>{connect.isPending ? "Checking…" : "Connect provider"}</button></form>}
      </div>
      <div className="admin-panel">
        <div className="panel-head"><div><h3>JazzCash receiving account</h3><p>Customers see these details before submitting a TID.</p></div></div>
        <form onSubmit={(e) => { e.preventDefault(); jazz.mutate(); }}><Field label="Account title"><input aria-label="JazzCash account title" value={accountName} onChange={(e) => setAccountName(e.target.value)} required /></Field><Field label="Mobile number"><input aria-label="JazzCash mobile number" inputMode="tel" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} pattern="\+?[0-9]{10,15}" required /></Field><button className="btn btn-secondary wide" type="submit" disabled={jazz.isPending}>{jazz.isPending ? "Saving…" : "Save JazzCash details"}</button></form>
      </div>
    </div>

    <div className="admin-panel pending-panel"><div className="panel-head"><div><h3>Pending fund approvals</h3><p>Verify the TID in JazzCash before adding balance.</p></div><span className="count-chip">{pending.length}</span></div>
      {pending.length === 0 ? <p className="quiet roomy">Nothing is waiting for review.</p> : <div className="approval-list">{pending.map((fund) => <article key={fund.id}><div className="approval-main"><div><span>{fund.customer}</span><strong>{money(fund.amount_pkr)}</strong></div><div><span>TID</span><b>{fund.tid}</b></div><small>{when(fund.created_at)}</small></div><input aria-label={`Review note for request ${fund.id}`} placeholder="Optional review note" value={noteById[fund.id] ?? ""} onChange={(e) => setNoteById((current) => ({ ...current, [fund.id]: e.target.value }))} /><div className="approval-actions"><button className="btn btn-secondary" onClick={() => review.mutate({ id: fund.id, decision: "approved" })}>Approve & credit</button><button className="small-button danger" onClick={() => review.mutate({ id: fund.id, decision: "rejected" })}>Reject</button></div></article>)}</div>}
    </div>

    <div className="admin-panel service-admin"><div className="panel-head"><div><h3>Retail catalog</h3><p>Synced rates include the requested Rs. 150 per 1,000 margin.</p></div><span className="count-chip">{dashboard.services?.length ?? 0}</span></div><div className="catalog-list">{(dashboard.services ?? []).map((service) => <div key={service.id}><span>{service.platform}</span><b>{service.name}</b><strong>{money(service.price_pkr)}/1k</strong><small>Cost {money(Math.round(service.provider_rate_usd * 277))} · {compact(service.min)}–{compact(service.max)}</small></div>)}</div></div>
  </section>;
}

function DashboardApp({ token, onLogout }: { token: string; onLogout: () => void }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("home");
  const query = useQuery({ queryKey: ["dashboard", token], queryFn: () => api.getDashboard({ token }) });
  const refresh = () => client.invalidateQueries({ queryKey: ["dashboard", token] });
  if (query.isPending) return <div className="loading"><span /><p>Loading your panel…</p></div>;
  if (query.isError || !query.data.ok) return <div className="fatal"><h2>Session unavailable</h2><p>{query.data?.message ?? "The panel could not be loaded."}</p><button className="btn btn-primary dark-button" onClick={onLogout}>Return to sign in</button></div>;
  const dashboard = query.data;
  const me = dashboard.me;
  if (!me) return <div className="fatal"><h2>Session unavailable</h2><p>Please sign in again.</p><button className="btn btn-primary dark-button" onClick={onLogout}>Return to sign in</button></div>;
  const tabs: { id: Tab; label: string }[] = [{ id: "home", label: "Overview" }, { id: "order", label: "New order" }, { id: "orders", label: "Orders" }, { id: "funds", label: "Funds" }, ...(me.role === "admin" ? [{ id: "admin" as Tab, label: "Owner" }] : [])];
  return <div className="app-shell">
    <header className="app-header"><div className="header-inner"><div><p className="overline">{me.role === "admin" ? "Owner workspace" : "Customer workspace"}</p><h1>{tab === "home" ? `Good to see you, ${me.name.split(" ")[0] ?? me.name}` : tabs.find((item) => item.id === tab)?.label}</h1></div><div className="header-actions"><div className="mini-balance"><span>Balance</span><strong>{money(me.balance_pkr)}</strong></div><button className="avatar-button" aria-label="Sign out" title="Sign out" onClick={onLogout}>{me.name.slice(0, 1).toUpperCase()}</button></div></div></header>
    <div className="workspace">
      <aside className="side-nav"><nav aria-label="Panel navigation">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.label.slice(0, 2).toUpperCase()}</span>{item.label}</button>)}</nav><div className="side-note"><b>{(dashboard.services?.length ?? 0).toLocaleString()} services</b><p>Provider catalog with PKR pricing.</p></div></aside>
      <main className="workspace-main">
        {tab === "home" ? <Overview dashboard={dashboard} onNavigate={setTab} /> : null}
        {tab === "order" ? <OrderComposer services={dashboard.services ?? []} token={token} balance={me.balance_pkr} onDone={refresh} /> : null}
        {tab === "orders" ? <OrdersView orders={dashboard.orders ?? []} token={token} onRefresh={refresh} /> : null}
        {tab === "funds" ? <FundsView dashboard={dashboard} token={token} onDone={refresh} /> : null}
        {tab === "admin" && me.role === "admin" ? <AdminView dashboard={dashboard} token={token} onDone={refresh} /> : null}
      </main>
    </div>
    <nav className="bottom-nav" aria-label="Mobile panel navigation">{tabs.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}><span>{item.label.slice(0, 2).toUpperCase()}</span>{item.label}</button>)}</nav>
  </div>;
}

function Overview({ dashboard, onNavigate }: { dashboard: Dashboard; onNavigate: (tab: Tab) => void }) {
  const recent = (dashboard.orders ?? []).slice(0, 3);
  return <section>
    <div className="overview-hero"><div><p className="overline">Ready balance</p><strong>{money(dashboard.me?.balance_pkr ?? 0)}</strong><p>Approved JazzCash funds are available immediately for new orders.</p><div><button className="btn btn-primary" onClick={() => onNavigate("order")}>Place an order</button><button className="btn btn-ghost-light" onClick={() => onNavigate("funds")}>Add funds</button></div></div><div className="overview-stats"><div><span>Orders</span><b>{dashboard.orders?.length ?? 0}</b></div><div><span>Pending funds</span><b>{(dashboard.funds ?? []).filter((fund) => fund.status === "pending").length}</b></div><div><span>Services</span><b>{dashboard.services?.length ?? 0}</b></div></div></div>
    <div className="quick-grid"><button onClick={() => onNavigate("order")}><span>01</span><b>New order</b><p>Select service, paste link, set quantity.</p></button><button onClick={() => onNavigate("funds")}><span>02</span><b>Add balance</b><p>Send JazzCash and submit the TID.</p></button><button onClick={() => onNavigate("orders")}><span>03</span><b>Track delivery</b><p>Refresh status directly from the provider.</p></button></div>
    <div className="recent-block"><div className="section-heading"><div><p className="overline dark">Latest activity</p><h2>Recent orders</h2></div>{recent.length ? <button className="text-action" onClick={() => onNavigate("orders")}>View all →</button> : null}</div>{recent.length === 0 ? <Empty title="Your order book is empty" text="Choose a service and the panel will calculate the exact PKR total before checkout." /> : recent.map((order) => <div className="recent-row" key={order.id}><div><b>{order.platform} · {order.service}</b><span>#{order.id} · {order.quantity.toLocaleString()} units</span></div><div><strong>{money(order.charge_pkr)}</strong><Status value={order.status} /></div></div>)}</div>
  </section>;
}

function readSession() {
  try {
    return window.localStorage.getItem("smm_session") ?? "";
  } catch {
    return "";
  }
}

function saveSession(value: string) {
  try {
    window.localStorage.setItem("smm_session", value);
  } catch {
    // Some embedded browsers block storage. The in-memory session still works.
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem("smm_session");
  } catch {
    // The UI can still sign out by clearing its in-memory token.
  }
}

export function App() {
  const [token, setToken] = useState(readSession);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const publicQuery = useQuery({ queryKey: ["public"], queryFn: () => api.getPublic({}), retry: 2 });
  const setSession = (value: string) => { saveSession(value); setToken(value); setAuthMode(null); };
  const logout = async () => { if (token) await api.logout({ token }).catch(() => undefined); clearSession(); setToken(""); };
  const whatsappFloat = (
    <a
      href="https://wa.me/923266040350?text=Assalam-o-Alaikum!%20Mujhe%20SMM%20panel%20me%20masla%20hai."
      target="_blank"
      rel="noopener noreferrer"
      title="WhatsApp pe rabta karein"
      style={{
        position: "fixed",
        bottom: "22px",
        right: "22px",
        width: "58px",
        height: "58px",
        borderRadius: "50%",
        backgroundColor: "#25D366",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
        zIndex: 9999,
        textDecoration: "none",
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="#ffffff">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  );
  if (token) return <>{whatsappFloat}<DashboardApp token={token} onLogout={logout} /></>;
  if (publicQuery.isPending) return <div className="loading"><span /><p>Preparing the service menu…</p></div>;
  if (publicQuery.isError) return <div className="fatal"><h2>Service menu unavailable</h2><p>Please try again.</p><button className="btn btn-primary dark-button" onClick={() => publicQuery.refetch()}>Retry</button></div>;
  if (authMode) return <>{whatsappFloat}<AuthPanel initialMode={authMode} hasOwner={publicQuery.data.has_owner} onClose={() => setAuthMode(null)} onSuccess={setSession} /></>;
  return <>{whatsappFloat}<PublicLanding data={publicQuery.data} onAuth={setAuthMode} /></>;
}
