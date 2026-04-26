/**
 * GitHub REST API client for Mentis Mobile standalone mode.
 * Uses a Personal Access Token (PAT) — no OAuth backend required.
 * All operations go directly from the phone to api.github.com.
 */

export interface GithubFile {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  sha:  string
}

export interface GithubRepo {
  full_name:    string
  description:  string | null
  default_branch: string
  private:      boolean
}

const BASE = 'https://api.github.com'

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

async function ghFetch(token: string, path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers(token), ...(opts.headers as object ?? {}) } })
  if (!r.ok) {
    const body = await r.text().catch(() => '')
    throw new Error(`GitHub ${r.status}: ${body.slice(0, 200)}`)
  }
  return r.json()
}

// ── Repos ────────────────────────────────────────────────────────────────────

export async function listRepos(token: string): Promise<GithubRepo[]> {
  const data = await ghFetch(token, '/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator')
  return data.map((r: GithubRepo) => ({
    full_name:      r.full_name,
    description:    r.description,
    default_branch: r.default_branch,
    private:        r.private,
  }))
}

export async function listBranches(token: string, repo: string): Promise<string[]> {
  const data = await ghFetch(token, `/repos/${repo}/branches?per_page=50`)
  return data.map((b: { name: string }) => b.name)
}

// ── Files ────────────────────────────────────────────────────────────────────

export async function listFiles(token: string, repo: string, path: string, branch: string): Promise<GithubFile[]> {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : ''
  const data = await ghFetch(token, `/repos/${repo}/contents/${path}${ref}`)
  if (!Array.isArray(data)) throw new Error('Not a directory')
  return data.map((f: GithubFile) => ({ name: f.name, path: f.path, type: f.type, size: f.size, sha: f.sha }))
}

export async function readFile(token: string, repo: string, path: string, branch: string): Promise<string> {
  const ref = branch ? `?ref=${encodeURIComponent(branch)}` : ''
  const data = await ghFetch(token, `/repos/${repo}/contents/${path}${ref}`)
  if (!data.content) throw new Error('No content in response')
  // GitHub returns base64-encoded content
  return atob(data.content.replace(/\n/g, ''))
}

export async function writeFile(
  token:   string,
  repo:    string,
  path:    string,
  content: string,
  message: string,
  branch:  string,
  sha?:    string,  // required when updating existing file
): Promise<{ sha: string; html_url: string }> {
  const body: Record<string, string> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),  // utf-8 safe base64
    branch,
  }
  if (sha) body.sha = sha

  const data = await ghFetch(token, `/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  return { sha: data.content.sha, html_url: data.content.html_url }
}

export async function getFileSha(token: string, repo: string, path: string, branch: string): Promise<string | null> {
  try {
    const ref = branch ? `?ref=${encodeURIComponent(branch)}` : ''
    const data = await ghFetch(token, `/repos/${repo}/contents/${path}${ref}`)
    return data.sha ?? null
  } catch { return null }
}

// ── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  path: string
  repo: string
  url:  string
}

export async function searchCode(token: string, repo: string, query: string): Promise<SearchResult[]> {
  const q = encodeURIComponent(`${query} repo:${repo}`)
  const data = await ghFetch(token, `/search/code?q=${q}&per_page=10`)
  return (data.items || []).map((i: { path: string; repository: { full_name: string }; html_url: string }) => ({
    path: i.path,
    repo: i.repository.full_name,
    url:  i.html_url,
  }))
}

// ── Verify PAT ───────────────────────────────────────────────────────────────

export async function verifyToken(token: string): Promise<{ login: string; name: string } | null> {
  try {
    const data = await ghFetch(token, '/user')
    return { login: data.login, name: data.name ?? data.login }
  } catch { return null }
}
