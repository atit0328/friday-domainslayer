/**
 * Design: Obsidian Intelligence — Watchlist
 * Track domain prices and get alerts when prices drop — uses tRPC
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Eye, Plus, Trash2, Loader2, Bell, TrendingDown, TrendingUp, RefreshCw } from "lucide-react";

export default function Watchlist() {
  const [newDomain, setNewDomain] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const utils = trpc.useUtils();

  const { data: items = [], isLoading } = trpc.watchlist.list.useQuery();
  const { data: alerts = [] } = trpc.watchlist.alerts.useQuery({ limit: 20 });

  const addMutation = trpc.watchlist.add.useMutation({
    onSuccess: () => {
      toast.success(`Added ${newDomain} to watchlist`);
      setNewDomain("");
      setTargetPrice("");
      utils.watchlist.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeMutation = trpc.watchlist.remove.useMutation({
    onSuccess: () => {
      toast.success("Removed from watchlist");
      utils.watchlist.list.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  function addToWatchlist() {
    if (!newDomain.trim()) return;
    addMutation.mutate({
      domain: newDomain.trim(),
      targetPrice: targetPrice ? targetPrice : undefined,
    });
  }

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-emerald rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Watchlist</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald/30 text-emerald">DomainSlayer</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={() => utils.watchlist.list.invalidate()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Add Domain */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Input placeholder="domain.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} className="bg-muted/30 border-border/50 font-mono flex-1" onKeyDown={e => e.key === "Enter" && addToWatchlist()} />
            <Input placeholder="Target Price ($)" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} className="bg-muted/30 border-border/50 font-mono w-[150px]" type="number" />
            <Button onClick={addToWatchlist} disabled={addMutation.isPending} className="bg-emerald text-background hover:bg-emerald/90">
              <Plus className="w-4 h-4 mr-1" /> Watch
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist Items */}
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Watching ({items.length})
          </h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-emerald" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Eye className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>ยังไม่มีโดเมนใน Watchlist</p>
            </div>
          ) : (
            items.map((item: any) => (
              <Card key={item.id} className="glass-card border-border/50 hover:border-emerald/20 transition-all">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center">
                        <Eye className="w-4 h-4 text-emerald" />
                      </div>
                      <div>
                        <p className="font-mono text-sm font-semibold text-emerald">{item.domain}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.currentPrice && (
                            <Badge variant="outline" className="text-[10px] font-mono">${item.currentPrice}</Badge>
                          )}
                          {item.targetPrice && (
                            <Badge variant="outline" className="text-[10px] font-mono text-amber border-amber/30">Target: ${item.targetPrice}</Badge>
                          )}
                          {item.priceChange && Number(item.priceChange) !== 0 && (
                            <Badge className={`text-[10px] font-mono ${Number(item.priceChange) < 0 ? "bg-emerald/20 text-emerald" : "bg-rose/20 text-rose"}`}>
                              {Number(item.priceChange) < 0 ? <TrendingDown className="w-2.5 h-2.5 mr-0.5" /> : <TrendingUp className="w-2.5 h-2.5 mr-0.5" />}
                              {Number(item.priceChange) > 0 ? "+" : ""}{item.priceChange}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8"
                      disabled={removeMutation.isPending}
                      onClick={() => removeMutation.mutate({ id: item.id })}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Alerts */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Bell className="w-4 h-4" /> Alerts
          </h2>
          {alerts.length === 0 ? (
            <Card className="glass-card border-border/50">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                ยังไม่มีการแจ้งเตือน
              </CardContent>
            </Card>
          ) : (
            alerts.map((alert: any, i: number) => (
              <Card key={i} className="glass-card border-border/50">
                <CardContent className="p-3">
                  <div className="flex items-start gap-2">
                    <Bell className="w-3.5 h-3.5 text-amber shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-mono text-emerald">{alert.domain}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{alert.message || alert.alertType}</p>
                      {alert.createdAt && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                          {new Date(alert.createdAt).toLocaleString("th-TH")}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
