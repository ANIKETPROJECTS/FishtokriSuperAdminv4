// QZ Tray silent printing utility.
// Loads qz-tray.min.js from CDN once, reuses a single WebSocket connection,
// and prints raw HTML to a thermal printer.
// Falls back gracefully if QZ Tray is not running.

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz: any;
  }
}

const QZ_CDN_URL = "https://cdn.jsdelivr.net/npm/qz-tray@2.2.4/qz-tray.min.js";
const PREFERRED_PRINTER = "TENAX TN-260";
const CONNECT_TIMEOUT_MS = 5000;

let _scriptLoaded = false;
let _scriptLoadingPromise: Promise<void> | null = null;

function loadQzScript(): Promise<void> {
  if (_scriptLoaded && window.qz) return Promise.resolve();
  if (_scriptLoadingPromise) return _scriptLoadingPromise;

  _scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    if (window.qz) {
      _scriptLoaded = true;
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${QZ_CDN_URL}"]`);
    if (existing) {
      // Script tag exists but qz might not be ready yet — poll briefly
      const start = Date.now();
      const poll = () => {
        if (window.qz) { _scriptLoaded = true; resolve(); return; }
        if (Date.now() - start > 5000) { reject(new Error("QZ Tray script timed out")); return; }
        setTimeout(poll, 100);
      };
      poll();
      return;
    }
    const script = document.createElement("script");
    script.src = QZ_CDN_URL;
    script.async = true;
    script.onload = () => {
      _scriptLoaded = true;
      _scriptLoadingPromise = null;
      resolve();
    };
    script.onerror = () => {
      _scriptLoadingPromise = null;
      reject(new Error("Failed to load QZ Tray script from CDN"));
    };
    document.head.appendChild(script);
  });

  return _scriptLoadingPromise;
}

function setupSecurity(): void {
  const qz = window.qz;
  // Provide empty certificate/signature so QZ Tray does not show
  // the "Untrusted website" security popup.
  qz.security.setCertificatePromise((resolve: (value?: unknown) => void) => {
    resolve();
  });
  qz.security.setSignaturePromise((_toSign: string) => {
    return (resolve: (value?: unknown) => void) => {
      resolve();
    };
  });
}

async function ensureConnected(): Promise<void> {
  const qz = window.qz;
  if (qz.websocket.isActive()) return;

  await Promise.race([
    qz.websocket.connect(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("QZ Tray connection timed out — is QZ Tray running?")),
        CONNECT_TIMEOUT_MS
      )
    ),
  ]);
}

async function resolvePrinter(): Promise<string> {
  const qz = window.qz;

  // Try the preferred printer first
  try {
    const found = await qz.printers.find(PREFERRED_PRINTER);
    const name = Array.isArray(found) ? found[0] : found;
    if (name && typeof name === "string" && name.trim().length > 0) {
      return name;
    }
  } catch {
    // not found — fall through to list all printers
  }

  // Fall back to the first available printer
  const all = await qz.printers.find();
  const list: string[] = Array.isArray(all) ? all : (all ? [all] : []);
  const first = list.find((p) => p && p.trim().length > 0);
  if (!first) throw new Error("No printers found via QZ Tray");
  return first;
}

export interface QzPrintResult {
  success: boolean;
  error?: string;
}

/**
 * Print an HTML string silently to the thermal printer via QZ Tray.
 * Returns { success: false } if QZ Tray is unavailable, not running,
 * or any other error occurs — the caller should then fall back to
 * window.print().
 */
export async function printHtmlWithQZ(htmlContent: string): Promise<QzPrintResult> {
  try {
    await loadQzScript();

    const qz = window.qz;
    if (!qz) throw new Error("window.qz not available after script load");

    setupSecurity();
    await ensureConnected();

    const printerName = await resolvePrinter();

    const config = qz.configs.create(printerName, {
      size: { width: 80, height: null },
      units: "mm",
      margins: { top: 0, right: 0, bottom: 0, left: 0 },
      orientation: "portrait",
      scaleContent: true,
      colorType: "blackwhite",
    });

    await qz.print(config, [
      {
        type: "pixel",
        format: "html",
        flavor: "plain",
        data: htmlContent,
      },
    ]);

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
