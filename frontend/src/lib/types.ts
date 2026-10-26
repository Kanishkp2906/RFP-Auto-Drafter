export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: Date;
  sources?: RFPSource[];
  error?: boolean;
}

export interface RFPSource {
  sections: string[];
  chunk_index: number;
  similarity: number;
  document_id: string;
  filename: string;
}

export interface Session {
  id: string;
  user_id: string;
  title: string | null;
  pinned: boolean;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  role: "user" | "admin";
  created_at: string | null;
}

export type UploadStatus = "queued" | "processing" | "failed" | "done";

export interface DocumentResponse {
  id: string;
  user_id: string;
  filename: string;
  saved_filename: string;
  upload_status: UploadStatus;
  created_at: string;
  storage_path: string;
}

export interface UploadResponse {
  queued: DocumentResponse[];
  already_exists: DocumentResponse[];
  failed: { reason: string; filename: string }[];
}

export interface ChatResponse {
  answer: string;
  sources: RFPSource[];
}
