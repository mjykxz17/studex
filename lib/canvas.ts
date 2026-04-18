const DEFAULT_CANVAS_BASE_URL = "https://canvas.nus.edu.sg";
const DEFAULT_PER_PAGE = 100;
const MAX_RETRIES = 4;
const REQUEST_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_DOWNLOAD_STATUS_CODES = new Set([401, 403, 404, 408, 429, 500, 502, 503, 504]);

export interface CanvasCourse {
  id: number;
  name: string;
  course_code?: string | null;
  original_name?: string | null;
  workflow_state?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  default_view?: string | null;
  enrollment_term_id?: number | null;
  public_description?: string | null;
}

export interface CanvasFile {
  id: number;
  uuid?: string | null;
  folder_id?: number | null;
  display_name: string;
  filename?: string | null;
  content_type?: string | null;
  url?: string | null;
  size?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  unlock_at?: string | null;
  locked?: boolean;
  hidden?: boolean;
  thumbnail_url?: string | null;
  modified_at?: string | null;
  mime_class?: string | null;
  media_entry_id?: string | null;
  locked_for_user?: boolean;
}

export interface CanvasAnnouncement {
  id: number;
  title: string;
  message?: string | null;
  html_url?: string | null;
  posted_at?: string | null;
  delayed_post_at?: string | null;
  last_reply_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  discussion_type?: string | null;
  published?: boolean;
  read_state?: string | null;
  unread_count?: number;
  require_initial_post?: boolean;
  user_can_see_posts?: boolean;
}

export interface CanvasAssignment {
  id: number;
  name: string;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  html_url?: string | null;
  points_possible?: number | null;
  submission_types?: string[];
  has_submitted_submissions?: boolean;
  workflow_state?: string | null;
  published?: boolean;
}

export interface CanvasSubmission {
  id: number;
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  workflow_state?: string | null;
  missing?: boolean;
  late?: boolean;
  excused?: boolean;
  points_deducted?: number | null;
}

export interface CanvasAssignmentWithSubmission extends CanvasAssignment {
  submission?: CanvasSubmission | null;
}

export interface CanvasFileDetails extends CanvasFile {
  url: string;
}

interface CanvasRequestOptions {
  query?: Record<string, string | number | boolean | null | undefined>;
  allowNotFound?: boolean;
}

interface JsonResponse<T> {
  data: T;
  headers: Headers;
  status: number;
}

type RequestResponseOptions = CanvasRequestOptions & {
  auth?: boolean;
  accept?: string;
  timeoutMs?: number;
  retryableStatusCodes?: Set<number>;
};

export interface CanvasDownloadResult {
  downloadUrl: string;
  response: Response;
}

function getCanvasBaseUrl(): string {
  const baseUrl = process.env.CANVAS_BASE_URL?.trim() || DEFAULT_CANVAS_BASE_URL;
  return baseUrl.replace(/\/+$/, "");
}

function getCanvasToken(): string {
  const token = process.env.CANVAS_TOKEN?.trim();

  if (!token) {
    throw new Error("Missing CANVAS_TOKEN environment variable.");
  }

  return token;
}

function buildApiUrl(path: string, query?: CanvasRequestOptions["query"]): URL {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`/api/v1${normalizedPath}`, getCanvasBaseUrl());

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) {
        continue;
      }

      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  const parts = linkHeader.split(",");

  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2] === "next") {
      return match[1];
    }
  }

  return null;
}

function getRetryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get("Retry-After");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }

    const retryDate = Date.parse(retryAfter);
    if (!Number.isNaN(retryDate)) {
      return Math.max(0, retryDate - Date.now());
    }
  }

  return Math.min(1000 * 2 ** attempt, 10_000);
}

function isRetryableError(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && error.name === "AbortError");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestResponse(url: URL | string, options: RequestResponseOptions = {}): Promise<Response | null> {
  const token = options.auth === false ? null : getCanvasToken();
  const retryableStatusCodes = options.retryableStatusCodes ?? RETRYABLE_STATUS_CODES;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response: Response | null = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: options.accept ?? "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "User-Agent": "Studex/0.1",
        },
        cache: "no-store",
        redirect: "follow",
        signal: controller.signal,
      });

      if (options.allowNotFound && response.status === 404) {
        return null;
      }

      if (!response.ok) {
        if (attempt < MAX_RETRIES && retryableStatusCodes.has(response.status)) {
          await sleep(getRetryDelayMs(response, attempt));
          continue;
        }

        const errorText = await response.text();
        throw new Error(
          `Canvas request failed (${response.status} ${response.statusText}) for ${response.url}: ${errorText || "No response body"}`,
        );
      }

      return response;
    } catch (error) {
      if (attempt < MAX_RETRIES && isRetryableError(error)) {
        await sleep(getRetryDelayMs(response, attempt));
        continue;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Canvas request exhausted retries for ${String(url)}`);
}

async function requestJson<T>(url: URL | string, options: CanvasRequestOptions = {}): Promise<JsonResponse<T | null>> {
  const response = await requestResponse(url, options);

  if (!response) {
    return { data: null, headers: new Headers(), status: 404 };
  }

  const data = (await response.json()) as T;
  return { data, headers: response.headers, status: response.status };
}

async function paginate<T>(path: string, query?: CanvasRequestOptions["query"]): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = buildApiUrl(path, {
    per_page: DEFAULT_PER_PAGE,
    ...query,
  }).toString();

  while (nextUrl) {
    const response = await requestJson<T[]>(nextUrl);
    if (response.data) {
      items.push(...response.data);
    }

    nextUrl = parseNextLink(response.headers.get("Link"));
  }

  return items;
}

export async function getCourses(): Promise<CanvasCourse[]> {
  return paginate<CanvasCourse>("/courses", {
    enrollment_state: "active",
    include: "term",
  });
}

export async function getFiles(courseId: number | string): Promise<CanvasFile[]> {
  return paginate<CanvasFile>(`/courses/${courseId}/files`, {
    sort: "updated_at",
    order: "desc",
  });
}

export async function getAnnouncements(courseId: number | string): Promise<CanvasAnnouncement[]> {
  return paginate<CanvasAnnouncement>(`/courses/${courseId}/discussion_topics`, {
    only_announcements: true,
  });
}

export async function getAssignments(courseId: number | string): Promise<CanvasAssignment[]> {
  return paginate<CanvasAssignment>(`/courses/${courseId}/assignments`, {
    order_by: "due_at",
  });
}

export async function getAssignmentsWithSubmissions(
  courseId: number | string,
): Promise<CanvasAssignmentWithSubmission[]> {
  return paginate<CanvasAssignmentWithSubmission>(`/courses/${courseId}/assignments`, {
    order_by: "due_at",
    "include[]": "submission",
  });
}

export async function getFileDownloadUrl(fileId: number | string): Promise<string | null> {
  const response = await requestJson<CanvasFileDetails>(buildApiUrl(`/files/${fileId}`), {
    allowNotFound: true,
  });

  return response.data?.url ?? null;
}

export async function downloadCanvasFile(fileId: number | string): Promise<CanvasDownloadResult | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const downloadUrl = await getFileDownloadUrl(fileId);

    if (!downloadUrl) {
      return null;
    }

    try {
      const response = await requestResponse(downloadUrl, {
        auth: false,
        accept: "*/*",
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        retryableStatusCodes: RETRYABLE_DOWNLOAD_STATUS_CODES,
      });

      if (!response) {
        return null;
      }

      return {
        downloadUrl,
        response,
      };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        throw error;
      }

      await sleep(Math.min(1000 * 2 ** attempt, 5000));
    }
  }

  return null;
}

export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  updated_at?: string | null;
  published?: boolean;
  front_page?: boolean;
}

export interface CanvasPageWithBody extends CanvasPage {
  body?: string | null;
}

export async function getPages(courseId: number | string): Promise<CanvasPage[]> {
  return paginate<CanvasPage>(`/courses/${courseId}/pages`, {
    sort: "updated_at",
    order: "desc",
    published: "true",
  });
}

export async function getPage(
  courseId: number | string,
  pageUrl: string,
): Promise<CanvasPageWithBody | null> {
  const response = await requestJson<CanvasPageWithBody>(
    buildApiUrl(`/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`),
    { allowNotFound: true },
  );
  return response.data ?? null;
}

export type CanvasModuleItemType =
  | "File"
  | "Page"
  | "Assignment"
  | "Quiz"
  | "Discussion"
  | "ExternalUrl"
  | "ExternalTool"
  | "SubHeader";

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: CanvasModuleItemType | string;
  position: number;
  indent: number;
  content_id?: number | null;
  page_url?: string | null;
  external_url?: string | null;
  completion_requirement?: {
    type?: string;
    completed?: boolean;
  } | null;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at?: string | null;
  state?: string | null;
  items_count?: number;
  items?: CanvasModuleItem[];
}

export async function getModules(courseId: number | string): Promise<CanvasModule[]> {
  const baseUrl = buildApiUrl(`/courses/${courseId}/modules`, {
    per_page: DEFAULT_PER_PAGE,
  });
  baseUrl.searchParams.append("include[]", "items");
  baseUrl.searchParams.append("include[]", "content_details");

  const items: CanvasModule[] = [];
  let nextUrl: string | null = baseUrl.toString();
  while (nextUrl) {
    const response = await requestJson<CanvasModule[]>(nextUrl);
    if (response.data) items.push(...response.data);
    nextUrl = parseNextLink(response.headers.get("Link"));
  }
  return items;
}

export async function getModuleItems(
  courseId: number | string,
  moduleId: number | string,
): Promise<CanvasModuleItem[]> {
  const baseUrl = buildApiUrl(`/courses/${courseId}/modules/${moduleId}/items`, {
    per_page: DEFAULT_PER_PAGE,
  });
  baseUrl.searchParams.append("include[]", "content_details");

  const items: CanvasModuleItem[] = [];
  let nextUrl: string | null = baseUrl.toString();
  while (nextUrl) {
    const response = await requestJson<CanvasModuleItem[]>(nextUrl);
    if (response.data) items.push(...response.data);
    nextUrl = parseNextLink(response.headers.get("Link"));
  }
  return items;
}
