/**
 * ComputerUseTool - Let the AI see and control your screen
 *
 * Actions:
 *   screenshot            - Capture screen, return base64 PNG + path
 *   click(x, y)           - Left click at coordinates
 *   double_click(x, y)    - Double click
 *   right_click(x, y)     - Right click
 *   move(x, y)            - Move mouse without clicking
 *   type(text)            - Type text at current focus
 *   key(combo)            - Press key combination (e.g. "ctrl+c", "Return")
 *   scroll(x, y, dir, n)  - Scroll up/down at coordinates
 *   screen_size           - Return screen width × height
 *
 * Platform support:
 *   Linux   — xdotool  (apt install xdotool / pkg install xdotool)
 *   macOS   — cliclick + osascript (brew install cliclick)
 *   Windows — PowerShell SendKeys + PrintScreen
 */

import { Tool } from './Tool';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(os.homedir(), '.mentis', 'screenshots');

function ensureScreenshotDir() {
    if (!fs.existsSync(SCREENSHOT_DIR)) {
        fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    }
}

function platform(): 'linux' | 'macos' | 'windows' | 'android' {
    if (process.platform === 'darwin') return 'macos';
    if (process.platform === 'win32') return 'windows';
    // Detect Termux (Android)
    if (process.env.TERMUX_VERSION || fs.existsSync('/data/data/com.termux')) return 'android';
    return 'linux';
}

function run(cmd: string): { stdout: string; stderr: string; ok: boolean } {
    try {
        const result = spawnSync('sh', ['-c', cmd], { encoding: 'utf-8', timeout: 10000 });
        return {
            stdout: result.stdout?.trim() ?? '',
            stderr: result.stderr?.trim() ?? '',
            ok: result.status === 0,
        };
    } catch (e: any) {
        return { stdout: '', stderr: e.message, ok: false };
    }
}

function checkDep(dep: string): boolean {
    return run(`which ${dep}`).ok;
}

// ── Screenshot ────────────────────────────────────────────────────────────────

async function takeScreenshot(): Promise<{ path: string; base64: string; width: number; height: number }> {
    ensureScreenshotDir();
    const outPath = path.join(SCREENSHOT_DIR, `screen_${Date.now()}.png`);
    const plat = platform();

    if (plat === 'android') {
        // Termux: use screencap (requires storage permission)
        const r = run(`screencap -p "${outPath}"`);
        if (!r.ok) throw new Error(`screencap failed: ${r.stderr}\nGrant storage: termux-setup-storage`);
    } else if (plat === 'macos') {
        const r = run(`screencapture -x "${outPath}"`);
        if (!r.ok) throw new Error(`screencapture failed: ${r.stderr}`);
    } else if (plat === 'windows') {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${outPath}') }`;
        const r = run(`powershell -Command "${ps}"`);
        if (!r.ok) throw new Error(`PowerShell screenshot failed: ${r.stderr}`);
    } else {
        // Linux — try multiple backends
        if (checkDep('scrot')) {
            const r = run(`scrot "${outPath}"`);
            if (!r.ok) throw new Error(`scrot failed: ${r.stderr}`);
        } else if (checkDep('import')) {
            const r = run(`import -window root "${outPath}"`);
            if (!r.ok) throw new Error(`ImageMagick import failed: ${r.stderr}`);
        } else if (checkDep('gnome-screenshot')) {
            const r = run(`gnome-screenshot -f "${outPath}"`);
            if (!r.ok) throw new Error(`gnome-screenshot failed: ${r.stderr}`);
        } else {
            // Fallback: screenshot-desktop npm package
            const screenshotDesktop = require('screenshot-desktop');
            const img: Buffer = await screenshotDesktop({ format: 'png' });
            fs.writeFileSync(outPath, img);
        }
    }

    if (!fs.existsSync(outPath)) throw new Error('Screenshot file was not created');

    const base64 = fs.readFileSync(outPath).toString('base64');

    // Try to get dimensions via file command
    let width = 0, height = 0;
    const dim = run(`file "${outPath}"`);
    const match = dim.stdout.match(/(\d+)\s*x\s*(\d+)/);
    if (match) { width = parseInt(match[1]); height = parseInt(match[2]); }

    return { path: outPath, base64, width, height };
}

// ── Mouse ─────────────────────────────────────────────────────────────────────

function mouseClick(x: number, y: number, button: 'left' | 'right' | 'double' = 'left'): void {
    const plat = platform();

    if (plat === 'android') {
        // ADB tap (requires wireless debugging)
        const r = run(`adb shell input tap ${x} ${y}`);
        if (!r.ok) throw new Error(`ADB tap failed: ${r.stderr}\nEnable wireless debugging in Developer Options.`);
        return;
    }
    if (plat === 'linux') {
        if (!checkDep('xdotool')) throw new Error('xdotool not found. Install: apt install xdotool');
        if (button === 'double') run(`xdotool mousemove ${x} ${y} click --repeat 2 1`);
        else if (button === 'right') run(`xdotool mousemove ${x} ${y} click 3`);
        else run(`xdotool mousemove ${x} ${y} click 1`);
        return;
    }
    if (plat === 'macos') {
        if (!checkDep('cliclick')) throw new Error('cliclick not found. Install: brew install cliclick');
        if (button === 'double') run(`cliclick dc:${x},${y}`);
        else if (button === 'right') run(`cliclick rc:${x},${y}`);
        else run(`cliclick c:${x},${y}`);
        return;
    }
    if (plat === 'windows') {
        const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y}); Start-Sleep -Milliseconds 50; [System.Windows.Forms.SendKeys]::SendWait(' ')`;
        run(`powershell -Command "${ps}"`);
    }
}

function mouseMove(x: number, y: number): void {
    const plat = platform();
    if (plat === 'linux') run(`xdotool mousemove ${x} ${y}`);
    else if (plat === 'macos') run(`cliclick m:${x},${y}`);
    else if (plat === 'android') run(`adb shell input swipe ${x} ${y} ${x} ${y} 1`);
}

function mouseScroll(x: number, y: number, direction: 'up' | 'down', amount: number = 3): void {
    const plat = platform();
    if (plat === 'linux') {
        const btn = direction === 'up' ? 4 : 5;
        run(`xdotool mousemove ${x} ${y} click --repeat ${amount} ${btn}`);
    } else if (plat === 'macos') {
        const amt = direction === 'up' ? amount : -amount;
        run(`cliclick m:${x},${y}` );
        run(`osascript -e 'tell application "System Events" to scroll ${amt} lines'`);
    } else if (plat === 'android') {
        const dy = direction === 'up' ? amount * 100 : -amount * 100;
        run(`adb shell input swipe ${x} ${y} ${x} ${y + dy} 300`);
    }
}

// ── Keyboard ──────────────────────────────────────────────────────────────────

function keyboardType(text: string): void {
    const plat = platform();
    if (plat === 'linux') {
        if (!checkDep('xdotool')) throw new Error('xdotool not found. Install: apt install xdotool');
        // Escape special chars for xdotool
        run(`xdotool type --clearmodifiers -- ${JSON.stringify(text)}`);
    } else if (plat === 'macos') {
        const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        run(`osascript -e 'tell application "System Events" to keystroke "${escaped}"'`);
    } else if (plat === 'windows') {
        const escaped = text.replace(/'/g, "''");
        run(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`);
    } else if (plat === 'android') {
        const escaped = text.replace(/\s/g, '%s');
        run(`adb shell input text "${escaped}"`);
    }
}

function keyboardKey(combo: string): void {
    const plat = platform();
    if (plat === 'linux') {
        if (!checkDep('xdotool')) throw new Error('xdotool not found. Install: apt install xdotool');
        run(`xdotool key ${combo}`);
    } else if (plat === 'macos') {
        // Convert xdotool format to osascript (ctrl+c → command down, c, command up)
        const parts = combo.split('+');
        const key = parts.pop()!;
        const mods = parts.map(m => ({
            ctrl: 'control', alt: 'option', shift: 'shift', super: 'command', cmd: 'command'
        }[m] ?? m)).join(' down, ');
        const script = mods
            ? `tell application "System Events" to keystroke "${key}" using {${mods} down}`
            : `tell application "System Events" to keystroke "${key}"`;
        run(`osascript -e '${script}'`);
    } else if (plat === 'windows') {
        const winKey = combo.replace('ctrl', '^').replace('alt', '%').replace('shift', '+').replace('Return', '{ENTER}');
        run(`powershell -Command "[System.Windows.Forms.SendKeys]::SendWait('${winKey}')"`);
    } else if (plat === 'android') {
        // Map common keys to Android keycodes
        const keyMap: Record<string, number> = {
            Return: 66, BackSpace: 67, Escape: 111, Tab: 61,
            'ctrl+c': 277, 'ctrl+v': 279, 'ctrl+z': 278,
        };
        const code = keyMap[combo];
        if (code) run(`adb shell input keyevent ${code}`);
        else run(`adb shell input keyevent --longpress ${combo}`);
    }
}

function getScreenSize(): { width: number; height: number } {
    const plat = platform();
    if (plat === 'linux') {
        const r = run(`xdotool getdisplaygeometry`);
        const parts = r.stdout.split(' ');
        if (parts.length >= 2) return { width: parseInt(parts[0]), height: parseInt(parts[1]) };
    } else if (plat === 'macos') {
        const r = run(`osascript -e 'tell application "Finder" to get bounds of window of desktop'`);
        const parts = r.stdout.split(', ');
        if (parts.length >= 4) return { width: parseInt(parts[2]), height: parseInt(parts[3]) };
    } else if (plat === 'android') {
        const r = run(`adb shell wm size`);
        const match = r.stdout.match(/(\d+)x(\d+)/);
        if (match) return { width: parseInt(match[1]), height: parseInt(match[2]) };
    } else if (plat === 'windows') {
        const r = run(`powershell -Command "[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height"`);
        const lines = r.stdout.split('\n');
        if (lines.length >= 2) return { width: parseInt(lines[0]), height: parseInt(lines[1]) };
    }
    return { width: 1920, height: 1080 }; // fallback
}

// ── Tool definition ───────────────────────────────────────────────────────────

export class ComputerUseTool implements Tool {
    name = 'computer_use';
    description = [
        'Control the screen — take screenshots and interact with the UI.',
        'Actions:',
        '  screenshot              — Capture screen, returns base64 PNG + file path',
        '  click {x, y}            — Left click at pixel coordinates',
        '  double_click {x, y}     — Double click',
        '  right_click {x, y}      — Right click',
        '  move {x, y}             — Move mouse',
        '  type {text}             — Type text at current focus',
        '  key {combo}             — Press key combo e.g. "ctrl+c", "Return", "alt+F4"',
        '  scroll {x, y, direction, amount} — Scroll up/down (amount = lines)',
        '  screen_size             — Get screen width and height',
        'Platform: auto-detected (Linux/xdotool, macOS/cliclick, Windows/PowerShell, Android/ADB).',
    ].join('\n');

    parameters = {
        type: 'object',
        properties: {
            action: {
                type: 'string',
                enum: ['screenshot', 'click', 'double_click', 'right_click', 'move', 'type', 'key', 'scroll', 'screen_size'],
                description: 'The action to perform',
            },
            x: { type: 'number', description: 'X coordinate (pixels from left)' },
            y: { type: 'number', description: 'Y coordinate (pixels from top)' },
            text: { type: 'string', description: 'Text to type' },
            combo: { type: 'string', description: 'Key combination e.g. ctrl+c, Return, alt+Tab' },
            direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction' },
            amount: { type: 'number', description: 'Number of scroll lines (default 3)' },
        },
        required: ['action'],
    };

    async execute(args: {
        action: string;
        x?: number;
        y?: number;
        text?: string;
        combo?: string;
        direction?: 'up' | 'down';
        amount?: number;
    }): Promise<string> {
        const { action, x = 0, y = 0, text = '', combo = '', direction = 'down', amount = 3 } = args;

        switch (action) {
            case 'screenshot': {
                const shot = await takeScreenshot();
                return JSON.stringify({
                    path: shot.path,
                    width: shot.width,
                    height: shot.height,
                    base64_png: shot.base64,
                    message: `Screenshot saved to ${shot.path} (${shot.width}x${shot.height})`,
                });
            }
            case 'click':
                mouseClick(x, y, 'left');
                return `Clicked at (${x}, ${y})`;
            case 'double_click':
                mouseClick(x, y, 'double');
                return `Double-clicked at (${x}, ${y})`;
            case 'right_click':
                mouseClick(x, y, 'right');
                return `Right-clicked at (${x}, ${y})`;
            case 'move':
                mouseMove(x, y);
                return `Mouse moved to (${x}, ${y})`;
            case 'type':
                if (!text) return 'Error: text parameter required for type action';
                keyboardType(text);
                return `Typed: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;
            case 'key':
                if (!combo) return 'Error: combo parameter required for key action';
                keyboardKey(combo);
                return `Pressed key: ${combo}`;
            case 'scroll':
                mouseScroll(x, y, direction, amount);
                return `Scrolled ${direction} ${amount} lines at (${x}, ${y})`;
            case 'screen_size': {
                const size = getScreenSize();
                return `Screen size: ${size.width}x${size.height}`;
            }
            default:
                return `Unknown action: ${action}`;
        }
    }
}
