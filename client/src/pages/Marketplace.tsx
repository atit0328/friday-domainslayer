/**
 * Design: Obsidian Intelligence — Domain Marketplace
 * Search domains for sale — GoDaddy API + AI fallback
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Search, Loader2, Store, ShoppingCart, CheckCircle, XCircle, Globe, Sparkles, Zap } from "lucide-react";

interface DomainResult {
  domain: string;
  price: number;
  provider: string;
  tld: string;
  age?: string;
  da?: number;
  backlinks?: number;
  listing_type: string;
  available?: boolean;
  currency?: string;
  period?: number;
  source?: "godaddy" | "ai";
}

export default function Marketplace() {
  const [keyword, setKeyword] = useState("");
  const [tld, setTld] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [sortBy, setSortBy] = useState("price_asc");
  const [results, setResults] = useState<DomainResult[]>([]);
  const [dataSource, setDataSource] = useState<string>("");

  // Check GoDaddy API status
  const apiStatus = trpc.marketplace.apiStatus.useQuery(undefined, {
    staleTime: 60_000,
  });

  const searchMutation = trpc.marketplace.search.useMutation({
    onSuccess: (data: any) => {
      const listings: DomainResult[] = Array.isArray(data) ? data : data?.domains || [];
      const source = data?.source || "ai";
      setDataSource(source);
      setResults(listings);
      const sourceLabel = source === "godaddy" ? "GoDaddy API" : "AI";
      toast.success(`Found ${listings.length} domains via ${sourceLabel}`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const checkDomainMutation = trpc.marketplace.checkDomain.useMutation({
    onSuccess: (data: any) => {
      if (data.available === true) {
        toast.success(`${data.domain} is available! Price: $${data.price?.toLocaleString() || "N/A"}`);
      } else if (data.available === false) {
        toast.info(`${data.domain} is already taken`);
      } else {
        toast.info(data.message || "Could not check availability");
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const orderMutation = trpc.orders.create.useMutation({
    onSuccess: () => toast.success("Order placed!"),
    onError: (err: any) => toast.error(err.message),
  });

  function handleSearch() {
    if (!keyword.trim()) {
      toast.error("Please enter a keyword to search");
      return;
    }
    searchMutation.mutate({
      keyword: keyword || undefined,
      tld: tld || undefined,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      limit: 60,
    });
  }

  // Sort results
  const sortedResults = [...results].sort((a, b) => {
    switch (sortBy) {
      case "price_asc": return (a.price || 0) - (b.price || 0);
      case "price_desc": return (b.price || 0) - (a.price || 0);
      case "name_asc": return a.domain.localeCompare(b.domain);
      default: return 0;
    }
  });

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-emerald rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Domain Marketplace</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-emerald/30 text-emerald">DomainSlayer</Badge>
        </div>
        {/* API Status Indicator */}
        <div className="flex items-center gap-2">
          {apiStatus.data?.configured ? (
            <Badge variant="outline" className={`font-mono text-[10px] ${apiStatus.data.valid ? "border-emerald/30 text-emerald" : "border-amber-500/30 text-amber-500"}`}>
              <Globe className="w-3 h-3 mr-1" />
              GoDaddy API {apiStatus.data.valid ? "Connected" : "Limited Access"}
            </Badge>
          ) : (
            <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">
              <Sparkles className="w-3 h-3 mr-1" />
              AI-Powered Search
            </Badge>
          )}
        </div>
      </div>

      {/* Search Form */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <div className="md:col-span-2">
              <Input
                placeholder="Keyword (e.g. crypto, ai, tech)"
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                className="bg-muted/30 border-border/50 font-mono"
                onKeyDown={e => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Input
              placeholder="TLD (.com)"
              value={tld}
              onChange={e => setTld(e.target.value)}
              className="bg-muted/30 border-border/50 font-mono"
            />
            <Input
              placeholder="Min $"
              value={minPrice}
              onChange={e => setMinPrice(e.target.value)}
              className="bg-muted/30 border-border/50 font-mono"
              type="number"
            />
            <Input
              placeholder="Max $"
              value={maxPrice}
              onChange={e => setMaxPrice(e.target.value)}
              className="bg-muted/30 border-border/50 font-mono"
              type="number"
            />
            <Button onClick={handleSearch} disabled={searchMutation.isPending} className="bg-emerald text-background hover:bg-emerald/90">
              {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
              Search
            </Button>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[200px] bg-muted/30 border-border/50 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_asc">Price: Low to High</SelectItem>
                <SelectItem value="price_desc">Price: High to Low</SelectItem>
                <SelectItem value="name_asc">Name: A to Z</SelectItem>
              </SelectContent>
            </Select>
            {results.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono">
                  {results.length} results
                </span>
                {dataSource && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${dataSource === "godaddy" ? "border-emerald/30 text-emerald" : "border-violet/30 text-violet"}`}
                  >
                    {dataSource === "godaddy" ? (
                      <><Zap className="w-3 h-3 mr-0.5" /> GoDaddy Live Data</>
                    ) : (
                      <><Sparkles className="w-3 h-3 mr-0.5" /> AI Generated</>
                    )}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Domain Check */}
      <Card className="glass-card border-border/50">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Quick Check:</span>
            <div className="flex-1 flex gap-2">
              <Input
                placeholder="example.com"
                className="bg-muted/30 border-border/50 font-mono text-sm max-w-xs"
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val) checkDomainMutation.mutate({ domain: val });
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={checkDomainMutation.isPending}
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>('input[placeholder="example.com"]');
                  if (input?.value.trim()) checkDomainMutation.mutate({ domain: input.value.trim() });
                }}
              >
                {checkDomainMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {sortedResults.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedResults.map((item, i) => (
            <Card key={i} className="glass-card border-border/50 hover:border-emerald/30 transition-all group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-semibold text-emerald text-sm truncate">{item.domain}</p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {/* Source badge */}
                      <Badge
                        variant="outline"
                        className={`text-[9px] font-mono ${item.source === "godaddy" ? "border-emerald/20 text-emerald/70" : "border-violet/20 text-violet/70"}`}
                      >
                        {item.source === "godaddy" ? "GoDaddy" : "AI"}
                      </Badge>
                      {/* Availability badge */}
                      {item.available !== undefined && (
                        <Badge
                          variant="outline"
                          className={`text-[9px] font-mono ${item.available ? "border-emerald/30 text-emerald" : "border-rose-500/30 text-rose-500"}`}
                        >
                          {item.available ? (
                            <><CheckCircle className="w-2.5 h-2.5 mr-0.5" /> Available</>
                          ) : (
                            <><XCircle className="w-2.5 h-2.5 mr-0.5" /> Taken</>
                          )}
                        </Badge>
                      )}
                      {/* Listing type */}
                      {item.listing_type && item.listing_type !== "available" && item.listing_type !== "taken" && (
                        <Badge variant="outline" className="text-[9px] font-mono">{item.listing_type}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-2 shrink-0">
                    {item.price > 0 ? (
                      <>
                        <p className="font-mono font-bold text-lg">${item.price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.currency || "USD"}{item.period ? `/${item.period}yr` : ""}
                        </p>
                      </>
                    ) : (
                      <p className="font-mono text-sm text-muted-foreground">N/A</p>
                    )}
                  </div>
                </div>

                {/* Metrics row — only for AI results that have DA/backlinks */}
                {(item.da || item.backlinks || item.age) && item.source !== "godaddy" && (
                  <div className="flex gap-1.5 mb-3 flex-wrap">
                    {item.da ? <Badge variant="outline" className="text-[9px] font-mono">DA: {item.da}</Badge> : null}
                    {item.backlinks ? <Badge variant="outline" className="text-[9px] font-mono">BL: {item.backlinks}</Badge> : null}
                    {item.age && item.age !== "New Registration" ? <Badge variant="outline" className="text-[9px] font-mono">{item.age}</Badge> : null}
                  </div>
                )}

                {/* Period info for GoDaddy */}
                {item.source === "godaddy" && item.period && (
                  <p className="text-[10px] text-muted-foreground mb-3 font-mono">
                    Registration: {item.period} year{item.period > 1 ? "s" : ""}
                  </p>
                )}

                <div className="flex gap-2">
                  {item.available !== false ? (
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald text-background hover:bg-emerald/90 text-xs"
                      disabled={orderMutation.isPending}
                      onClick={() =>
                        orderMutation.mutate({
                          domain: item.domain,
                          provider: item.provider || "marketplace",
                          action: "buy_now",
                          amount: String(item.price || 0),
                        })
                      }
                    >
                      <ShoppingCart className="w-3.5 h-3.5 mr-1" />
                      {item.source === "godaddy" ? "Register" : "Buy Now"}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs opacity-60"
                      disabled
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Not Available
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {searchMutation.isSuccess && results.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>ไม่พบโดเมนที่ตรงกับเงื่อนไข</p>
          <p className="text-xs mt-1">ลองเปลี่ยน keyword หรือ TLD</p>
        </div>
      )}
    </div>
  );
}
