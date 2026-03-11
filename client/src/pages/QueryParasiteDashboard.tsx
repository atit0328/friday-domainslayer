/**
 * Design: Obsidian Intelligence — Query Parameter Parasite Dashboard
 * Scan domains for vulnerable search parameters, deploy keyword-injected URLs,
 * and run full campaigns with AI keyword expansion.
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  Search, Loader2, Zap, Target, Globe, Shield, AlertTriangle,
  CheckCircle2, XCircle, ExternalLink, Crosshair, Rocket,
  FileText, Brain, Copy, ChevronDown, ChevronUp, Link2,
} from "lucide-react";

export default function QueryParasiteDashboard() {
  const [activeTab, setActiveTab] = useState("scan");
  const [scanDomain, setScanDomain] = useState("");
  const [expandedVuln, setExpandedVuln] = useState<number | null>(null);

  // Deploy state
  const [deployDomain, setDeployDomain] = useState("");
  const [deployBaseUrl, setDeployBaseUrl] = useState("");
  const [deployParam, setDeployParam] = useState("");
  const [deployKeywords, setDeployKeywords] = useState("");
  const [deployReflectsTitle, setDeployReflectsTitle] = useState(true);
  const [deployReflectsH1, setDeployReflectsH1] = useState(false);
  const [deployReflectsContent, setDeployReflectsContent] = useState(false);

  // Campaign state
  const [campaignDomains, setCampaignDomains] = useState("");
  const [campaignKeywords, setCampaignKeywords] = useState("");
  const [campaignNiche, setCampaignNiche] = useState("gambling");

  // Keyword expansion state
  const [expandBaseKeywords, setExpandBaseKeywords] = useState("");
  const [expandCount, setExpandCount] = useState(20);

  // ─── Mutations ───
  const scanMutation = trpc.queryParasite.scan.useMutation({
    onSuccess: (data) => toast.success(`Scan complete! Found ${data.vulnerabilities.length} vulnerabilities`),
    onError: (err: any) => toast.error(err.message),
  });

  const deployMutation = trpc.queryParasite.deploy.useMutation({
    onSuccess: (data) => toast.success(`Deployed ${data.deployed} URLs! ${data.indexed} indexed.`),
    onError: (err: any) => toast.error(err.message),
  });

  const campaignMutation = trpc.queryParasite.runCampaign.useMutation({
    onSuccess: () => toast.success("Campaign completed!"),
    onError: (err: any) => toast.error(err.message),
  });

  const expandMutation = trpc.queryParasite.expandKeywords.useMutation({
    onSuccess: (data) => toast.success(`Generated ${data.count} keywords!`),
    onError: (err: any) => toast.error(err.message),
  });

  const { data: dorksData } = trpc.queryParasite.getDorks.useQuery();

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-rose-500 rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Query Parameter Parasite</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-rose-500/30 text-rose-400">
            Search Injection
          </Badge>
        </div>
      </div>

      {/* Info Banner */}
      <Card className="glass-card border-amber/20 bg-amber/5">
        <CardContent className="p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber shrink-0 mt-0.5" />
          <div className="text-xs text-amber/80">
            <p className="font-semibold text-amber mb-1">How It Works</p>
            <p>
              Scans target domains for search/query parameters that reflect user input into title tags, H1 headers, or page content.
              Then injects gambling keywords into those URLs and submits them for Google indexing — making the target domain rank for our keywords.
            </p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 border border-border/50 flex-wrap h-auto gap-0.5 p-1">
          <TabsTrigger value="scan" className="text-xs gap-1.5 data-[state=active]:bg-rose-500/15 data-[state=active]:text-rose-400">
            <Search className="w-3.5 h-3.5" /> Scan Domains
          </TabsTrigger>
          <TabsTrigger value="deploy" className="text-xs gap-1.5 data-[state=active]:bg-emerald/15 data-[state=active]:text-emerald">
            <Rocket className="w-3.5 h-3.5" /> Deploy
          </TabsTrigger>
          <TabsTrigger value="campaign" className="text-xs gap-1.5 data-[state=active]:bg-violet/15 data-[state=active]:text-violet">
            <Target className="w-3.5 h-3.5" /> Campaign
          </TabsTrigger>
          <TabsTrigger value="keywords" className="text-xs gap-1.5 data-[state=active]:bg-cyan/15 data-[state=active]:text-cyan-400">
            <Brain className="w-3.5 h-3.5" /> AI Keywords
          </TabsTrigger>
          <TabsTrigger value="dorks" className="text-xs gap-1.5 data-[state=active]:bg-amber/15 data-[state=active]:text-amber">
            <Globe className="w-3.5 h-3.5" /> Google Dorks
          </TabsTrigger>
        </TabsList>

        {/* ═══ SCAN TAB ═══ */}
        <TabsContent value="scan" className="space-y-4 mt-4">
          <Card className="glass-card border-rose-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="w-4 h-4 text-rose-400" /> Scan Domain for Vulnerable Parameters
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Discovers search/query parameters that reflect input into title, H1, or content
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter domain (e.g., example.com)"
                  value={scanDomain}
                  onChange={(e) => setScanDomain(e.target.value)}
                  className="h-9 text-sm bg-muted/30 flex-1"
                />
                <Button
                  onClick={() => {
                    if (!scanDomain) { toast.error("กรุณากรอก domain"); return; }
                    scanMutation.mutate({ domain: scanDomain });
                  }}
                  disabled={scanMutation.isPending}
                  className="bg-rose-500 text-white hover:bg-rose-600"
                >
                  {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                  Scan
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Scan Results */}
          {scanMutation.data && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  Scan Results for <span className="text-rose-400">{scanMutation.data.domain}</span>
                </h2>
                <Badge className={scanMutation.data.vulnerabilities.length > 0 ? "bg-emerald/20 text-emerald" : "bg-muted text-muted-foreground"}>
                  {scanMutation.data.vulnerabilities.length} vulnerabilities
                </Badge>
              </div>

              {scanMutation.data.vulnerabilities.length === 0 ? (
                <Card className="glass-card border-border/50">
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No vulnerable parameters found on this domain</p>
                  </CardContent>
                </Card>
              ) : (
                scanMutation.data.vulnerabilities.map((vuln: any, i: number) => (
                  <Card key={i} className="glass-card border-emerald/20 hover:border-emerald/40 transition-all">
                    <CardContent className="p-4">
                      <div
                        className="flex items-start justify-between cursor-pointer"
                        onClick={() => setExpandedVuln(expandedVuln === i ? null : i)}
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center shrink-0">
                            <Zap className="w-4 h-4 text-emerald" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-semibold font-mono">{vuln.paramName || vuln.param || "?"}</h3>
                              {vuln.reflectsInTitle && <Badge className="bg-rose-500/15 text-rose-400 text-[9px]">TITLE</Badge>}
                              {vuln.reflectsInH1 && <Badge className="bg-amber/15 text-amber text-[9px]">H1</Badge>}
                              {vuln.reflectsInContent && <Badge className="bg-violet/15 text-violet text-[9px]">CONTENT</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{vuln.baseUrl || vuln.url}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[10px] h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeployDomain(scanMutation.data!.domain);
                              setDeployBaseUrl(vuln.baseUrl || vuln.url || "");
                              setDeployParam(vuln.paramName || vuln.param || "");
                              setDeployReflectsTitle(!!vuln.reflectsInTitle);
                              setDeployReflectsH1(!!vuln.reflectsInH1);
                              setDeployReflectsContent(!!vuln.reflectsInContent);
                              setActiveTab("deploy");
                              toast.info("Vulnerability loaded into Deploy tab");
                            }}
                          >
                            <Rocket className="w-3 h-3 mr-1" /> Deploy
                          </Button>
                          {expandedVuln === i ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </div>

                      {expandedVuln === i && (
                        <div className="mt-3 pt-3 border-t border-border/30 space-y-2 text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-muted-foreground">Base URL:</span>
                              <p className="font-mono text-[11px] break-all">{vuln.baseUrl || vuln.url}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Parameter:</span>
                              <p className="font-mono font-semibold">{vuln.paramName || vuln.param}</p>
                            </div>
                          </div>
                          {vuln.sampleUrl && (
                            <div>
                              <span className="text-muted-foreground">Sample URL:</span>
                              <p className="font-mono text-[11px] text-emerald break-all">{vuln.sampleUrl}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* ═══ DEPLOY TAB ═══ */}
        <TabsContent value="deploy" className="space-y-4 mt-4">
          <Card className="glass-card border-emerald/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Rocket className="w-4 h-4 text-emerald" /> Deploy Keyword-Injected URLs
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Inject keywords into vulnerable parameters and submit for Google indexing
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Input
                  placeholder="Domain (e.g., example.com)"
                  value={deployDomain}
                  onChange={(e) => setDeployDomain(e.target.value)}
                  className="h-9 text-sm bg-muted/30"
                />
                <Input
                  placeholder="Parameter name (e.g., q, search, query)"
                  value={deployParam}
                  onChange={(e) => setDeployParam(e.target.value)}
                  className="h-9 text-sm bg-muted/30"
                />
              </div>
              <Input
                placeholder="Base URL (e.g., https://example.com/search)"
                value={deployBaseUrl}
                onChange={(e) => setDeployBaseUrl(e.target.value)}
                className="h-9 text-sm bg-muted/30"
              />
              <Textarea
                placeholder="Keywords (one per line)"
                value={deployKeywords}
                onChange={(e) => setDeployKeywords(e.target.value)}
                className="min-h-[120px] text-sm bg-muted/30 font-mono"
              />
              <div className="flex gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={deployReflectsTitle} onChange={(e) => setDeployReflectsTitle(e.target.checked)} className="rounded" />
                  Reflects in Title
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={deployReflectsH1} onChange={(e) => setDeployReflectsH1(e.target.checked)} className="rounded" />
                  Reflects in H1
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={deployReflectsContent} onChange={(e) => setDeployReflectsContent(e.target.checked)} className="rounded" />
                  Reflects in Content
                </label>
              </div>
              <Button
                onClick={() => {
                  if (!deployDomain || !deployBaseUrl || !deployParam || !deployKeywords.trim()) {
                    toast.error("กรุณากรอกข้อมูลให้ครบ");
                    return;
                  }
                  deployMutation.mutate({
                    domain: deployDomain,
                    baseUrl: deployBaseUrl,
                    param: deployParam,
                    keywords: deployKeywords.split("\n").map(k => k.trim()).filter(Boolean),
                    reflectsInTitle: deployReflectsTitle,
                    reflectsInH1: deployReflectsH1,
                    reflectsInContent: deployReflectsContent,
                  });
                }}
                disabled={deployMutation.isPending}
                className="bg-emerald text-white hover:bg-emerald/90"
              >
                {deployMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Rocket className="w-4 h-4 mr-1" />}
                Deploy & Index
              </Button>
            </CardContent>
          </Card>

          {/* Deploy Results */}
          {deployMutation.data && (
            <Card className="glass-card border-emerald/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald" /> Deployment Results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Deployed</p>
                    <p className="text-xl font-bold font-mono text-emerald">{deployMutation.data.deployed}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Indexed</p>
                    <p className="text-xl font-bold font-mono text-violet">{deployMutation.data.indexed}</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Domain</p>
                    <p className="text-xs font-mono text-amber truncate">{deployMutation.data.domain}</p>
                  </div>
                </div>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {deployMutation.data.results?.map((r: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/20">
                      {r.indexed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="font-mono truncate flex-1">{r.keyword || r.url}</span>
                      {r.url && (
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-violet hover:text-violet/80">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ CAMPAIGN TAB ═══ */}
        <TabsContent value="campaign" className="space-y-4 mt-4">
          <Card className="glass-card border-violet/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-violet" /> Run Full Campaign
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Auto-scan multiple domains, find vulnerabilities, expand keywords with AI, and deploy all at once
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Target domains (one per line)"
                value={campaignDomains}
                onChange={(e) => setCampaignDomains(e.target.value)}
                className="min-h-[100px] text-sm bg-muted/30 font-mono"
              />
              <Textarea
                placeholder="Base keywords (one per line)"
                value={campaignKeywords}
                onChange={(e) => setCampaignKeywords(e.target.value)}
                className="min-h-[100px] text-sm bg-muted/30 font-mono"
              />
              <div className="flex gap-3 items-center">
                <Input
                  placeholder="Niche"
                  value={campaignNiche}
                  onChange={(e) => setCampaignNiche(e.target.value)}
                  className="h-9 text-sm bg-muted/30 w-40"
                />
                <Button
                  onClick={() => {
                    if (!campaignDomains.trim() || !campaignKeywords.trim()) {
                      toast.error("กรุณากรอก domains และ keywords");
                      return;
                    }
                    campaignMutation.mutate({
                      domains: campaignDomains.split("\n").map(d => d.trim()).filter(Boolean),
                      keywords: campaignKeywords.split("\n").map(k => k.trim()).filter(Boolean),
                      niche: campaignNiche,
                    });
                  }}
                  disabled={campaignMutation.isPending}
                  className="bg-violet text-white hover:bg-violet/90"
                >
                  {campaignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Crosshair className="w-4 h-4 mr-1" />}
                  Launch Campaign
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Results */}
          {campaignMutation.data && (
            <Card className="glass-card border-violet/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Campaign Results</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-xs font-mono bg-muted/30 p-3 rounded-lg overflow-auto max-h-[400px]">
                  {JSON.stringify(campaignMutation.data, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ AI KEYWORDS TAB ═══ */}
        <TabsContent value="keywords" className="space-y-4 mt-4">
          <Card className="glass-card border-cyan/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-400" /> AI Keyword Expansion
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                AI generates related keywords optimized for query parameter injection
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Base keywords (one per line, e.g., สล็อตเว็บตรง)"
                value={expandBaseKeywords}
                onChange={(e) => setExpandBaseKeywords(e.target.value)}
                className="min-h-[100px] text-sm bg-muted/30 font-mono"
              />
              <div className="flex gap-3 items-center">
                <Input
                  type="number"
                  placeholder="Count"
                  value={expandCount}
                  onChange={(e) => setExpandCount(parseInt(e.target.value) || 20)}
                  className="h-9 text-sm bg-muted/30 w-24"
                />
                <Button
                  onClick={() => {
                    if (!expandBaseKeywords.trim()) {
                      toast.error("กรุณากรอก base keywords");
                      return;
                    }
                    expandMutation.mutate({
                      baseKeywords: expandBaseKeywords.split("\n").map(k => k.trim()).filter(Boolean),
                      count: expandCount,
                    });
                  }}
                  disabled={expandMutation.isPending}
                  className="bg-cyan-500 text-white hover:bg-cyan-600"
                >
                  {expandMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
                  Expand Keywords
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Expanded Keywords */}
          {expandMutation.data && (
            <Card className="glass-card border-cyan/20">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" /> Generated Keywords ({expandMutation.data.count})
                  </CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[10px] h-7"
                    onClick={() => {
                      navigator.clipboard.writeText(expandMutation.data!.keywords.join("\n"));
                      toast.success("Keywords copied!");
                    }}
                  >
                    <Copy className="w-3 h-3 mr-1" /> Copy All
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 max-h-[300px] overflow-y-auto">
                  {expandMutation.data.keywords.map((kw: string, i: number) => (
                    <Badge key={i} variant="outline" className="text-[10px] font-mono cursor-pointer hover:bg-cyan/10"
                      onClick={() => { navigator.clipboard.writeText(kw); toast.success(`Copied: ${kw}`); }}>
                      {kw}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ═══ GOOGLE DORKS TAB ═══ */}
        <TabsContent value="dorks" className="space-y-4 mt-4">
          <Card className="glass-card border-amber/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Globe className="w-4 h-4 text-amber" /> Google Dorks for Finding Vulnerable Sites
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Use these Google dork queries to find websites with vulnerable search parameters
              </p>
            </CardHeader>
            <CardContent>
              {dorksData?.dorks ? (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {dorksData.dorks.map((dork: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/20 hover:bg-muted/40 transition-colors group">
                      <Search className="w-3.5 h-3.5 text-amber shrink-0" />
                      <code className="text-xs font-mono flex-1 text-amber/80">{dork}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => { navigator.clipboard.writeText(dork); toast.success("Dork copied!"); }}
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                      <a
                        href={`https://www.google.com/search?q=${encodeURIComponent(dork)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-amber" />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
