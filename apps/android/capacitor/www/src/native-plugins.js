const REQUIRED_FIREBASE_PLUGINS = ["FirebaseAuthentication", "FirebaseFirestore"];
const POLL_INTERVAL_MS = 100;
const DEFAULT_TIMEOUT_MS = 12000;
const FALLBACK_PLUGIN_METHODS = {
  FirebaseAuthentication: ["getCurrentUser", "signInWithGoogle", "signOut"],
  FirebaseFirestore: ["getDocument", "setDocument"],
};

export async function waitForFirebasePlugins(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return waitForNativePlugins(REQUIRED_FIREBASE_PLUGINS, timeoutMs);
}

export async function waitForFirebaseAuthPlugin(timeoutMs = DEFAULT_TIMEOUT_MS) {
  return waitForNativePlugins(["FirebaseAuthentication"], timeoutMs);
}

export function getFirebaseAuthPluginFallback() {
  return getNativePlugin("FirebaseAuthentication");
}

async function waitForNativePlugins(requiredPlugins, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const capacitor = window.Capacitor;
    const nativeBridgeReady = typeof capacitor?.nativePromise === "function";
    const firebaseAuth = getNativePlugin("FirebaseAuthentication");
    const firestore = getNativePlugin("FirebaseFirestore");
    const hasRequiredPlugins = requiredPlugins.every((name) => getNativePlugin(name));

    if (nativeBridgeReady && hasRequiredPlugins) {
      return { firebaseAuth, firestore };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Firebase native plugins are not ready. ${formatNativeBridgeDiagnostics(requiredPlugins)}`);
}

export function formatNativeBridgeDiagnostics(requiredPlugins = REQUIRED_FIREBASE_PLUGINS) {
  const capacitor = window.Capacitor;
  const plugins = Object.keys(capacitor?.Plugins || {});
  const headers = getPluginHeaderNames();

  return [
    `platform=${safeCall(() => capacitor?.getPlatform?.()) || "missing"}`,
    `native=${Boolean(safeCall(() => capacitor?.isNativePlatform?.()))}`,
    `nativePromise=${typeof capacitor?.nativePromise === "function"}`,
    `androidBridge=${Boolean(window.androidBridge)}`,
    `plugins=${formatList(plugins)}`,
    `headers=${formatList(headers)}`,
    `missing=${formatList(requiredPlugins.filter((name) => !hasNativePlugin(name)))}`,
  ].join("; ");
}

function getNativePlugin(name) {
  const capacitor = window.Capacitor;
  if (!capacitor) return null;

  const plugins = capacitor.Plugins || {};
  if (plugins[name]) return plugins[name];
  if (typeof capacitor.nativePromise !== "function") return null;
  if (!hasPluginHeader(name)) return null;

  const proxy = createNativePromiseProxy(capacitor, name);
  plugins[name] = proxy;
  capacitor.Plugins = plugins;
  return proxy;
}

function createNativePromiseProxy(capacitor, pluginName) {
  const proxy = {};
  getPluginMethodNames(pluginName).forEach((methodName) => {
    if (methodName === "addListener") {
      proxy.addListener = (eventName, callback) => capacitor.addListener(pluginName, eventName, callback);
      return;
    }

    proxy[methodName] = (options = {}) => capacitor.nativePromise(pluginName, methodName, options);
  });
  return proxy;
}

function getPluginMethodNames(pluginName) {
  const names = new Set(FALLBACK_PLUGIN_METHODS[pluginName] || []);
  const header = getPluginHeader(pluginName);
  (header?.methods || []).forEach((method) => {
    if (method?.name) names.add(method.name);
  });
  names.add("addListener");
  return [...names];
}

function hasNativePlugin(name) {
  const plugins = window.Capacitor?.Plugins || {};
  return Boolean(plugins[name] || hasPluginHeader(name));
}

function hasPluginHeader(name) {
  return Boolean(getPluginHeader(name));
}

function getPluginHeader(name) {
  return (window.Capacitor?.PluginHeaders || []).find((header) => header?.name === name) || null;
}

function getPluginHeaderNames() {
  return (window.Capacitor?.PluginHeaders || [])
    .map((header) => header?.name)
    .filter(Boolean);
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
