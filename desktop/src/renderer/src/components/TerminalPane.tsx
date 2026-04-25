import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props { active: boolean }

export default function TerminalPane({ active }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const termRef       = useRef<Terminal | null>(null)
  const fitRef        = useRef<FitAddon | null>(null)
  const termIdRef     = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const cleanupFns    = useRef<Array<() => void>>([])

  // Unmount cleanup only — runs once when component leaves the DOM
  useEffect(() => {
    return () => {
      cleanupFns.current.forEach(fn => fn())
      if (termIdRef.current) window.mentis.terminalKill(termIdRef.current)
      termRef.current?.dispose()
      termRef.current = null
      initializedRef.current = false
    }
  }, [])

  // Initialize on first activation
  useEffect(() => {
    if (!active || initializedRef.current || !containerRef.current) return
    initializedRef.current = true

    const term = new Terminal({
      theme: {
        background:          '#0d0d0d',
        foreground:          '#e8e8e8',
        cursor:              '#7c3aed',
        cursorAccent:        '#0d0d0d',
        selectionBackground: '#7c3aed55',
        black:   '#1a1a1a', brightBlack:   '#555',
        red:     '#f38ba8', brightRed:     '#f38ba8',
        green:   '#a6e3a1', brightGreen:   '#a6e3a1',
        yellow:  '#f9e2af', brightYellow:  '#f9e2af',
        blue:    '#89b4fa', brightBlue:    '#89b4fa',
        magenta: '#cba6f7', brightMagenta: '#cba6f7',
        cyan:    '#89dceb', brightCyan:    '#89dceb',
        white:   '#cdd6f4', brightWhite:   '#ffffff',
      },
      fontFamily:   '"JetBrains Mono", "Fira Code", monospace',
      fontSize:     13,
      lineHeight:   1.4,
      cursorBlink:  true,
      cursorStyle:  'block',
      scrollback:   5000,
      allowTransparency: true,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    requestAnimationFrame(() => fit.fit())

    termRef.current = term
    fitRef.current  = fit

    // Spawn shell via node-pty IPC
    window.mentis.terminalCreate(term.cols, term.rows).then(result => {
      if (!result.ok || !result.id) {
        term.write('\x1b[31;1mTerminal unavailable\x1b[0m\r\n')
        term.write('\x1b[2m' + (result.error || 'node-pty not loaded') + '\x1b[0m\r\n')
        return
      }

      termIdRef.current = result.id

      // User keystrokes → PTY
      term.onData(data => {
        if (termIdRef.current) window.mentis.terminalWrite(termIdRef.current, data)
      })

      // PTY output → terminal
      const offOutput = window.mentis.on('terminal:output', (raw: unknown) => {
        const { id, data } = raw as { id: string; data: string }
        if (id === termIdRef.current) term.write(data)
      })

      const offExit = window.mentis.on('terminal:exit', (raw: unknown) => {
        const { id } = raw as { id: string }
        if (id === termIdRef.current) {
          term.write('\r\n\x1b[2m[process exited]\x1b[0m\r\n')
          termIdRef.current = null
        }
      })

      cleanupFns.current.push(offOutput, offExit)
    })

    // Auto-resize when container changes size
    const ro = new ResizeObserver(() => {
      fit.fit()
      const id = termIdRef.current
      if (id && termRef.current) {
        window.mentis.terminalResize(id, termRef.current.cols, termRef.current.rows)
      }
    })
    ro.observe(containerRef.current)
    cleanupFns.current.push(() => ro.disconnect())
  }, [active])

  // Re-fit every time the pane becomes the active tab
  useEffect(() => {
    if (active && fitRef.current) {
      requestAnimationFrame(() => fitRef.current?.fit())
    }
  }, [active])

  return (
    <div
      ref={containerRef}
      style={{
        display:    active ? 'block' : 'none',
        width:      '100%',
        height:     '100%',
        background: '#0d0d0d',
        padding:    '4px',
        boxSizing:  'border-box',
      }}
    />
  )
}
