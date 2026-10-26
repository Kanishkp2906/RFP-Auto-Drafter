import { supabase } from "./supabase";
import type { ChatResponse, Session, UploadResponse, UserProfile, DocumentResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) return null;
  const expiresAt = data.session.expires_at ?? undefined;
  if (typeof expiresAt === "number" && expiresAt * 1000 <= Date.now() + 5000) {
    // Token is expired or about to be; mint a new one. The SSE POST must not
    // be replayed on a 401 (the agent run is not idempotent), so refresh up
    // front instead.
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? data.session.access_token;
  }
  return data.session.access_token;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  retry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, signal, retry = true } = options;

  let token = await getAccessToken();
  if (!token) {
    throw new ApiError(401, "Not signed in.");
  }

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, "Network error. Check your connection and try again.");
  }

  if (response.status === 401 && retry) {
    const { error } = await supabase.auth.refreshSession();
    if (!error) {
      const newToken = await getAccessToken();
      if (newToken && newToken !== token) {
        return request<T>(path, { ...options, retry: false });
      }
    }
    await supabase.auth.signOut();
    throw new ApiError(401, "Your session has expired. Please sign in again.");
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status}).`;
    try {
      const data = await response.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      // keep default message
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

const DOC_STORAGE_BUCKET = "rfp_document";

export const api = {
  getProfile: () => request<UserProfile>("/v1/users/profile"),

  updateUsername: (newUsername: string) =>
    request<UserProfile>(
      `/v1/users/update-username?new_username=${encodeURIComponent(newUsername)}`,
      { method: "PATCH" }
    ),

  deleteProfile: () =>
    request<UserProfile>("/v1/users/profile-delete", { method: "DELETE" }),

  getDocumentDownloadUrl: async (storagePath: string): Promise<string> => {
    const { data, error } = await supabase.storage
      .from(DOC_STORAGE_BUCKET)
      .createSignedUrl(storagePath, 60);
    if (error || !data?.signedUrl) {
      throw new ApiError(
        error?.status || 500,
        error?.message || "Could not create a download link."
      );
    }
    return data.signedUrl;
  },

  getSessions: () => request<Session[]>("/v1/sessions/my-sessions"),

  createSession: () =>
    request<Session>("/v1/sessions/new-chat", { method: "POST" }),

  deleteSession: (sessionId: string) =>
    request<Session>(`/v1/sessions/${sessionId}/delete`, { method: "DELETE" }),

  renameSession: (sessionId: string, newTitle: string) =>
    request<Session>(
      `/v1/sessions/${sessionId}/rename?new_title=${encodeURIComponent(newTitle)}`,
      { method: "PATCH" }
    ),

  pinSession: (sessionId: string, pinned: boolean) =>
    request<Session>(
      `/v1/sessions/${sessionId}/pin?pinned=${pinned}`,
      { method: "PATCH" }
    ),

  getMessages: (sessionId: string, limit = 50, offset = 0, signal?: AbortSignal) =>
    request<{ session_id: string; messages: { id: string; role: "user" | "assistant"; content: string; created_at: string }[]; limit: number; offset: number }>(
      `/v1/sessions/${sessionId}/messages?limit=${limit}&offset=${offset}`,
      { signal }
    ),

  getUserFiles: () => request<DocumentResponse[]>("/v1/documents/user_files"),

  deleteFile: (fileId: string) =>
    request<DocumentResponse>(`/v1/documents/delete?file_id=${fileId}`, {
      method: "DELETE",
    }),

  uploadFiles: (files: File[]) => {
    const formData = new FormData();
    for (const file of files) formData.append("documents", file);
    return request<UploadResponse>("/v1/documents/uploads", {
      method: "POST",
      formData,
    });
  },

  streamChat: async (params: {
    sessionId: string;
    query: string;
    documentIds: string[];
    signal?: AbortSignal;
  }): Promise<ChatResponse | null> => {
    const token = await getFreshAccessToken();
    if (!token) throw new ApiError(401, "Not signed in.");

    const response = await fetch(`${API_BASE_URL}/v1/rag/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        user_query: params.query,
        document_ids: params.documentIds,
      }),
      signal: params.signal,
    });

    if (!response.ok) {
      let detail = `Request failed (${response.status}).`;
      try {
        const data = await response.json();
        if (typeof data?.detail === "string") detail = data.detail;
      } catch {
        // keep default message
      }
      throw new ApiError(response.status, detail);
    }

    if (!response.body) throw new ApiError(500, "No response stream from server.");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastAnswer: ChatResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const parsed = JSON.parse(payload);
            if (typeof parsed === "string") {
              const inner = JSON.parse(parsed) as ChatResponse & {
                error?: string;
              };
              if (inner && typeof inner === "object" && inner.error)
                throw new ApiError(502, inner.error);
              lastAnswer = inner;
            } else if (parsed && typeof parsed === "object") {
              const asObj = parsed as ChatResponse & { error?: string };
              if (asObj.error) throw new ApiError(502, asObj.error);
              lastAnswer = asObj;
            }
          } catch (error) {
            if (error instanceof ApiError) throw error;
            // ignore malformed events
          }
        }
      }
    }

    return lastAnswer;
  },
};
