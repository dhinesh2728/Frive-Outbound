import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Clock, Calendar, Eye, Link } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import AccessDenied from "@/components/shared/AccessDenied";
import { useOutletContext } from "react-router-dom";
import { DEFAULT_SETTINGS } from "@/lib/cookDateLogic";

export default function CookDateSettings() {
  const { admin } = useOutletContext() || {};
  const queryClient = useQueryClient();

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["cook-date-settings"],
    queryFn: () => base44.entities.CookDateSettings.list("-created_date", 1),
  });

  const existing = settingsList[0] || null;

  const [form, setForm] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    if (existing) {
      setForm({
        cutoff_hour: existing.cutoff_hour ?? DEFAULT_SETTINGS.cutoff_hour,
        cutoff_minute: existing.cutoff_minute ?? DEFAULT_SETTINGS.cutoff_minute,
        single_date_cutoff_days_before: existing.single_date_cutoff_days_before ?? DEFAULT_SETTINGS.single_date_cutoff_days_before,
        combined_use_first_date: existing.combined_use_first_date ?? DEFAULT_SETTINGS.combined_use_first_date,
        visibility_days_before_today: existing.visibility_days_before_today ?? DEFAULT_SETTINGS.visibility_days_before_today,
      });
    }
  }, [existing?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existing) {
        await base44.entities.CookDateSettings.update(existing.id, data);
      } else {
        await base44.entities.CookDateSettings.create(data);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cook-date-settings"] }),
  });

  if (!admin) return <AccessDenied />;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Format cutoff time for display
  const cutoffTimeStr = `${String(form.cutoff_hour).padStart(2, "0")}:${String(form.cutoff_minute).padStart(2, "0")}`;

  return (
    <div>
      <PageHeader
        title="Cook Date Settings"
        description="Configure cutoff deadlines and visibility rules for cook dates"
      />

      <div className="grid gap-5">

        {/* Cutoff Time */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Cutoff Time</CardTitle>
            </div>
            <CardDescription>
              The time of day when a cook cycle ends and the next one activates automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cutoff Hour (0–23)</Label>
              <Input
                type="number"
                min={0}
                max={23}
                value={form.cutoff_hour}
                onChange={(e) => set("cutoff_hour", Math.min(23, Math.max(0, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">Default: 21 (9 PM)</p>
            </div>
            <div className="space-y-1.5">
              <Label>Cutoff Minute (0–59)</Label>
              <Input
                type="number"
                min={0}
                max={59}
                value={form.cutoff_minute}
                onChange={(e) => set("cutoff_minute", Math.min(59, Math.max(0, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">Default: 0</p>
            </div>
            <div className="sm:col-span-2 rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
              Current cutoff time: <span className="font-semibold text-foreground">{cutoffTimeStr}</span>
            </div>
          </CardContent>
        </Card>

        {/* Single cook date cutoff */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Single Cook Date Cutoff</CardTitle>
            </div>
            <CardDescription>
              For single cook dates, the cutoff falls this many days before the scheduled cook date.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Days Before Cook Date</Label>
              <Input
                type="number"
                min={0}
                max={7}
                value={form.single_date_cutoff_days_before}
                onChange={(e) => set("single_date_cutoff_days_before", Math.min(7, Math.max(0, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">
                Default: 1 — e.g. cook date 27 May → cutoff 26 May at {cutoffTimeStr}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Combined cook date cutoff */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Combined Cook Date Cutoff</CardTitle>
            </div>
            <CardDescription>
              For combined Sunday + Monday pairs, which date is used as the cutoff reference?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Use first date (Sunday) as cutoff reference</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {form.combined_use_first_date
                  ? "e.g. 31 May + 1 Jun → cutoff is 31 May at " + cutoffTimeStr
                  : "e.g. 31 May + 1 Jun → cutoff is 1 Jun at " + cutoffTimeStr}
              </p>
            </div>
            <Switch
              checked={form.combined_use_first_date}
              onCheckedChange={(v) => set("combined_use_first_date", v)}
            />
          </CardContent>
        </Card>

        {/* Visibility window */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Cook Date Visibility Window</CardTitle>
            </div>
            <CardDescription>
              How many days in the past should cook dates remain visible in the admin panel and reports?
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Days Before Today</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={form.visibility_days_before_today}
                onChange={(e) => set("visibility_days_before_today", Math.min(365, Math.max(1, Number(e.target.value))))}
              />
              <p className="text-xs text-muted-foreground">Default: 14 (2 weeks)</p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending}
            className="min-w-32"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}
