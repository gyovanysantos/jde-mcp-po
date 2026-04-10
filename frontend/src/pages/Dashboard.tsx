import { useQuery } from "@tanstack/react-query";
import {
  fetchKPIs,
  fetchPOAging,
  fetchCashFlow,
} from "../lib/api";
import KPICard from "../components/KPICard";
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  DollarSign,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Dashboard() {
  const kpis = useQuery({ queryKey: ["kpis"], queryFn: fetchKPIs });
  const aging = useQuery({ queryKey: ["po-aging"], queryFn: fetchPOAging });
  const cashFlow = useQuery({
    queryKey: ["cash-flow"],
    queryFn: fetchCashFlow,
  });

  if (kpis.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (kpis.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-medium">Failed to load dashboard</p>
        <p className="text-sm mt-1">{String(kpis.error)}</p>
      </div>
    );
  }

  const k = kpis.data!;

  const agingData =
    aging.data?.buckets.map((b) => ({
      range: b.range,
      count: b.count,
      value: b.value,
    })) ?? [];

  const cashFlowData =
    cashFlow.data?.projections.map((p) => ({
      week: formatWeekLabel(p.weekStart),
      amount: p.projectedAmount,
    })) ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Open POs"
          value={k.openPOCount}
          subtitle={`${k.totalOpenLines} open lines`}
          icon={<FileText className="h-5 w-5" />}
        />
        <KPICard
          title="Open PO Value"
          value={formatCurrency(k.openPOValue)}
          subtitle={k.hasMoreData ? "Partial data (500 row limit)" : undefined}
          icon={<DollarSign className="h-5 w-5" />}
        />
        <KPICard
          title="Pending Approvals"
          value={k.pendingApprovals}
          subtitle="Awaiting action"
          icon={<ShieldCheck className="h-5 w-5" />}
          trend={k.pendingApprovals > 0 ? "down" : "neutral"}
        />
        <KPICard
          title="Overdue Lines"
          value={k.overduePOLines}
          subtitle="Past promised date"
          icon={<AlertTriangle className="h-5 w-5" />}
          trend={k.overduePOLines > 0 ? "down" : "up"}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* PO Aging */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            PO Aging Distribution
          </h3>
          {aging.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(val: number, name: string) => [
                    name === "value" ? formatCurrency(val) : val,
                    name === "value" ? "Value" : "Lines",
                  ]}
                />
                <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cash Flow Projection */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Cash Flow Projection (8 Weeks)
          </h3>
          {cashFlow.isLoading ? (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={(v: number) =>
                    `$${(v / 1000).toFixed(0)}k`
                  }
                />
                <Tooltip
                  formatter={(val: number) => [formatCurrency(val), "Projected"]}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#2563eb"
                  fill="#2563eb"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* PO Aging Table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h3 className="text-sm font-semibold text-gray-700">
            Aging Breakdown
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
            <tr>
              <th className="px-5 py-3">Age Range</th>
              <th className="px-5 py-3 text-right">Lines</th>
              <th className="px-5 py-3 text-right">Open Value</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {agingData.map((row) => (
              <tr key={row.range} className="hover:bg-gray-50">
                <td className="px-5 py-3 font-medium">{row.range} days</td>
                <td className="px-5 py-3 text-right">{row.count}</td>
                <td className="px-5 py-3 text-right">
                  {formatCurrency(row.value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
