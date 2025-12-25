// API URL - local dev or production
const API_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : "https://api.append.tindev.dev";

export interface ApiError {
  code: string;
  message: string;
}

export interface ApiErrorResponse {
  error: ApiError;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!response.ok) {
    if (isJson) {
      const errorBody = (await response.json()) as ApiErrorResponse;
      throw new ApiRequestError(
        response.status,
        errorBody.error.code,
        errorBody.error.message
      );
    }
    throw new ApiRequestError(response.status, "UNKNOWN_ERROR", response.statusText);
  }

  if (isJson) {
    return response.json() as Promise<T>;
  }

  return undefined as T;
}

export interface CreateBatchRequest {
  terms: string;
  clientRequestId: string;
}

export interface CreateBatchResponse {
  id: string;
  candidateCount: number;
}

/** Allowed bucket slugs */
export type Bucket =
  | "foundations"
  | "backend"
  | "frontend"
  | "dx-tooling"
  | "deep-concepts";

/** Suggestion generation status */
export type SuggestionStatus = "in_progress" | "done" | "error";

export interface Candidate {
  id: string;
  position: number;
  term: string;
  normalizedTerm: string;
  status: string;
  // Step 4 fields
  chosenBucket: Bucket | null;
  chosenText: string | null;
  suggestedBucket: Bucket | null;
  suggestedText: string | null;
  suggestionStatus: SuggestionStatus | null;
  suggestionError: string | null;
  suggestionAttempts: number;
  version: number;
  materializedTermId: string | null;
  materializedTermSenseId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface BatchResponse {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  candidateCount: number;
  candidates: Candidate[];
}

export async function createBatch(
  request: CreateBatchRequest
): Promise<CreateBatchResponse> {
  const response = await fetch(`${API_URL}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  return handleResponse<CreateBatchResponse>(response);
}

export async function getBatch(id: string): Promise<BatchResponse> {
  const response = await fetch(`${API_URL}/api/batch/${id}`, {
    method: "GET",
    credentials: "include",
  });

  return handleResponse<BatchResponse>(response);
}

export interface UpdateCandidateRequest {
  expectedVersion: number;
  chosenBucket?: Bucket | null;
  chosenText?: string | null;
}

export interface UpdateCandidateResponse {
  candidate: Candidate;
}

export interface VersionConflictDetails {
  currentVersion: number;
}

export async function updateCandidate(
  id: string,
  request: UpdateCandidateRequest
): Promise<UpdateCandidateResponse> {
  const response = await fetch(`${API_URL}/api/candidate/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(request),
  });

  return handleResponse<UpdateCandidateResponse>(response);
}
