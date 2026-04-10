import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetchPendingApprovals,
  approvePO,
  rejectPO,
  type ApprovalItem,
} from "../lib/api";
import {
  Loader2,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

export default function Approvals() {
  const queryClient = useQueryClient();
  const [rejectModal, setRejectModal] = useState<ApprovalItem | null>(null);
  const [rejectRemark, setRejectRemark] = useState("");

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pending-approvals"],
    queryFn: fetchPendingApprovals,
  });

  const approveMutation = useMutation({
    mutationFn: (orderNumber: string) => approvePO(orderNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({
      orderNumber,
      remark,
    }: {
      orderNumber: string;
      remark?: string;
    }) => rejectPO(orderNumber, remark),
    onSuccess: () => {
      setRejectModal(null);
      setRejectRemark("");
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["kpis"] });
    },
  });

  const handleRejectSubmit = () => {
    if (!rejectModal) return;
    rejectMutation.mutate({
      orderNumber: rejectModal.orderNumber,
      remark: rejectRemark || undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
        <p className="font-medium">Failed to load approvals</p>
        <p className="text-sm mt-1">{String(error)}</p>
      </div>
    );
  }

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Pending Approvals</h2>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          {items.length} pending
        </span>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-white py-16 text-gray-400">
          <ShieldCheck className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No pending approvals</p>
          <p className="text-xs mt-1">All purchase orders are up to date</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">PO #</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3">Order Date</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => (
                <tr key={item.orderNumber} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-primary">
                    {item.orderNumber}
                  </td>
                  <td className="px-4 py-3">
                    <div>{item.supplierName}</div>
                    <div className="text-xs text-gray-400">
                      #{item.supplierNumber}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(item.orderAmount)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.branchPlant}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {item.orderDate}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() =>
                          approveMutation.mutate(item.orderNumber)
                        }
                        disabled={approveMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-green-50
                                   px-3 py-1.5 text-xs font-medium text-green-700
                                   hover:bg-green-100 disabled:opacity-50 transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectModal(item)}
                        disabled={rejectMutation.isPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-50
                                   px-3 py-1.5 text-xs font-medium text-red-700
                                   hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mutation status feedback */}
      {approveMutation.isSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 flex items-center gap-2">
          <Check className="h-4 w-4" />
          Purchase order approved successfully
        </div>
      )}

      {(approveMutation.isError || rejectMutation.isError) && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {String(approveMutation.error || rejectMutation.error)}
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900">
              Reject PO #{rejectModal.orderNumber}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {rejectModal.supplierName} &mdash;{" "}
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(rejectModal.orderAmount)}
            </p>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Reason (optional)
              </label>
              <textarea
                value={rejectRemark}
                onChange={(e) => setRejectRemark(e.target.value)}
                rows={3}
                placeholder="Enter rejection reason..."
                className="w-full rounded-lg border px-3 py-2 text-sm
                           focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectRemark("");
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700
                           hover:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={rejectMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white
                           hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {rejectMutation.isPending ? "Rejecting..." : "Reject PO"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
