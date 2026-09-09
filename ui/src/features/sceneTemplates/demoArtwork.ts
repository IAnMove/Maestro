export interface DemoArtwork {
  name: string
  type: 'image'
  source: string
}

export type DemoArtworkKey =
  | 'subject'
  | 'partner'
  | 'background'
  | 'foreground'
  | 'prop'
  | 'space'
  | 'planet'
  | 'laser'
  | 'shield'
  | 'burst'
  | 'debris'
  | 'stage'

export type DemoArtworkVariant = 'coral' | 'teal'

type Palette = {
  ink: string
  paper: string
  skin: string
  skinShadow: string
  primary: string
  secondary: string
  highlight: string
  deep: string
  night: string
  glow: string
}

const PALETTES: Record<DemoArtworkVariant, Palette> = {
  coral: {
    ink: '#151b32',
    paper: '#fff3df',
    skin: '#eab18d',
    skinShadow: '#c6756c',
    primary: '#ee7f72',
    secondary: '#f4bd75',
    highlight: '#ffe0a6',
    deep: '#241d3e',
    night: '#111a38',
    glow: '#ff9d82',
  },
  teal: {
    ink: '#102b3b',
    paper: '#edfff7',
    skin: '#b9e0ce',
    skinShadow: '#6cb7ae',
    primary: '#24b8b0',
    secondary: '#8ed7e5',
    highlight: '#d3fff0',
    deep: '#102b46',
    night: '#071f35',
    glow: '#68f1d3',
  },
}

const ART_KEYS: readonly DemoArtworkKey[] = [
  'subject', 'partner', 'background', 'foreground', 'prop', 'space',
  'planet', 'laser', 'shield', 'burst', 'debris', 'stage',
]

const dataUri = (markup: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`

const svg = (body: string, width: number, height: number, label: string) => (
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">${body}</svg>`
)

const artwork = (key: DemoArtworkKey, variant: DemoArtworkVariant, body: string, width: number, height: number): DemoArtwork => ({
  name: `demo-${key}-${variant}`,
  type: 'image',
  source: dataUri(svg(body, width, height, `${variant} ${key} procedural artwork`)),
})

const stars = (count: number, width: number, height: number, color: string, seed: number) => Array.from({ length: count }, (_, index) => {
  const x = (index * 137 + seed * 31) % width
  const y = (index * 83 + seed * 17) % height
  const radius = index % 7 === 0 ? 2.4 : index % 3 === 0 ? 1.5 : 1
  const opacity = (0.35 + (index % 5) * 0.12).toFixed(2)
  return `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" opacity="${opacity}"/>`
}).join('')

const character = (key: 'subject' | 'partner', variant: DemoArtworkVariant, palette: Palette) => {
  const subject = key === 'subject'
  const coat = subject ? palette.primary : palette.secondary
  const trim = subject ? palette.secondary : palette.primary
  const stance = subject
    ? `<path d="M139 312L112 432L146 447L174 357L184 447H224L221 329Z" fill="${coat}"/><path d="M221 329L236 447H276L267 308Z" fill="${coat}"/>`
    : `<path d="M137 310L104 425L139 444L179 354L183 448H220L221 323Z" fill="${coat}"/><path d="M221 323L242 448H281L264 304Z" fill="${coat}"/>`
  const head = subject
    ? `<path d="M113 171Q111 82 200 76Q289 82 287 171L270 239Q248 282 200 286Q152 282 130 239Z" fill="${palette.skin}"/>`
    : `<path d="M108 169Q115 73 201 72Q286 76 292 169L270 244Q245 286 200 287Q155 286 130 244Z" fill="${palette.skin}"/>`
  const hair = subject
    ? `<path d="M108 164Q91 100 139 69Q203 25 265 72Q305 107 287 166L261 132Q218 125 170 111L131 165Z" fill="${palette.deep}"/><path d="M119 106Q200 60 281 105" stroke="${trim}" stroke-width="14" fill="none"/>`
    : `<path d="M108 151Q92 74 175 56Q265 42 295 119L285 166L259 127Q214 115 167 132L127 170Z" fill="${palette.deep}"/><path d="M117 105Q202 63 286 108L276 77Q201 32 128 67Z" fill="${trim}"/>`
  const accessory = subject
    ? `<path d="M118 119H282" stroke="${palette.highlight}" stroke-width="11"/><circle cx="200" cy="117" r="12" fill="${palette.glow}"/>`
    : `<path d="M125 102Q200 59 275 102" stroke="${palette.highlight}" stroke-width="9" fill="none"/><path d="M252 93L285 73L276 111Z" fill="${palette.glow}"/>`
  const body = `<g stroke="${palette.ink}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">${stance}<path d="M139 290Q200 266 262 290L273 438Q200 470 127 438Z" fill="${coat}"/><path d="M172 294L200 335L229 294" fill="${palette.paper}"/><path d="M200 335V445" stroke="${palette.ink}"/><path d="M132 399L172 388V425H134M228 388L268 399V425H228" fill="${trim}"/><path d="M135 433L111 548H173L184 449M218 449L229 548H291L266 433" fill="${palette.deep}"/><path d="M108 540H174V575H92Q90 551 108 540ZM226 540H292Q310 550 308 575H226Z" fill="${palette.paper}"/><path d="M96 565H172M228 565H304" stroke="${palette.glow}"/>${head}<ellipse cx="143" cy="208" rx="17" ry="8" fill="${palette.skinShadow}" opacity=".42" stroke="none"/><ellipse cx="257" cy="208" rx="17" ry="8" fill="${palette.skinShadow}" opacity=".42" stroke="none"/>${hair}${accessory}<g data-role="eyes"><ellipse cx="161" cy="174" rx="8" ry="11" fill="${palette.ink}" stroke="none"/><ellipse cx="239" cy="174" rx="8" ry="11" fill="${palette.ink}" stroke="none"/><circle cx="164" cy="170" r="2.5" fill="${palette.paper}" stroke="none"/><circle cx="242" cy="170" r="2.5" fill="${palette.paper}" stroke="none"/></g><path d="M180 221Q200 230 220 221" data-role="closed-mouth" fill="none" stroke="${palette.ink}" stroke-width="4"/></g>`
  return artwork(key, variant, `<ellipse cx="200" cy="579" rx="105" ry="14" fill="${palette.ink}" opacity=".3"/>${body}`, 400, 600)
}

const background = (variant: DemoArtworkVariant, palette: Palette) => {
  const skyline = [280, 360, 220, 430, 320, 470, 250, 390, 300, 510, 270, 410].map((height, index) => {
    const x = index * 116 - 24
    const windows = Array.from({ length: 8 }, (_, window) => `<rect x="${x + 18 + (window % 2) * 35}" y="${690 - height + 32 + Math.floor(window / 2) * 34}" width="10" height="15" fill="${palette.highlight}" opacity=".${(index + window) % 5 + 2}"/>`).join('')
    return `<path d="M${x} 690V${690 - height}H${x + 96}V690Z" fill="${index % 2 ? palette.deep : palette.night}"/>${windows}`
  }).join('')
  const horizon = variant === 'coral'
    ? `<path d="M0 488Q180 402 360 482T720 462T1080 470T1440 430V720H0Z" fill="${palette.deep}" opacity=".78"/>`
    : `<path d="M0 465Q220 390 420 475T820 450T1240 470V720H0Z" fill="${palette.deep}" opacity=".78"/>`
  return artwork('background', variant, `<defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="${palette.night}"/><stop offset=".62" stop-color="${palette.deep}"/><stop offset="1" stop-color="${palette.primary}"/></linearGradient><radialGradient id="halo"><stop stop-color="${palette.glow}" stop-opacity=".72"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="url(#bg)"/><circle cx="1010" cy="188" r="235" fill="url(#halo)"/><circle cx="1010" cy="188" r="92" fill="${palette.highlight}" opacity=".88"/><circle cx="1010" cy="188" r="112" fill="none" stroke="${palette.glow}" stroke-width="5" opacity=".5"/>${stars(42, 1280, 430, palette.paper, variant === 'coral' ? 3 : 7)}${horizon}${skyline}<path d="M0 690H1280" stroke="${palette.glow}" stroke-width="5" opacity=".7"/>`, 1280, 720)
}

const foreground = (variant: DemoArtworkVariant, palette: Palette) => artwork('foreground', variant, `<defs><linearGradient id="fg" x2="0" y2="1"><stop stop-color="${palette.deep}"/><stop offset="1" stop-color="${palette.ink}"/></linearGradient></defs><path d="M0 684H92L120 720H0Z" fill="url(#fg)"/><path d="M1280 684H1188L1160 720H1280Z" fill="url(#fg)"/><path d="M0 705H1280" stroke="${palette.glow}" stroke-width="5" opacity=".72"/><path d="M0 715H1280" stroke="${palette.night}" stroke-width="9" opacity=".9"/><path d="M72 684V720M1208 684V720" stroke="${palette.ink}" stroke-width="12"/><path d="M18 692H96M1184 692H1262" stroke="${palette.secondary}" stroke-width="3" opacity=".62"/>`, 1280, 720)

const prop = (variant: DemoArtworkVariant, palette: Palette) => artwork('prop', variant, `<defs><radialGradient id="p"><stop stop-color="${palette.paper}"/><stop offset=".25" stop-color="${palette.glow}"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient><linearGradient id="glass" x2="0" y2="1"><stop stop-color="${palette.highlight}"/><stop offset="1" stop-color="${palette.primary}"/></linearGradient></defs><circle cx="256" cy="220" r="180" fill="url(#p)"/><path d="M256 85L343 237L256 425L169 237Z" fill="url(#glass)" stroke="${palette.paper}" stroke-width="7"/><path d="M256 85V425M169 237H343M205 146L307 328M307 146L205 328" stroke="${palette.paper}" stroke-width="4" opacity=".65"/><circle cx="256" cy="237" r="35" fill="${palette.paper}" opacity=".8"/><path d="M256 426V482M200 482H312" stroke="${palette.ink}" stroke-width="12" stroke-linecap="round"/>`, 512, 512)

const space = (variant: DemoArtworkVariant, palette: Palette) => artwork('space', variant, `<defs><linearGradient id="space" x2="1" y2="1"><stop stop-color="${palette.night}"/><stop offset=".52" stop-color="${palette.deep}"/><stop offset="1" stop-color="${variant === 'coral' ? '#4e274c' : '#0a5967'}"/></linearGradient><radialGradient id="nebula"><stop stop-color="${palette.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient></defs><rect width="1280" height="720" fill="url(#space)"/><ellipse cx="820" cy="350" rx="410" ry="210" fill="url(#nebula)"/><path d="M0 470Q240 230 550 430T1280 270" fill="none" stroke="${palette.secondary}" stroke-width="34" opacity=".12"/><path d="M0 500Q250 278 560 455T1280 310" fill="none" stroke="${palette.glow}" stroke-width="5" opacity=".27"/>${stars(78, 1280, 700, palette.paper, variant === 'coral' ? 11 : 19)}<circle cx="260" cy="186" r="64" fill="${palette.highlight}" opacity=".9"/><circle cx="260" cy="186" r="79" fill="none" stroke="${palette.glow}" stroke-width="4" opacity=".4"/>`, 1280, 720)

const planet = (variant: DemoArtworkVariant, palette: Palette) => artwork('planet', variant, `<defs><radialGradient id="planet" cx="35%" cy="30%"><stop stop-color="${palette.highlight}"/><stop offset=".38" stop-color="${palette.secondary}"/><stop offset="1" stop-color="${palette.deep}"/></radialGradient><clipPath id="disc"><circle cx="256" cy="256" r="148"/></clipPath></defs><ellipse cx="256" cy="324" rx="205" ry="33" fill="none" stroke="${palette.glow}" stroke-width="15" opacity=".42"/><ellipse cx="256" cy="324" rx="205" ry="33" fill="none" stroke="${palette.paper}" stroke-width="3" opacity=".7"/><circle cx="256" cy="256" r="148" fill="url(#planet)" stroke="${palette.paper}" stroke-width="6"/><g clip-path="url(#disc)" fill="none" stroke="${palette.glow}" opacity=".38">${[164, 210, 260, 314, 356].map((y, index) => `<path d="M85 ${y}Q210 ${y - 30 - index * 8} 430 ${y + 12}" stroke-width="${index % 2 ? 12 : 7}"/>`).join('')}</g><circle cx="211" cy="194" r="27" fill="${palette.paper}" opacity=".45"/>`, 512, 512)

const laser = (variant: DemoArtworkVariant, palette: Palette) => artwork('laser', variant, `<defs><linearGradient id="beam" x2="1"><stop stop-color="${palette.glow}" stop-opacity="0"/><stop offset=".18" stop-color="${palette.glow}"/><stop offset=".5" stop-color="${palette.paper}"/><stop offset=".82" stop-color="${palette.glow}"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></linearGradient></defs><path d="M22 256H490" stroke="${palette.glow}" stroke-width="42" opacity=".18"/><path d="M22 256H490" stroke="url(#beam)" stroke-width="12"/><path d="M22 256H490" stroke="${palette.paper}" stroke-width="3"/><circle cx="256" cy="256" r="31" fill="${palette.paper}" opacity=".75"/>`, 512, 512)

const shield = (variant: DemoArtworkVariant, palette: Palette) => artwork('shield', variant, `<defs><radialGradient id="shield"><stop stop-color="${palette.glow}" stop-opacity=".2"/><stop offset=".68" stop-color="${palette.glow}" stop-opacity=".06"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient></defs><ellipse cx="256" cy="256" rx="196" ry="150" fill="url(#shield)"/><ellipse cx="256" cy="256" rx="185" ry="140" fill="none" stroke="${palette.glow}" stroke-width="13" opacity=".28"/><ellipse cx="256" cy="256" rx="174" ry="130" fill="none" stroke="${palette.paper}" stroke-width="5" stroke-dasharray="24 12"/><path d="M90 256H125M387 256H422M256 126V157M256 355V386" stroke="${palette.highlight}" stroke-width="7" stroke-linecap="round"/>`, 512, 512)

const burst = (variant: DemoArtworkVariant, palette: Palette) => artwork('burst', variant, `<defs><radialGradient id="burst"><stop stop-color="${palette.paper}"/><stop offset=".28" stop-color="${palette.glow}"/><stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/></radialGradient></defs><circle cx="256" cy="256" r="180" fill="url(#burst)"/>${Array.from({ length: 16 }, (_, index) => { const angle = index * 22.5; const inner = index % 2 ? 92 : 67; const outer = index % 2 ? 210 : 242; return `<path d="M256 ${256 - inner}L${256 + Math.sin(angle * Math.PI / 180) * outer} ${256 - Math.cos(angle * Math.PI / 180) * outer}L${256 + Math.sin(angle * Math.PI / 180) * inner} ${256 - Math.cos(angle * Math.PI / 180) * inner}Z" fill="${index % 3 ? palette.glow : palette.highlight}" opacity=".${index % 4 + 4}"/>` }).join('')}<circle cx="256" cy="256" r="47" fill="${palette.paper}" opacity=".9"/>`, 512, 512)

const debris = (variant: DemoArtworkVariant, palette: Palette) => artwork('debris', variant, `${[[-160, -80, 18, 32, 15], [125, -140, 24, 14, -22], [-52, 138, 27, 12, 31], [160, 100, 14, 28, -8], [-180, 110, 10, 22, 42], [42, -190, 12, 25, 18]].map(([x, y, w, h, rotate], index) => `<path d="M${256 + x} ${256 + y}l${w} ${h}l${-w * .45} ${h * .7}Z" fill="${index % 2 ? palette.secondary : palette.glow}" stroke="${palette.paper}" stroke-width="3" transform="rotate(${rotate} ${256 + x} ${256 + y})" opacity=".${5 + index % 4}"/>`).join('')}`, 512, 512)

const stage = (variant: DemoArtworkVariant, palette: Palette) => artwork('stage', variant, `<defs><linearGradient id="stage" x2="0" y2="1"><stop stop-color="${palette.night}"/><stop offset="1" stop-color="${palette.ink}"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="${palette.deep}"/><stop offset="1" stop-color="${palette.ink}"/></linearGradient></defs><rect width="1280" height="720" fill="url(#stage)"/><path d="M0 0L360 0L650 530L0 530Z" fill="${palette.primary}" opacity=".16"/><path d="M920 0H1280V530L630 530Z" fill="${palette.secondary}" opacity=".16"/><path d="M550 0H730L660 530H620Z" fill="${palette.glow}" opacity=".2"/>${[170, 390, 890, 1110].map((x, index) => `<circle cx="${x}" cy="98" r="28" fill="${index % 2 ? palette.secondary : palette.glow}"/><path d="M${x - 24} 114L${x - 130} 540H${x + 130}Z" fill="${index % 2 ? palette.secondary : palette.glow}" opacity=".13"/>`).join('')}<path d="M0 530H1280V720H0Z" fill="url(#floor)"/><path d="M0 530H1280M0 585H1280M0 650H1280" stroke="${palette.glow}" stroke-width="3" opacity=".45"/>${[-180, 80, 340, 600, 860, 1120, 1380].map(x => `<path d="M640 530L${x} 720" stroke="${palette.secondary}" stroke-width="2" opacity=".32"/>`).join('')}<rect x="72" y="76" width="1136" height="12" rx="6" fill="${palette.highlight}" opacity=".6"/>`, 1280, 720)

export function demoArtwork(variant: DemoArtworkVariant = 'coral'): Record<DemoArtworkKey, DemoArtwork> {
  const palette = PALETTES[variant]
  const assets: Record<DemoArtworkKey, DemoArtwork> = {
    subject: character('subject', variant, palette),
    partner: character('partner', variant, palette),
    background: background(variant, palette),
    foreground: foreground(variant, palette),
    prop: prop(variant, palette),
    space: space(variant, palette),
    planet: planet(variant, palette),
    laser: laser(variant, palette),
    shield: shield(variant, palette),
    burst: burst(variant, palette),
    debris: debris(variant, palette),
    stage: stage(variant, palette),
  }
  return Object.fromEntries(ART_KEYS.map(key => [key, assets[key]])) as Record<DemoArtworkKey, DemoArtwork>
}
