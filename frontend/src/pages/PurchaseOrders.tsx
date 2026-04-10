import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetchPurchaseOrders,
  fetchPurchaseOrder,
  type PODetailResponse,
} from "../lib/api";
import { Loader2, Search, ArrowLeft, FileText } from "lucide-react";

function formatCurrency(value: unknown): string {
  const num = Number(value);
  if (isNaN(num)) return String(value ?? "");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(num);
}

function col(row: Record<string, unknown>, alias: string, table: string): string {
  const val = row[`${table}_${alias}`] ?? row[alias] ?? "";
  return String(val);
}

export default function PurchaseOrders() {
  const [filters, setFilters] = useState({
    supplier: "",
    branch: "",
    dateFrom: "",
    dateTo: "",
  });
  const [search, setSearch] = useState(filters);
  const [selectedPO, setSelectedPO] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["purchase-orders", search],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (search.supplier) params.supplier = search.supplier;
      if (search.branch) params.branch = search.branch;
      if (search.dateFrom) params.dateFrom = search.dateFrom;
      if (search.dateTo) params.dateTo = search.dateTo;
      return fetchPurchaseOrders(params);
    },
  });

  const detailQuery = useQuery({
    queryKey: ["purchase-order-detail", selectedPO],
    queryFn: () => fetchPurchaseOrder(selectedPO!),
    enabled: !!selectedPO,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch({ ...filters });
  };

  // ── Detail view ─────────────────────────────────────────────
  if (selectedPO) {
    return (
      <PODetail
        orderNumber={selectedPO}
        data={detailQuery.data}
        isLoading={detailQuery.isLoading}
        isError={detailQuery.isError}
        error={detailQuery.error}
        onBack={() => setSelectedPO(null)}
      />
    );
  }

  // ── List view ───────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Purchase Orders</h2>

      {/* Filters */}
      <form
        onSubmit={handleSearch}
        className="flex flex-wrap gap-3 rounded-xl border bg-white p-4 shadow-sm"
      >
        <input
          type="text"
          placeholder="Supplier #"
          value={filters.supplier}
          onChange={(e) =>
            setFilters({ ...filters, supplier: e.target.value })
          }
          className="rounded-lg border px-3 py-2 text-sm w-32
                     focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="text"
          placeholder="Branch"
          value={filters.branch}
          onChange={(e) =>
            setFilters({ ...filters, branch: e.target.value })
          }
          className="rounded-lg border px-3 py-2 text-sm w-28
                     focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) =>
            setFilters({ ...filters, dateFrom: e.target.value })
          }
          className="rounded-lg border px-3 py-2 text-sm
                     focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) =>
            setFilters({ ...filters, dateTo: e.target.value })
          }
          className="rounded-lg border px-3 py-2 text-sm
                     focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2
                     text-sm font-medium text-white hover:bg-primary-dark transition-colors"
        >
          <Search className="h-4 w-4" />
          Search
        </button>
      </form>

      {/* Table */}
      {listQuery.isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : listQuery.isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {String(listQuery.error)}
        </div>
      ) : (
        <>
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">PO #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Order Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {listQuery.data?.data.map((row, i) => {
                  const doco = col(row, "DOCO", "F4301");
                  return (
                    <tr
                      key={`${doco}-${i}`}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedPO(doco)}
                    >
                      <td className="px-4 py-3 font-medium text-primary">
                        {doco}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {col(row, "DCTO", "F4301")}
                      </td>
                      <td className="px-4 py-3">
                        {col(row, "AN8", "F4301")}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {col(row, "MCU", "F4301")}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(col(row, "OTOT", "F4301"))}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={col(row, "NXTR", "F4301")} />
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {col(row, "TRDJ", "F4301")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-400">
            {listQuery.data?.total ?? 0} records
            {listQuery.data?.hasMore && " (more available — refine filters)"}
          </div>
        </>
      )}
    </div>
  );
}

// ── PO Detail Sub-view ────────────────────────────────────────

function PODetail({
  orderNumber,
  data,
  isLoading,
  isError,
  error,
  onBack,
}: {
  orderNumber: string;
  data?: PODetailResponse;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>

      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">PO #{orderNumber}</h2>
      </div>

      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
          {String(error)}
        </div>
      ) : data ? (
        <>
          {/* Header */}
          {data.header && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Header
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <Field
                  label="Supplier"
                  value={col(data.header, "AN8", "F4301")}
                />
                <Field
                  label="Branch"
                  value={col(data.header, "MCU", "F4301")}
                />
                <Field
                  label="Total"
                  value={formatCurrency(col(data.header, "OTOT", "F4301"))}
                />
                <Field
                  label="Status"
                  value={col(data.header, "NXTR", "F4301")}
                />
                <Field
                  label="Order Date"
                  value={col(data.header, "TRDJ", "F4301")}
                />
                <Field
                  label="Requested"
                  value={col(data.header, "DRQJ", "F4301")}
                />
                <Field
                  label="Promised"
                  value={col(data.header, "PDDJ", "F4301")}
                />
                <Field
                  label="Currency"
                  value={col(data.header, "CRCD", "F4301")}
                />
              </div>
            </div>
          )}

          {/* Lines */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h3 className="text-sm font-semibold text-gray-700">
                Detail Lines ({data.lineCount})
              </h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Line</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Qty Ordered</th>
                  <th className="px-4 py-3 text-right">Qty Open</th>
                  <th className="px-4 py-3 text-right">Unit Cost</th>
                  <th className="px-4 py-3 text-right">Open Amt</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.lines.map((line, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {col(line, "LNID", "F4311")}
                    </td>
                    <td className="px-4 py-3 text-primary">
                      {col(line, "LITM", "F4311")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {col(line, "DSC1", "F4311")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {col(line, "UORG", "F4311")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {col(line, "UOPN", "F4311")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(col(line, "PRRC", "F4311"))}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(col(line, "AOPN", "F4311"))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={col(line, "NXTR", "F4311")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value || "—"}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const num = parseInt(status, 10);
  let color = "bg-gray-100 text-gray-700";
  if (num >= 999) color = "bg-gray-200 text-gray-500";
  else if (num >= 400) color = "bg-yellow-100 text-yellow-800";
  else if (num >= 300) color = "bg-green-100 text-green-800";
  else if (num >= 200) color = "bg-blue-100 text-blue-800";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {status}
    </span>
  );
}
