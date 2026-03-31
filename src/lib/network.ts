import { apiUrl } from "@/lib/api";

const normalizeBaseUrl = (value?: string) => value?.trim().replace(/\/$/, "") || "";

const rawWsUrl = normalizeBaseUrl(import.meta.env.VITE_CHAT_WS_URL as string | undefined);
const rawApiBaseUrl = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL as string | undefined);

export const resolveWsUrl = () => {
  if (rawWsUrl) {
    return rawWsUrl;
  }

  if (rawApiBaseUrl) {
    const wsBaseUrl = rawApiBaseUrl.replace(/^http/i, "ws");
    return `${wsBaseUrl}/ws`;
  }

  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${wsProtocol}://${window.location.host}/ws`;
};

export const apiRequest = async (
  path: string,
  init?: RequestInit,
  timeoutMs = 10000,
  retries = 1,
): Promise<Response> => {
  const targetUrl = apiUrl(path);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(targetUrl, {
        ...init,
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);
      return response;
    } catch (error) {
      window.clearTimeout(timeoutId);
      lastError = error;

      if (attempt === retries) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Network request failed");
};