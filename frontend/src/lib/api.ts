import type {
  Analytics,
  AuditEvent,
  AuthResponse,
  Candidate,
  CandidateDetail,
  FilterOptions,
  HealthStatus,
  Job,
  JobWeights,
  Match,
  MatchDetail,
  Note,
  PipelineStage,
  Upload,
  User,
  WeightPreviewRow,
} from '@/types'

const TOKEN_KEY = 'talentrank.token'
const ANON_KEY = 'talentrank.anonymized'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

/* -------------------------------------------------------------------------- */
/* Token + anonymised-review state (localStorage, wrapped for private mode)    */
/* -------------------------------------------------------------------------- */
export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* private browsing — session still works in memory for this page load */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

export const anonymizedStore = {
  get(): boolean {
    try {
      return localStorage.getItem(ANON_KEY) === '1'
    } catch {
      return false
    }
  },
  set(value: boolean) {
    try {
      localStorage.setItem(ANON_KEY, value ? '1' : '0')
    } catch {
      /* ignore */
    }
  },
}

/* -------------------------------------------------------------------------- */
/* Core request helper                                                        */
/* -------------------------------------------------------------------------- */
type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
  raw?: boolean
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, headers, ...rest } = options
  const token = tokenStore.get()

  const finalHeaders = new Headers(headers)
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`)
  // Bias-reduced review is enforced server-side; this header requests it.
  if (anonymizedStore.get()) finalHeaders.set('X-Anonymized-Review', '1')

  let payload: BodyInit | undefined
  if (body instanceof FormData) {
    payload = body
  } else if (body !== undefined) {
    finalHeaders.set('Content-Type', 'application/json')
    payload = JSON.stringify(body)
  }

  const response = await fetch(`/api${path}`, { ...rest, headers: finalHeaders, body: payload })

  if (response.status === 401) {
    tokenStore.clear()
    // Let the app shell react rather than hard-navigating mid-render.
    window.dispatchEvent(new CustomEvent('talentrank:unauthorized'))
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    let detail: unknown
    try {
      detail = await response.json()
      const d = (detail as { detail?: unknown })?.detail
      if (typeof d === 'string') message = d
      else if (Array.isArray(d) && d.length) {
        // FastAPI validation errors
        message = d
          .map((e: { loc?: string[]; msg?: string }) =>
            `${e.loc?.slice(1).join('.') ?? 'field'}: ${e.msg ?? 'invalid'}`,
          )
          .join('; ')
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, response.status, detail)
  }

  if (raw) return response as unknown as T
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const qs = (params: Record<string, unknown>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

/* -------------------------------------------------------------------------- */
/* Endpoints                                                                  */
/* -------------------------------------------------------------------------- */
export const api = {
  health: () => request<HealthStatus>('/health'),

  auth: {
    login: (email: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } }),
    register: (payload: {
      email: string
      password: string
      full_name: string
      role: 'recruiter' | 'candidate'
    }) => request<AuthResponse>('/auth/register', { method: 'POST', body: payload }),
    me: () => request<User>('/auth/me'),
  },

  jobs: {
    list: (params: { status_filter?: string; search?: string } = {}) =>
      request<Job[]>(`/jobs${qs(params)}`),
    get: (id: number) => request<Job>(`/jobs/${id}`),
    create: (payload: Partial<Job> & { weights?: JobWeights }) =>
      request<Job>('/jobs', { method: 'POST', body: payload }),
    update: (id: number, payload: Partial<Job> & { weights?: JobWeights }) =>
      request<Job>(`/jobs/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),
    rescore: (id: number) => request<Job>(`/jobs/${id}/rescore`, { method: 'POST' }),
  },

  candidates: {
    list: (
      params: {
        search?: string
        skills?: string
        min_experience?: number
        max_experience?: number
        education?: string
        location?: string
        limit?: number
        offset?: number
      } = {},
    ) => request<Candidate[]>(`/candidates${qs(params)}`),
    filters: () => request<FilterOptions>('/candidates/filters'),
    get: (id: number) => request<CandidateDetail>(`/candidates/${id}`),
    me: () => request<CandidateDetail>('/candidates/me'),
    update: (id: number, payload: Record<string, unknown>) =>
      request<CandidateDetail>(`/candidates/${id}`, { method: 'PATCH', body: payload }),
    remove: (id: number) => request<void>(`/candidates/${id}`, { method: 'DELETE' }),
    duplicates: (id: number) => request<Candidate[]>(`/candidates/${id}/duplicates`),
  },

  uploads: {
    list: (limit = 50) => request<Upload[]>(`/uploads${qs({ limit })}`),
    create: (files: File[]) => {
      const form = new FormData()
      files.forEach((file) => form.append('files', file))
      return request<Upload[]>('/uploads', { method: 'POST', body: form })
    },
    retry: (id: number) => request<Upload>(`/uploads/${id}/retry`, { method: 'POST' }),
    fileUrl: (id: number) => `/api/uploads/${id}/file`,
  },

  matches: {
    list: (
      jobId: number,
      params: { stage?: PipelineStage; min_score?: number; search?: string; limit?: number } = {},
    ) => request<Match[]>(`/jobs/${jobId}/matches${qs(params)}`),
    get: (matchId: number) => request<MatchDetail>(`/matches/${matchId}`),
    setStage: (matchId: number, stage: PipelineStage) =>
      request<Match>(`/matches/${matchId}/stage`, { method: 'PATCH', body: { stage } }),
    previewWeights: (jobId: number, weights: JobWeights) =>
      request<WeightPreviewRow[]>(`/jobs/${jobId}/preview-weights`, {
        method: 'POST',
        body: { weights },
      }),
    compare: (jobId: number, matchIds: number[]) =>
      request<MatchDetail[]>(`/jobs/${jobId}/compare${qs({ ids: matchIds.join(',') })}`),
    notes: {
      list: (matchId: number) => request<Note[]>(`/matches/${matchId}/notes`),
      add: (matchId: number, body: string, rating?: number) =>
        request<Note>(`/matches/${matchId}/notes`, { method: 'POST', body: { body, rating } }),
      remove: (noteId: number) => request<void>(`/notes/${noteId}`, { method: 'DELETE' }),
    },
    exportUrl: (jobId: number, stage?: PipelineStage) =>
      `/api/jobs/${jobId}/export.csv${qs({ stage, anonymized: anonymizedStore.get() ? 1 : undefined })}`,
  },

  analytics: {
    get: (jobId?: number) => request<Analytics>(`/analytics${qs({ job_id: jobId })}`),
    audit: (limit = 100) => request<AuditEvent[]>(`/audit${qs({ limit })}`),
  },
}

/**
 * Download a file through fetch so the Authorization header is sent.
 * A plain <a download> cannot carry the bearer token.
 */
export async function downloadFile(url: string, filename: string) {
  const token = tokenStore.get()
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(url, { headers })
  if (!response.ok) throw new ApiError('Download failed', response.status)

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
