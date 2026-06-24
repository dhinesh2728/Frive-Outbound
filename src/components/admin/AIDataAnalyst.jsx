import { useState, useEffect, useRef } from "react";
import { X, Send, BrainCircuit, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SUGGESTED_PROMPTS = [
  "Which meals are over target and by how much?",
  "What's still not started?",
  "Which trailer has the most meals?",
  "Show me everything loaded to trailer",
  "Give me a full cook summary",
];

function buildSystem(cookDate, rawForAI) {
  return `You are a data analyst assistant for Frive's meal production operations.
Cook date: ${cookDate}
Real-time operational data:
${JSON.stringify(rawForAI, null, 2)}

Rules:
- Only compute from the data above. Never guess or invent numbers.
- Be concise and factual.
- If the answer is a list or table, wrap a JSON array in <table></table> tags like this:
  <table>[{"Meal":"meat 1","Status":"over_target","Counted":8500,"Target":8000,"Over by":500}]</table>
- For non-tabular answers use plain text only.`;
}

export default function AIDataAnalyst({ open, onClose, cookDate, rawForAI }) {
  const [messages, setMessages] = useState([]);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setConversationHistory([]);
    setError(null);
  }, [cookDate]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send(overrideText) {
    const userText = overrideText ?? input.trim();
    if (!userText || loading) return;
    setInput("");
    setError(null);

    const newDisplayMessages = [...messages, { role: "user", content: userText }];
    setMessages(newDisplayMessages);

    const newHistory = [...conversationHistory, { role: "user", content: userText }];
    setConversationHistory(newHistory);
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: buildSystem(cookDate, rawForAI),
          messages: newHistory,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const rawText = data.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");

      const tableMatch = rawText.match(/<table>([\s\S]*?)<\/table>/);
      let tableData = null;
      let displayText = rawText;

      if (tableMatch) {
        try {
          tableData = JSON.parse(tableMatch[1]);
          displayText = rawText.replace(/<table>[\s\S]*?<\/table>/, "").trim();
        } catch {
          tableData = null;
        }
      }

      const assistantMsg = { role: "assistant", content: displayText, tableData };
      setMessages(prev => [...prev, assistantMsg]);
      setConversationHistory(prev => [...prev, { role: "assistant", content: rawText }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function downloadCSV(tableData) {
    if (!tableData?.length) return;
    const headers = Object.keys(tableData[0]);
    const csv = [
      headers.join(","),
      ...tableData.map(row =>
        headers.map(h => `"${row[h] ?? ""}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cookDate}-analysis.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[420px] max-w-full bg-background z-50 flex flex-col shadow-xl border-l">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-primary" />
            <span className="font-semibold text-sm">AI Data Analyst</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Conversation area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">Suggested questions:</p>
              {SUGGESTED_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => send(prompt)}
                  className="block w-full text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content && (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
                {msg.tableData?.length > 0 && (
                  <div className="mt-2">
                    <div className="overflow-x-auto rounded border border-border">
                      <table className="text-xs border-collapse w-full">
                        <thead>
                          <tr className="bg-background">
                            {Object.keys(msg.tableData[0]).map(h => (
                              <th
                                key={h}
                                className="border border-border px-2 py-1.5 text-left font-medium whitespace-nowrap"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msg.tableData.map((row, ri) => (
                            <tr key={ri} className="even:bg-muted/40">
                              {Object.keys(msg.tableData[0]).map(h => (
                                <td key={h} className="border border-border px-2 py-1 whitespace-nowrap">
                                  {row[h] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1.5 text-xs h-7"
                      onClick={() => downloadCSV(msg.tableData)}
                    >
                      <Download className="w-3 h-3" />
                      Download CSV
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-3 py-2.5">
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              Error: {error}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="p-4 border-t flex gap-2 shrink-0">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about cook day data..."
            className="flex-1"
            disabled={loading}
          />
          <Button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            size="icon"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </>
  );
}
