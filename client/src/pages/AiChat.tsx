/**
 * Design: Obsidian Intelligence — Friday AI Chat
 * AI-powered SEO assistant with direct API calls to OpenAI/Claude/Gemini/DeepSeek
 */
import { useState, useRef, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bot, Send, Loader2, Sparkles, User, Trash2 } from "lucide-react";
import { Streamdown } from "streamdown";

interface Message {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  "วิเคราะห์ SEO ของเว็บไซต์ให้หน่อย",
  "แนะนำ Keyword Research strategy",
  "วิธีทำ Link Building ที่ปลอดภัย",
  "เปรียบเทียบ White Hat vs Black Hat SEO",
  "วิธีเพิ่ม Domain Authority",
  "แนะนำ Content Strategy สำหรับ 2026",
];

export default function AiChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Load chat history from server
  const { data: chatHistory } = trpc.chat.history.useQuery({ limit: 100 });

  useEffect(() => {
    if (chatHistory && chatHistory.length > 0 && messages.length === 0) {
      setMessages(chatHistory.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        provider: m.provider || undefined,
        timestamp: new Date(m.createdAt),
      })));
    }
  }, [chatHistory]);

  const sendMutation = trpc.chat.send.useMutation({
    onSuccess: (data) => {
      const aiMsg: Message = { role: "assistant", content: data.response, provider: data.provider, timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    },
    onError: (err) => {
      const errMsg: Message = { role: "assistant", content: `Error: ${err.message}`, provider: "error", timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    },
  });

  const clearMutation = trpc.chat.clear.useMutation({
    onSuccess: () => {
      setMessages([]);
      toast.success("Chat cleared");
    },
  });

  const loading = sendMutation.isPending;

  function handleSend(text?: string) {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    sendMutation.mutate({ message: msg });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] h-[calc(100dvh-120px)] max-w-[900px]">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 bg-violet rounded-full" />
          <h1 className="text-lg font-bold tracking-tight">Friday AI Chat</h1>
          <Badge variant="outline" className="font-mono text-[10px] border-violet/30 text-violet">AI-Powered</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => clearMutation.mutate()} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-1" /> Clear
        </Button>
      </div>

      {/* Chat Area */}
      <Card className="glass-card border-border/50 flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-violet/10 border border-violet/20 flex items-center justify-center mb-4">
                <Bot className="w-8 h-8 text-violet" />
              </div>
              <h2 className="text-lg font-semibold mb-1">สวัสดีครับ! ผม Friday AI</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md">
                ผมเป็น AI SEO Expert ถามผมได้ทุกเรื่องเกี่ยวกับ SEO, Domain, Link Building, Content Strategy
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg w-full px-2 sm:px-0">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => handleSend(p)}
                    className="text-left text-xs p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-violet/30 hover:bg-violet/5 transition-all"
                  >
                    <Sparkles className="w-3 h-3 text-violet mb-1" />
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-up`}>
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-violet" />
                </div>
              )}
              <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === "user" ? "bg-emerald/10 border border-emerald/20" : "bg-muted/30 border border-border/50"} rounded-xl px-3 sm:px-4 py-2.5 sm:py-3`}>
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm prose-invert max-w-none text-sm [&_p]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_code]:text-violet [&_code]:bg-violet/10 [&_code]:px-1 [&_code]:rounded">
                    <Streamdown>{msg.content}</Streamdown>
                  </div>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
                {msg.provider && msg.role === "assistant" && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[9px] font-mono border-violet/20 text-violet/60">{msg.provider}</Badge>
                  </div>
                )}
              </div>
              {msg.role === "user" && (
                <div className="w-8 h-8 rounded-lg bg-emerald/10 border border-emerald/20 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-emerald" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 animate-fade-in-up">
              <div className="w-8 h-8 rounded-lg bg-violet/10 border border-violet/20 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-violet" />
              </div>
              <div className="bg-muted/30 border border-border/50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-violet" />
                  Friday AI กำลังคิด...
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 sm:p-4 border-t border-border/50">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="ถาม Friday AI เรื่อง SEO..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 sm:px-4 py-3 sm:py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet/50"
              disabled={loading}
            />
            <Button onClick={() => handleSend()} disabled={loading || !input.trim()} className="bg-violet text-white hover:bg-violet/90 h-auto px-4">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
