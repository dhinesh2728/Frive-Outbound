import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function HowToGuide({ steps, warnings, title = "How to use this page" }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mb-5 border-blue-200 bg-blue-50/60">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-blue-800 hover:bg-blue-100/60 transition-colors rounded-xl"
      >
        <span className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 shrink-0" />
          {title}
        </span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <CardContent className="px-4 pb-4 pt-1">
          <ol className="space-y-3.5">
            {steps.map((step, i) => {
              const isObj = step && typeof step === "object";
              return (
                <li key={i} className="flex gap-3 text-sm text-blue-900">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-200 text-blue-800 text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {isObj ? (
                    <div>
                      <p className="font-semibold leading-snug">{step.title}</p>
                      <p className="text-blue-800/80 mt-1 leading-relaxed">{step.body}</p>
                    </div>
                  ) : (
                    <span>{step}</span>
                  )}
                </li>
              );
            })}
          </ol>
          {warnings && warnings.length > 0 && (
            <div className="mt-4 space-y-1.5 border-t border-amber-200 pt-3">
              {warnings.map((w, i) => (
                <p key={i} className="flex items-start gap-2 text-sm text-amber-700 font-medium">
                  <span className="shrink-0 mt-px">⚠️</span>
                  <span>{w}</span>
                </p>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
