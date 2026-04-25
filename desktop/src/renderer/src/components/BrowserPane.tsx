import { useEffect, useRef, useState } from 'react'
import { WebviewElement } from '../types'

const HOME = 'https://www.google.com'

interface Props { active: boolean }

export default function BrowserPane({ active }: Props) {
  const webviewRef       = useRef<HTMLElement>(null)
  const [inputUrl, setInputUrl] = useState(HOME)
  const [loading, setLoading]   = useState(false)
  const [canBack, setCanBack]   = useState(false)
  const [canFwd, setCanFwd]     = useState(false)

  const wv = () => webviewRef.current as unknown as WebviewElement | null

  // Attach webview event listeners once mounted
  useEffect(() => {
    const el = wv()
    if (!el) return

    const onDidNav = () => {
      const w = wv(); if (!w) return
      setInputUrl(w.getURL())
      setCanBack(w.canGoBack())
      setCanFwd(w.canGoForward())
      setLoading(false)
    }
    const onLoadStart = () => setLoading(true)
    const onLoadStop  = () => setLoading(false)
    const onLoadFail  = () => setLoading(false)

    el.addEventListener('did-navigate',         onDidNav)
    el.addEventListener('did-navigate-in-page', onDidNav)
    el.addEventListener('did-start-loading',    onLoadStart)
    el.addEventListener('did-stop-loading',     onLoadStop)
    el.addEventListener('did-fail-load',        onLoadFail)

    return () => {
      el.removeEventListener('did-navigate',         onDidNav)
      el.removeEventListener('did-navigate-in-page', onDidNav)
      el.removeEventListener('did-start-loading',    onLoadStart)
      el.removeEventListener('did-stop-loading',     onLoadStop)
      el.removeEventListener('did-fail-load',        onLoadFail)
    }
  }, [])

  const navigate = (raw: string) => {
    let url = raw.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) {
      // looks like a domain
      url = /^[\w-]+\.[\w.-]+/.test(url)
        ? 'https://' + url
        : `https://www.google.com/search?q=${encodeURIComponent(url)}`
    }
    setInputUrl(url)
    wv()?.loadURL(url)
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(inputUrl)
  }

  return (
    <div style={{ display: active ? 'flex' : 'none', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Address bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-[#0f0f0f] shrink-0">
        <NavBtn onClick={() => wv()?.goBack()}    disabled={!canBack} title="Back">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </NavBtn>
        <NavBtn onClick={() => wv()?.goForward()} disabled={!canFwd} title="Forward">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </NavBtn>
        <NavBtn onClick={() => loading ? wv()?.stop() : wv()?.reload()} title={loading ? 'Stop' : 'Reload'}>
          {loading
            ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          }
        </NavBtn>

        {/* Loading indicator */}
        {loading && <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse shrink-0" />}

        <input
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={handleKey}
          onFocus={e => e.target.select()}
          spellCheck={false}
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-1 text-[12px] text-[#e8e8e8] focus:outline-none focus:border-accent/40 font-mono"
          placeholder="Enter URL or search…"
        />

        <NavBtn onClick={() => navigate(HOME)} title="Home">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </NavBtn>
      </div>

      {/* Webview */}
      <webview
        ref={webviewRef as React.RefObject<HTMLElement>}
        src={HOME}
        style={{ flex: 1, minHeight: 0, width: '100%' }}
        allowpopups
      />
    </div>
  )
}

function NavBtn({ onClick, disabled, title, children }: {
  onClick:   () => void
  disabled?: boolean
  title:     string
  children:  React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded text-muted hover:text-[#ccc] hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      {children}
    </button>
  )
}
