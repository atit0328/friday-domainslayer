/**
 * Design: Obsidian Intelligence — Orders
 * Manage domain purchase/auction orders — uses tRPC
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { ShoppingCart, Loader2, XCircle, RefreshCw, Clock, CheckCircle } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber/20 text-amber border-amber/30",
  processing: "bg-cyan/20 text-cyan border-cyan/30",
  completed: "bg-emerald/20 text-emerald border-emerald/30",
  failed: "bg-rose/20 text-rose border-rose/30",
  cancelled: "bg-muted text-muted-foreground border-border",
};

const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  processing: Loader2,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: XCircle,
};

export default function Orders() {
  const [filter, setFilter] = useState("all");
  const utils = trpc.useUtils();

  const { data: orders = [], isLoading } = trpc.orders.list.useQuery(
    { status: filter === "all" ? undefined : filter, limit: 100 }
  );

  const cancelMutation = trpc.orders.cancel.useMutation({
    onSuccess: () => {
      toast.success("Order cancelled");
      utils.orders.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-emerald rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Orders</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald/30 text-emerald">DomainSlayer</Badge>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full sm:w-[150px] bg-muted/30 border-border/50 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => utils.orders.list.invalidate()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-emerald" />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>ยังไม่มีคำสั่งซื้อ</p>
        </div>
      ) : (
        <Card className="glass-card border-border/50">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Domain</th>
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Provider</th>
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Action</th>
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Amount</th>
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Status</th>
                    <th className="text-left p-3 font-mono text-xs text-muted-foreground">Date</th>
                    <th className="text-right p-3 font-mono text-xs text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order: any) => {
                    const StatusIcon = STATUS_ICONS[order.status] || Clock;
                    return (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-mono text-emerald font-semibold">{order.domain}</td>
                        <td className="p-3"><Badge variant="outline" className="text-[10px] font-mono">{order.provider}</Badge></td>
                        <td className="p-3 font-mono text-xs">{order.action}</td>
                        <td className="p-3 font-mono font-semibold">${order.amount}</td>
                        <td className="p-3">
                          <Badge className={`text-[10px] ${STATUS_COLORS[order.status] || STATUS_COLORS.pending}`}>
                            <StatusIcon className={`w-3 h-3 mr-1 ${order.status === "processing" ? "animate-spin" : ""}`} />
                            {order.status}
                          </Badge>
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString("th-TH") : "—"}
                        </td>
                        <td className="p-3 text-right">
                          {(order.status === "pending" || order.status === "processing") && (
                            <Button size="sm" variant="ghost" className="text-destructive text-xs h-7"
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate({ id: order.id })}>
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Cancel
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
