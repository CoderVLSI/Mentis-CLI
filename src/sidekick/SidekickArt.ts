/**
 * SidekickArt - ASCII art for each of the 18 sidekick species
 *
 * Each species has a normal and shiny variant (shiny uses ★ accents).
 * Art is 6 lines tall, ~14 chars wide for clean terminal display.
 */

import { Species } from './SidekickTypes';

export const ART: Record<Species, string[]> = {
    daemon: [
        '   /\\_/\\  ',
        '  ( >.< ) ',
        '   ) ^ (  ',
        '  (_|-|_) ',
        '  _/   \\_ ',
    ],
    pixel: [
        ' ┌──────┐ ',
        ' │ ◼  ◼ │ ',
        ' │  ▄▄  │ ',
        ' │ ◼  ◼ │ ',
        ' └──────┘ ',
    ],
    seggy: [
        ' (╯°□°)╯ ',
        '  ════════',
        '  !! SEGV ',
        '  ════════',
        '  (╮°-°)╮ ',
    ],
    regex: [
        '  /(.*)\\ ',
        ' { m̲a̲t̲c̲h̲ } ',
        '  ^ $ | + ',
        ' [a-z0-9] ',
        '  \\(.*)/g ',
    ],
    nibble: [
        '          ',
        '  ·(◡̈)·  ',
        ' ~~(   )~ ',
        '   /   \\  ',
        '  4 bits  ',
    ],
    repl: [
        ' > _      ',
        ' > _      ',
        ' > █      ',
        ' ~~~~~~~  ',
        ' loop()   ',
    ],
    null: [
        '   (   )  ',
        '  (  ∅  ) ',
        '   (   )  ',
        '  ~~~~~   ',
        '  = null  ',
    ],
    hexer: [
        '  0x????  ',
        ' [##::##] ',
        '  | FF |  ',
        ' [##::##] ',
        '  0x0000  ',
    ],
    stack: [
        '  |═════| ',
        '  |═════| ',
        '  |═════| ',
        '  |═════| ',
        '  |_____|  ',
    ],
    lambda: [
        '    λ     ',
        '   / \\    ',
        '  λ   λ   ',
        ' / \\ / \\  ',
        'λ   λ   λ ',
    ],
    goroutine: [
        ' go ──► ● ',
        ' go ──► ● ',
        ' go ──► ● ',
        ' ~~~~~~~~~~',
        ' chan<–––  ',
    ],
    recursion: [
        ' ┌──[me]─┐',
        ' │┌─[me]┐│',
        ' ││ ... ││',
        ' │└──────┘│',
        ' └────────┘',
    ],
    cache: [
        ' ┌───────┐',
        ' │  HIT  │',
        ' │ █████ │',
        ' │  98%  │',
        ' └───────┘',
    ],
    token: [
        ' <token>  ',
        '  │  │    ',
        '  ◆  ◆   ',
        '  │  │    ',
        ' </token> ',
    ],
    mutex: [
        '   🔒     ',
        ' ══╗ ══╗  ',
        '   ║   ║  ',
        ' ══╝ ══╝  ',
        '  LOCKED  ',
    ],
    promise: [
        ' ·pending·',
        '  /     \\ ',
        'res     rej',
        '  \\     / ',
        ' ·settled·',
    ],
    shard: [
        '    /\\    ',
        '   /◆ \\   ',
        '  / ◆◆ \\  ',
        ' /◆◆◆◆◆\\  ',
        ' ────────  ',
    ],
    bit: [
        '    ┌0┐   ',
        '   /   \\  ',
        '  0     1 ',
        '   \\   /  ',
        '    └1┘   ',
    ],
};

/** Shiny variant adds ★ decoration around the art */
export function getArt(species: Species, isShiny: boolean): string[] {
    const art = ART[species];
    if (!isShiny) return art;
    return [
        '★ ' + '─'.repeat(8) + ' ★',
        ...art,
        '★ ' + '─'.repeat(8) + ' ★',
    ];
}
