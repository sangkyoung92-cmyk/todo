const REQUIRED_FIREBASE_PLUGINS = ["FirebaseAuthentication", "FirebaseFirestore"];
const POLL_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 7000;

export async function waitForFirebasePlugins(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const capacitor = window.Capacitor;
    const plugins = capacitor?.Plugins || {};
    const firebaseAuth = plugins.FirebaseAuthentication;
    const firestore = plugins.FirebaseFirestore;
    const nativeBridgeReady = typeof capacitor?.nativePromise === "function";

    if (nativeBridgeReady && firebaseAuth && firestore) {
      return { firebaseAuth, firestore };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Firebase native plugins are not ready. ${formatNativeBridgeDiagnostics()}`);
}

export function formatNativeBridgeDiagnostics() {
  const capacitor = window.Capacitor;
  const plugins = Object.keys(capacitor?.Plugins || {});
  const headers = (capacitor?.PluginHeaders || [])
    .map((header) => header?.name)
    .filter(Boolean);

  return [
    `platform=${safeCall(() => capacitor?.getPlatform?.()) || "missing"}`,
    `native=${Boolean(safeCall(() => capacitor?.isNativePlatform?.()))}`,
    `nativePromise=${typeof capacitor?.nativePromise === "function"}`,
    `androidBridge=${Boolean(window.androidBridge)}`,
    `plugins=${formatList(plugins)}`,
    `headers=${formatList(headers)}`,
    `missing=${formatList(REQUIRED_FIREBASE_PLUGINS.filter((name) => !plugins.includes(name)))}`,
  ].join("; ");
}

function formatList(values) {
  return values.length ? values.join(",") : "none";
}

function safeCall(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
