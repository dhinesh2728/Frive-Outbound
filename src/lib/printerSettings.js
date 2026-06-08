const STORAGE_KEY = "frive_printer_settings";

export const DEFAULT_PRINTER_SETTINGS = {
  printerName: "Citizen CL-S521",
  labelWidth: "99",
  labelHeight: "99",
};

export function getPrinterSettings() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...DEFAULT_PRINTER_SETTINGS, ...JSON.parse(stored) } : { ...DEFAULT_PRINTER_SETTINGS };
  } catch {
    return { ...DEFAULT_PRINTER_SETTINGS };
  }
}

export function savePrinterSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Injects a <style> tag with dynamic @page size so window.print() uses the
// configured label dimensions. Must be called before window.print().
export function applyPrintStyle(settings) {
  const { labelWidth = "99", labelHeight = "99" } = settings;
  const id = "frive-label-print-style";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("style");
    el.id = id;
    document.head.appendChild(el);
  }
  el.textContent = `
@media print {
  @page { size: ${labelWidth}mm ${labelHeight}mm; margin: 0; }
  body * { visibility: hidden; }
  .print-label {
    display: block !important;
    visibility: visible !important;
    position: fixed;
    top: 0;
    left: 0;
    width: ${labelWidth}mm;
    height: ${labelHeight}mm;
    overflow: hidden;
    background: white;
  }
  .print-label * { visibility: visible !important; }
}`;
}
