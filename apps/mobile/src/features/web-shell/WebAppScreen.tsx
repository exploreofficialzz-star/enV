import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Linking,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import WebView from "react-native-webview";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConnectionErrorView } from "@/features/web-shell/ConnectionErrorView";
import { BLOB_DOWNLOAD_BRIDGE_SCRIPT } from "@/features/web-shell/blob-download-bridge";
import ContactExchangeModule from "../../../modules/contact-exchange/src/ContactExchangeModule";
import {
  MAX_NATIVE_DOWNLOAD_BYTES,
  WEB_APP_URL,
  isInternalWebUrl,
  isSafeHttpsWebUrl,
} from "@/lib/web-app-config";

const WEBVIEW_LOAD_TIMEOUT_MS = 20_000;

type RecoveryReason = "connection" | "renderer";

type NativeDownload = {
  id: string;
  uri: string;
  name: string;
  mimeType: string;
  expectedBytes: number;
  receivedBytes: number;
  failed: boolean;
};

type BridgeMessage = {
  type?: string;
  id?: string;
  name?: string;
  mimeType?: string;
  size?: number;
  base64?: string;
  message?: string;
  profile?: string;
  fields?: string[];
};


function safeFilename(value: string): string {
  const leaf = value.replaceAll("\\", "/").split("/").pop() ?? "";
  const cleaned = leaf.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 120);
  return cleaned || "env-download.bin";
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor((value.length * 3) / 4) - padding;
}

function safeId(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,120}$/.test(value);
}

export default function WebAppScreen() {
  const webViewRef = useRef<WebView>(null);
  const transfersRef = useRef(new Map<string, NativeDownload>());
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hasLoadedPageRef = useRef(false);
  const rendererRecoveryAttemptsRef = useRef(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [loadError, setLoadError] = useState<RecoveryReason | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [sourceUrl, setSourceUrl] = useState(WEB_APP_URL);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePageUrlRef = useRef(WEB_APP_URL);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearLoadTimeout, [clearLoadTimeout, retryKey]);

  const startLoadTimeout = useCallback(() => {
    if (hasLoadedPageRef.current) return;
    clearLoadTimeout();
    loadTimeoutRef.current = setTimeout(() => {
      if (!hasLoadedPageRef.current) setLoadError("connection");
    }, WEBVIEW_LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout]);

  const enqueueFileOperation = useCallback((operation: () => Promise<void>) => {
    const next = writeQueueRef.current.catch(() => undefined).then(operation);
    writeQueueRef.current = next;
    return next;
  }, []);

  const openNativeLink = useCallback((url: string) => {
    if (!/^(mailto:|tel:)/i.test(url)) return false;
    void Linking.openURL(url).catch(() => {
      Alert.alert("Unable to open link", "This link could not be opened on your device.");
    });
    return true;
  }, []);

  const shareLocalFile = useCallback(async (uri: string, name: string, mimeType: string) => {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("File sharing is not available on this device.");
    }
    await Sharing.shareAsync(uri, {
      dialogTitle: `Save or share ${name}`,
      mimeType,
    });
  }, []);

  const handleDirectDownload = useCallback(async (url: string) => {
    try {
      if (!isInternalWebUrl(url)) throw new Error("Only files from the enV website can be downloaded in the app.");
      const directory = FileSystem.cacheDirectory;
      if (!directory) throw new Error("Temporary file storage is unavailable.");
      const name = safeFilename(decodeURIComponent(new URL(url).pathname.split("/").pop() || "env-download.bin"));
      const destination = `${directory}${Date.now()}-${name}`;
      const downloaded = await FileSystem.downloadAsync(url, destination);
      await shareLocalFile(downloaded.uri, name, "application/octet-stream");
    } catch (error) {
      Alert.alert(
        "Download unavailable",
        error instanceof Error ? error.message : "The file could not be downloaded.",
      );
    }
  }, [shareLocalFile]);

  const handleBridgeMessage = useCallback((rawData: string) => {
    if (!isInternalWebUrl(activePageUrlRef.current)) return;
    let message: BridgeMessage;
    try {
      message = JSON.parse(rawData) as BridgeMessage;
    } catch {
      return;
    }

    if (message.type === "env-contact-exchange-start") {
      if (typeof message.profile !== "string" || !Array.isArray(message.fields)) {
        Alert.alert("Exchange unavailable", "The native nearby exchange transport is not available in this build.");
        return;
      }
      void ContactExchangeModule.startExchange(message.profile, message.fields).catch((error: unknown) => {
        Alert.alert("Exchange unavailable", error instanceof Error ? error.message : "Nearby exchange could not start.");
      });
      return;
    }
    if (message.type === "env-contact-exchange-stop") {
      void ContactExchangeModule.stopExchange();
      return;
    }

    if (message.type === "env-download-error") {
      Alert.alert("Download unavailable", message.message || "The generated file could not be prepared.");
      return;
    }

    if (message.type === "env-download-start") {
      const id = typeof message.id === "string" ? message.id : "";
      const expectedBytes = Number(message.size);
      const directory = FileSystem.cacheDirectory;
      if (!safeId(id) || !Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_NATIVE_DOWNLOAD_BYTES) {
        Alert.alert("Download unavailable", "The generated file has invalid or unsupported size information.");
        return;
      }
      if (!directory) {
        Alert.alert("Download unavailable", "Temporary file storage is unavailable.");
        return;
      }
      const name = safeFilename(typeof message.name === "string" ? message.name : "env-download.bin");
      const mimeType = typeof message.mimeType === "string" && message.mimeType.includes("/")
        ? message.mimeType.slice(0, 120)
        : "application/octet-stream";
      const transfer: NativeDownload = {
        id,
        uri: `${directory}${id}-${name}`,
        name,
        mimeType,
        expectedBytes,
        receivedBytes: 0,
        failed: false,
      };
      transfersRef.current.set(id, transfer);
      void enqueueFileOperation(() => FileSystem.writeAsStringAsync(transfer.uri, "", {
        encoding: FileSystem.EncodingType.UTF8,
      })).catch(() => {
        transfer.failed = true;
        Alert.alert("Download unavailable", "The generated file could not be saved to temporary storage.");
      });
      return;
    }

    if (message.type === "env-download-chunk") {
      const id = typeof message.id === "string" ? message.id : "";
      const transfer = transfersRef.current.get(id);
      const base64 = typeof message.base64 === "string" ? message.base64 : "";
      if (!transfer || transfer.failed) return;
      if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
        transfer.failed = true;
        return;
      }
      const chunkBytes = decodedBase64Bytes(base64);
      if (transfer.receivedBytes + chunkBytes > transfer.expectedBytes || transfer.receivedBytes + chunkBytes > MAX_NATIVE_DOWNLOAD_BYTES) {
        transfer.failed = true;
        return;
      }
      transfer.receivedBytes += chunkBytes;
      void enqueueFileOperation(() => FileSystem.writeAsStringAsync(transfer.uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
        append: true,
      })).catch(() => {
        transfer.failed = true;
      });
      return;
    }

    if (message.type === "env-download-complete") {
      const id = typeof message.id === "string" ? message.id : "";
      const transfer = transfersRef.current.get(id);
      if (!transfer) return;
      transfersRef.current.delete(id);
      void enqueueFileOperation(async () => {
        if (transfer.failed) throw new Error("The generated file could not be written completely.");
        if (transfer.receivedBytes !== transfer.expectedBytes) {
          throw new Error("The generated file was incomplete; please retry the download.");
        }
        await shareLocalFile(transfer.uri, transfer.name, transfer.mimeType);
      }).catch((error: unknown) => {
        Alert.alert(
          "Download unavailable",
          error instanceof Error ? error.message : "The generated file could not be shared.",
        );
      });
    }
  }, [enqueueFileOperation, shareLocalFile]);

  useEffect(() => {
    const subscription = ContactExchangeModule.addListener("onContactExchangeEvent", (event: unknown) => {
      if (!isInternalWebUrl(activePageUrlRef.current)) return;
      const payload = JSON.stringify({ type: "env-contact-exchange-event", event });
      webViewRef.current?.injectJavaScript(`window.dispatchEvent(new MessageEvent("message", { data: ${JSON.stringify(payload)} })); true;`);
    });
    return () => subscription.remove();
  }, []);

  const handleShouldStartLoad = useCallback((request: { url: string }) => {
    if (isSafeHttpsWebUrl(request.url)) {
      activePageUrlRef.current = request.url;
      return true;
    }
    openNativeLink(request.url);
    return false;
  }, [openNativeLink]);

  const handleOpenWindow = useCallback((event: { nativeEvent: { targetUrl: string } }) => {
    const targetUrl = event.nativeEvent.targetUrl;
    if (isSafeHttpsWebUrl(targetUrl)) {
      activePageUrlRef.current = targetUrl;
      webViewRef.current?.injectJavaScript(`window.location.assign(${JSON.stringify(targetUrl)}); true;`);
      return;
    }
    openNativeLink(targetUrl);
  }, [openNativeLink]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      webViewRef.current?.goBack();
      return true;
    });
    return () => subscription.remove();
  }, [canGoBack]);

  const retry = useCallback(() => {
    clearLoadTimeout();
    const retryUrl = loadError === "renderer" && isSafeHttpsWebUrl(activePageUrlRef.current)
      ? activePageUrlRef.current
      : WEB_APP_URL;
    hasLoadedPageRef.current = false;
    rendererRecoveryAttemptsRef.current = 0;
    activePageUrlRef.current = retryUrl;
    setSourceUrl(retryUrl);
    setLoadError(null);
    setCanGoBack(false);
    setRetryKey((current) => current + 1);
  }, [clearLoadTimeout, loadError]);

  const handleRendererTermination = useCallback(() => {
    clearLoadTimeout();
    if (rendererRecoveryAttemptsRef.current >= 1) {
      setLoadError("renderer");
      return;
    }
    rendererRecoveryAttemptsRef.current += 1;
    const currentUrl = isSafeHttpsWebUrl(activePageUrlRef.current)
      ? activePageUrlRef.current
      : WEB_APP_URL;
    hasLoadedPageRef.current = false;
    setSourceUrl(currentUrl);
    setLoadError(null);
    setCanGoBack(false);
    setRetryKey((current) => current + 1);
  }, [clearLoadTimeout]);

  if (loadError) {
    return (
      <ConnectionErrorView
        onRetry={retry}
        reason={loadError}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.webViewContainer}>
        <WebView
          key={retryKey}
          ref={webViewRef}
          source={{ uri: sourceUrl }}
          originWhitelist={["https://*"]}
          onShouldStartLoadWithRequest={handleShouldStartLoad}
          onOpenWindow={handleOpenWindow}
          onFileDownload={({ nativeEvent }) => { void handleDirectDownload(nativeEvent.downloadUrl); }}
          onMessage={(event) => handleBridgeMessage(event.nativeEvent.data)}
          onNavigationStateChange={(navigationState) => {
            activePageUrlRef.current = navigationState.url;
            setCanGoBack(navigationState.canGoBack);
          }}
          onLoad={(event) => {
            activePageUrlRef.current = event.nativeEvent.url;
            hasLoadedPageRef.current = true;
            rendererRecoveryAttemptsRef.current = 0;
            clearLoadTimeout();
          }}
          onLoadStart={(event) => {
            activePageUrlRef.current = event.nativeEvent.url;
            if (!hasLoadedPageRef.current) setLoadError(null);
            startLoadTimeout();
          }}
          onLoadEnd={clearLoadTimeout}
          onError={(event) => {
            if (event.nativeEvent.url !== activePageUrlRef.current) return;
            clearLoadTimeout();
            if (!hasLoadedPageRef.current) setLoadError("connection");
          }}
          onHttpError={(event) => {
            const { url, statusCode } = event.nativeEvent;
            if (url !== activePageUrlRef.current || statusCode < 400) return;
            clearLoadTimeout();
            if (!hasLoadedPageRef.current) setLoadError("connection");
          }}
          onRenderProcessGone={handleRendererTermination}
          onContentProcessDidTerminate={handleRendererTermination}
          injectedJavaScriptBeforeContentLoaded={BLOB_DOWNLOAD_BRIDGE_SCRIPT}
          injectedJavaScript={BLOB_DOWNLOAD_BRIDGE_SCRIPT}
          javaScriptEnabled
          domStorageEnabled
          cacheEnabled
          mixedContentMode="never"
          javaScriptCanOpenWindowsAutomatically={false}
          allowsBackForwardNavigationGestures={Platform.OS === "ios"}
          pullToRefreshEnabled
          setSupportMultipleWindows
          style={styles.webView}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F7F7F4" },
  webViewContainer: { flex: 1, backgroundColor: "#F7F7F4" },
  webView: { flex: 1, backgroundColor: "#F7F7F4" },
});
