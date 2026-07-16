import { supabase } from "@/api/supabaseClient";

function formatDateDMY(isoStr) {
  if (!isoStr) return "";
  const part = String(isoStr).substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return isoStr;
  const [yyyy, mm, dd] = part.split("-");
  return `${dd}/${mm}/${yyyy}`;
}

function addDaysDMY(isoDateStr, days) {
  const part = String(isoDateStr || "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return "";
  const [y, m, d] = part.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
}

// ISO equivalent of addDaysDMY — returns YYYY-MM-DD for DB storage, null on invalid input.
function isoAddDays(isoStr, days) {
  const part = String(isoStr || "").substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null;
  const [y, m, d] = part.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function buildCookDateMap(jobs) {
  const map = {};
  for (const j of (jobs || [])) {
    const k = (j.menu_item_code || "").toLowerCase().trim();
    if (!map[k] || j.cook_date > map[k]) map[k] = j.cook_date;
  }
  return map;
}

async function buildLpJobMap() {
  // Query both sources in parallel; meal_count_jobs overrides predictions when populated.
  // Keys are cook_date_code so different cooks with different LP codes never collide.
  const [jobsRes, predRes] = await Promise.all([
    // NOTE: meal_count_jobs does not have an lp_item_id column (column is menu_item_id).
    // This query intentionally returns no rows and falls through to imported_meal_predictions below.
    // Do not 'fix' the column name without a full audit — imported_meal_predictions is the authoritative LP source.
    supabase
      .from("meal_count_jobs")
      .select("menu_item_code, cook_date, lp_item_id")
      .not("lp_item_id", "is", null),
    supabase
      .from("imported_meal_predictions")
      .select("menu_item_code, cook_date, lp_item_id")
      .not("lp_item_id", "is", null),
  ]);
  const map = {};
  for (const row of (predRes.data || [])) {
    if (row.menu_item_code && row.lp_item_id) {
      const key = `${row.cook_date}_${(row.menu_item_code || "").toLowerCase().trim()}`;
      map[key] = row.lp_item_id;
    }
  }
  for (const row of (jobsRes.data || [])) {
    if (row.menu_item_code && row.lp_item_id) {
      const key = `${row.cook_date}_${(row.menu_item_code || "").toLowerCase().trim()}`;
      map[key] = row.lp_item_id;
    }
  }
  return map;
}

// Returns { csvRows, dbRows } — one entry per pallet with content.
// csvRows: DD/MM/YYYY formatted, ready for CSV export (shape unchanged from before).
// dbRows: ISO date values for DB storage; no FK/traceability columns (added by saveAsnRecords).
function buildAsnRows(pallets, lpJobMap, cookDateMap) {
  const csvRows = [];
  const dbRows = [];
  for (const pallet of pallets) {
    const items = pallet.items || [];
    if (!items.length) continue;
    const item = items[0];
    const code = (item.menu_item_code || "").toLowerCase().trim();
    const cookDate = (pallet.cook_dates || [])[0] || cookDateMap[code] || "";
    const sku = item.lp_item_id || lpJobMap[`${cookDate}_${code}`] || lpJobMap[code] || item.menu_item_code || "";
    const prodIso = (pallet.created_date || "").substring(0, 10);
    const totalQty = items.reduce((s, i) => s + (i.quantity || 0), 0);
    csvRows.push({
      CONTRACT: "F063",
      SUPPLIER: "F063",
      SKU: sku,
      "QTY (UNITS)": totalQty,
      DELIVERYDATE: formatDateDMY(cookDate),
      REFERENCE: "FriveASN",
      PalletIdentifier: pallet.pallet_id,
      Expirydate: prodIso ? addDaysDMY(prodIso, 7) : "",
      BatchId: "",
      ProductionDate: formatDateDMY(prodIso),
    });
    dbRows.push({
      contract: "F063",
      supplier: "F063",
      sku,
      qty_units: totalQty,
      delivery_date: cookDate || null,
      reference: "FriveASN",
      pallet_identifier: pallet.pallet_id,
      expiry_date: prodIso ? isoAddDays(prodIso, 7) : null,
      batch_id: "",
      production_date: prodIso || null,
    });
  }
  return { csvRows, dbRows };
}

// Exported for the OutboundAdmin and Reports manual download paths.
export function buildAsnDbRows(pallets, lpJobMap, cookDateMap) {
  return buildAsnRows(pallets, lpJobMap, cookDateMap).dbRows;
}

function rowsToCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => `"${r[h] ?? ""}"`).join(",")),
  ].join("\n");
}

// Saves ASN line-item records to asn_records. Non-fatal — logs but never throws,
// so a DB write failure never masks the email send result.
export async function saveAsnRecords(dbRows, { trailerId, generatedBy, triggerSource, resendMessageId, sendStatus }) {
  if (!dbRows.length) return;
  const records = dbRows.map(row => ({
    ...row,
    trailer_id: trailerId,
    cook_date: row.delivery_date || null,
    generated_by: generatedBy || null,
    trigger_source: triggerSource,
    resend_message_id: resendMessageId || null,
    send_status: sendStatus,
  }));
  const { error } = await supabase.from("asn_records").insert(records);
  if (error) console.error("[ASN] Failed to save asn_records:", error.message);
}

export async function sendAsnEmail({ trailer, pallets, jobs = [], recipients, generatedBy }) {
  if (!recipients || !recipients.length) return 0;

  const [lpJobMap, cookDateMap] = await Promise.all([
    buildLpJobMap(),
    Promise.resolve(buildCookDateMap(jobs)),
  ]);

  const { csvRows, dbRows } = buildAsnRows(pallets, lpJobMap, cookDateMap);
  if (!csvRows.length) return 0;

  const csv = rowsToCsv(csvRows);

  const firstPallet = pallets[0];
  const cookDate =
    (firstPallet?.cook_dates || [])[0] ||
    cookDateMap[((firstPallet?.items || [])[0]?.menu_item_code || "").toLowerCase().trim()] ||
    trailer.closed_at?.substring(0, 10) ||
    "unknown";

  const trailerId = (trailer.trailer_id_label || trailer.id || "").replace(/\s+/g, "_");
  const filename = `ASN_${trailerId}_${cookDate}.csv`;
  const subject = `ASN Report — ${trailer.trailer_id_label || trailerId} — ${cookDate}`;

  const base64Csv = btoa(unescape(encodeURIComponent(csv)));

  const toAddresses = recipients.map((r) => r.email);
  console.log("[ASN] Calling edge function", { to: toAddresses, subject, rows: csvRows.length });

  const { data: fnData, error: fnError } = await supabase.functions.invoke("send-asn-email", {
    body: {
      to: toAddresses,
      subject,
      text: `ASN Report for trailer ${trailer.trailer_id_label || trailerId}.\n\nPlease find the attached CSV file.\n\nGenerated by Frive Meal Assembly.`,
      filename,
      base64Csv,
    },
  });

  // Always save regardless of email outcome — a failed send gets send_status='failed'
  // with no resend_message_id. The throw below happens after the DB write so the
  // caller's onError handler still fires.
  await saveAsnRecords(dbRows, {
    trailerId: trailer.id,
    generatedBy: generatedBy || null,
    triggerSource: "auto_on_close",
    resendMessageId: fnError ? null : (fnData?.id || null),
    sendStatus: fnError ? "failed" : "sent",
  });

  if (fnError) {
    console.error("[ASN] Edge function error:", fnError);
    throw new Error(fnError.message || "Edge function call failed");
  }

  return recipients.length;
}
