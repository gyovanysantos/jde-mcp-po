// ──────────────────────────────────────────────────────────────
// API client — all REST calls to the Express backend
// ──────────────────────────────────────────────────────────────

const API_BASE = "/api";

function getToken(): string | null {
  return localStorage.getItem("jde_token");
}

export function setToken(token: string): void {
  localStorage.setItem("jde_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("jde_token");
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    window.location.href = "/login";
    throw new Error("Session expired");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth ──────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  username: string;
  addressNumber: number;
}

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const data = await apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data;
}

export async function logout(): Promise<void> {
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
  clearToken();
}

export async function getMe(): Promise<{
  username: string;
  addressNumber: number;
}> {
  return apiFetch("/auth/me");
}

// ── Dashboard ─────────────────────────────────────────────────

export interface KPIData {
  openPOCount: number;
  openPOValue: number;
  pendingApprovals: number;
  overduePOLines: number;
  totalOpenLines: number;
  hasMoreData: boolean;
}

export interface POAgingBucket {
  range: string;
  count: number;
  value: number;
}

export interface CashFlowWeek {
  weekStart: string;
  projectedAmount: number;
}

export async function fetchKPIs(): Promise<KPIData> {
  return apiFetch("/dashboard/kpis");
}

export async function fetchPOAging(): Promise<{
  buckets: POAgingBucket[];
  totalLines: number;
}> {
  return apiFetch("/dashboard/po-aging");
}

export async function fetchCashFlow(): Promise<{
  projections: CashFlowWeek[];
}> {
  return apiFetch("/dashboard/cash-flow");
}

// ── Purchase Orders ───────────────────────────────────────────

export interface POListResponse {
  data: Record<string, unknown>[];
  total: number;
  hasMore: boolean;
}

export interface PODetailResponse {
  header: Record<string, unknown> | null;
  lines: Record<string, unknown>[];
  lineCount: number;
}

export async function fetchPurchaseOrders(
  params?: Record<string, string>
): Promise<POListResponse> {
  const qs = params
    ? "?" + new URLSearchParams(params).toString()
    : "";
  return apiFetch(`/purchase-orders${qs}`);
}

export async function fetchPurchaseOrder(
  orderNumber: string
): Promise<PODetailResponse> {
  return apiFetch(`/purchase-orders/${encodeURIComponent(orderNumber)}`);
}

// ── Approvals ─────────────────────────────────────────────────

export interface ApprovalItem {
  orderNumber: string;
  orderType: string;
  orderCompany: string;
  supplierNumber: string;
  supplierName: string;
  orderAmount: number;
  orderDate: string;
  orderRequestDate: string;
  holdCode: string;
  branchPlant: string;
}

export async function fetchPendingApprovals(): Promise<{
  data: ApprovalItem[];
  total: number;
}> {
  return apiFetch("/purchase-orders/pending-approvals");
}

export async function approvePO(
  orderNumber: string
): Promise<Record<string, unknown>> {
  return apiFetch(`/purchase-orders/${encodeURIComponent(orderNumber)}/approve`, {
    method: "POST",
  });
}

export async function rejectPO(
  orderNumber: string,
  remark?: string
): Promise<Record<string, unknown>> {
  return apiFetch(`/purchase-orders/${encodeURIComponent(orderNumber)}/reject`, {
    method: "POST",
    body: JSON.stringify({ remark }),
  });
}

// ── Chat ──────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function sendChatMessage(
  message: string,
  history: ChatMessage[]
): Promise<ChatMessage> {
  return apiFetch("/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  });
}
