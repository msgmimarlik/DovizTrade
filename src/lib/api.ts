const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();

const normalizedApiBaseUrl = rawApiBaseUrl
  ? rawApiBaseUrl.replace(/\/$/, "")
  : "";

export const apiUrl = (path: string) => {
  if (!path.startsWith("/")) {
    return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}/${path}` : `/${path}`;
  }

  return normalizedApiBaseUrl ? `${normalizedApiBaseUrl}${path}` : path;
};