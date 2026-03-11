import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Globe, Search, Zap, Trophy, Activity, Plus, RefreshCw, ExternalLink,
  CheckCircle, XCircle, Clock, TrendingUp, BarChart3, Loader2, Send,
} from "lucide-react";

export default function PlatformDiscoveryDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  // Queries
  const statsQuery = trpc.platformDiscovery.getStats.useQuery();
  const allPlatformsQuery = trpc.platformDiscovery.getAll.useQuery();
  const leaderboardQuery = trpc.platformDiscovery.getLeaderboard.useQuery();
  const postHistoryQuery = trpc.platformDiscovery.getPostHistory.useQuery({ limit: 50 });

  // Mutations
  const discoverMutation = trpc.platformDiscovery.discover.useMutation({
    onSuccess: (data) => {
      toast.success(`Discovery Complete: Found ${data.newPlatforms} new platforms`);
      allPlatformsQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(`Discovery Failed: ${err.message}`),
  });

  const healthCheckMutation = trpc.platformDiscovery.batchHealthCheck.useMutation({
    onSuccess: (data) => {
      toast.success(`Health Check Complete: ${data.alive}/${data.total} platforms alive`);
      allPlatformsQuery.refetch();
    },
  });

  // Auto-post form state
  const [postForm, setPostForm] = useState({
    targetUrl: "",
    targetDomain: "",
    keyword: "",
    anchorText: "",
    maxPlatforms: 10,
  });

  const autoPostMutation = trpc.platformDiscovery.autoPost.useMutation({
    onSuccess: (data) => {
      toast.success(`Auto-Post Complete: ${data.successCount}/${data.totalPlatforms} successful`);
      postHistoryQuery.refetch();
      statsQuery.refetch();
    },
    onError: (err) => toast.error(`Auto-Post Failed: ${err.message}`),
  });

  const stats = statsQuery.data;
  const platforms = allPlatformsQuery.data || [];
  const leaderboard = leaderboardQuery.data || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="h-7 w-7 text-cyan-500" />
            Platform Discovery Engine
          </h1>
          <p className="text-muted-foreground mt-1">
            AI ค้นหาเว็บใหม่ สมัครเอง โพสต์เอง สร้าง backlink อัตโนมัติ
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => healthCheckMutation.mutate()}
            disabled={healthCheckMutation.isPending}
          >
            {healthCheckMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Activity className="h-4 w-4 mr-1" />}
            Health Check
          </Button>
          <Button
            size="sm"
            onClick={() => discoverMutation.mutate({ niche: "gambling", count: 10 })}
            disabled={discoverMutation.isPending}
          >
            {discoverMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Search className="h-4 w-4 mr-1" />}
            Discover New
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Card className="border-cyan-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-cyan-400">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Platforms</div>
            </CardContent>
          </Card>
          <Card className="border-green-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-400">{stats.totalIndexed}</div>
              <div className="text-xs text-muted-foreground">Indexed</div>
            </CardContent>
          </Card>
          <Card className="border-yellow-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{stats.totalPosts}</div>
              <div className="text-xs text-muted-foreground">Total Posts</div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-emerald-400">{stats.topPerformers?.length || 0}</div>
              <div className="text-xs text-muted-foreground">Top Performers</div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-400">{stats.avgDA?.toFixed(0) || 0}</div>
              <div className="text-xs text-muted-foreground">Avg DA</div>
            </CardContent>
          </Card>
          <Card className="border-orange-500/20">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-400">
                {stats.totalPosts > 0 ? ((stats.totalIndexed / stats.totalPosts) * 100).toFixed(0) : 0}%
              </div>
              <div className="text-xs text-muted-foreground">Success Rate</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">All Platforms</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="autopost">Auto-Post</TabsTrigger>
          <TabsTrigger value="history">Post History</TabsTrigger>
        </TabsList>

        {/* All Platforms Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-3">
            {platforms.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No platforms discovered yet. Click "Discover New" to start.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-2">
                {platforms.map((p: any) => (
                  <Card key={p.id} className={`border-l-4 ${p.isAlive ? "border-l-green-500" : "border-l-red-500"}`}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {p.name}
                            <Badge variant="outline" className="text-[10px]">{p.type}</Badge>
                            {p.linkType === "dofollow" && <Badge className="bg-green-600 text-[10px]">dofollow</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{p.url}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-center">
                          <div className="text-sm font-bold">{p.estimatedDA}</div>
                          <div className="text-[10px] text-muted-foreground">DA</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">{p.successCount}/{p.postCount}</div>
                          <div className="text-[10px] text-muted-foreground">Success</div>
                        </div>
                        <div className="text-center">
                          <div className="text-sm font-bold">{p.priorityScore?.toFixed(0) || 0}</div>
                          <div className="text-[10px] text-muted-foreground">Priority</div>
                        </div>
                        {p.isAlive ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Leaderboard Tab */}
        <TabsContent value="leaderboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                Platform Leaderboard
              </CardTitle>
              <CardDescription>Ranked by performance score (DA, success rate, index speed)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {leaderboard.slice(0, 20).map((p: any, i: number) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      i === 0 ? "bg-yellow-500/20 text-yellow-400" :
                      i === 1 ? "bg-gray-400/20 text-gray-300" :
                      i === 2 ? "bg-orange-500/20 text-orange-400" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.type} | {p.linkType}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-sm font-bold text-cyan-400">DA {p.estimatedDA}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-green-400">
                          {p.postCount > 0 ? ((p.successCount / p.postCount) * 100).toFixed(0) : 0}%
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-purple-400">{p.priorityScore?.toFixed(0) || 0}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Auto-Post Tab */}
        <TabsContent value="autopost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-cyan-500" />
                Auto-Post to Discovered Platforms
              </CardTitle>
              <CardDescription>AI จะเลือก platforms ที่ดีที่สุด สร้าง content แล้วโพสต์อัตโนมัติ</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Target URL</label>
                  <Input
                    placeholder="https://example.com"
                    value={postForm.targetUrl}
                    onChange={(e) => setPostForm(prev => ({ ...prev, targetUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Domain</label>
                  <Input
                    placeholder="example.com"
                    value={postForm.targetDomain}
                    onChange={(e) => setPostForm(prev => ({ ...prev, targetDomain: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Keyword</label>
                  <Input
                    placeholder="target keyword"
                    value={postForm.keyword}
                    onChange={(e) => setPostForm(prev => ({ ...prev, keyword: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Anchor Text</label>
                  <Input
                    placeholder="click here"
                    value={postForm.anchorText}
                    onChange={(e) => setPostForm(prev => ({ ...prev, anchorText: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Max Platforms</label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={postForm.maxPlatforms}
                  onChange={(e) => setPostForm(prev => ({ ...prev, maxPlatforms: parseInt(e.target.value) || 10 }))}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => autoPostMutation.mutate(postForm)}
                disabled={autoPostMutation.isPending || !postForm.targetUrl || !postForm.keyword}
              >
                {autoPostMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Posting...</>
                ) : (
                  <><Zap className="h-4 w-4 mr-2" /> Launch Auto-Post</>
                )}
              </Button>

              {autoPostMutation.data && (
                <Card className="border-green-500/30 bg-green-500/5">
                  <CardContent className="p-4">
                    <div className="font-medium text-green-400 mb-2">
                      Auto-Post Results: {autoPostMutation.data.successCount}/{autoPostMutation.data.totalPlatforms} successful
                    </div>
                    <div className="space-y-1">
                      {autoPostMutation.data.attempts?.filter((a: any) => a.success).map((a: any, i: number) => (
                        <div key={i} className="text-xs flex items-center gap-2">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          <span>{a.platformName}</span>
                          {a.publishedUrl && (
                            <a href={a.publishedUrl} target="_blank" rel="noopener" className="text-cyan-400 hover:underline flex items-center gap-1">
                              <ExternalLink className="h-3 w-3" /> View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Post History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-purple-500" />
                Post History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(postHistoryQuery.data || []).length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No post history yet</p>
                ) : (
                  (postHistoryQuery.data || []).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/50">
                      <div className="flex items-center gap-2">
                        {p.success ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
                        <div>
                          <div className="text-sm font-medium">{p.platformName}</div>
                          <div className="text-xs text-muted-foreground">{new Date(p.timestamp).toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-muted-foreground">{p.responseTime}ms</div>
                        {p.publishedUrl && (
                          <a href={p.publishedUrl} target="_blank" rel="noopener">
                            <ExternalLink className="h-3 w-3 text-cyan-400" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
