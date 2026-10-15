// Draws the Daily Tracker logo from one set of measurements and writes every file that uses it:
//   public/favicon.svg          the mark, for browser tabs
//   public/apple-touch-icon.png the mark, full bleed, for a phone's home screen
//   macos/AppIcon.png           the mark on the macOS icon grid, for the Mac app (npm run app)
//   docs/brand/mark.svg         the mark on its own
//   docs/brand/lockup-light.svg mark and wordmark, for light backgrounds
//   docs/brand/lockup-dark.svg  mark and wordmark, for dark backgrounds
//   docs/brand/preview.html     every version side by side
// The wordmark is IBM Plex Sans SemiBold turned into outlines, so it looks the same where the font
// isn't installed (GitHub, an email). src/components/Logo.tsx draws the mark with the same numbers.
// Run: npm run logo

import AppKit
import CoreText

// MARK: The mark, on a 64 x 64 grid with y growing downward (as in SVG)

enum Mark {
  static let size: CGFloat = 64
  static let radius: CGFloat = 14
  /// The ruler: a baseline with five evenly spaced ticks, alternating tall and short, centred in
  /// the tile.
  static let base: CGFloat = 40
  static let left: CGFloat = 12, right: CGFloat = 52
  static let ticks: [(x: CGFloat, height: CGFloat)] = [(12, 9), (22, 5), (32, 9), (42, 5), (52, 9)]
  static let tickWidth: CGFloat = 3
  /// Now: the teal line, between two ticks right of centre (late in the day), standing above the
  /// ruler and crossing it.
  static let nowX: CGFloat = 37, nowTop: CGFloat = 15, nowBottom: CGFloat = 48
  static let nowWidth: CGFloat = 5
}

enum Color {
  static let tile = "#0E1E33"
  static let ruler = "#8796AA"
  static let now = "#2DD4BF"
  static let inkLight = "#0E1E33"
  static let inkDark = "#E4EBF3"
}

func f(_ v: CGFloat) -> String {
  let s = String(format: "%.2f", Double(v))
  return s.replacingOccurrences(of: #"\.?0+$"#, with: "", options: .regularExpression)
}

/// The mark's drawing as SVG elements, placed at (x, y) and scaled to `size`.
func markSVG(x: CGFloat = 0, y: CGFloat = 0, size: CGFloat = Mark.size) -> String {
  let k = size / Mark.size
  var ruler = "M\(f(Mark.left)) \(f(Mark.base))H\(f(Mark.right))"
  for t in Mark.ticks { ruler += "M\(f(t.x)) \(f(Mark.base))V\(f(Mark.base - t.height))" }
  return """
    <g transform="translate(\(f(x)) \(f(y))) scale(\(f(k)))">
      <rect width="64" height="64" rx="\(f(Mark.radius))" fill="\(Color.tile)"/>
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="\(f(Mark.radius - 0.75))" fill="none" stroke="#FFFFFF" stroke-opacity="0.09" stroke-width="1.5"/>
      <path d="\(ruler)" fill="none" stroke="\(Color.ruler)" stroke-width="\(f(Mark.tickWidth))" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M\(f(Mark.nowX)) \(f(Mark.nowTop))V\(f(Mark.nowBottom))" stroke="\(Color.now)" stroke-width="\(f(Mark.nowWidth))" stroke-linecap="round"/>
    </g>
    """
}

// MARK: The wordmark, as outlines

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let fontFile = root.appending(path: "node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2")
guard let fontData = try? Data(contentsOf: fontFile) as CFData,
  let descriptor = CTFontManagerCreateFontDescriptorFromData(fontData)
else { fatalError("Run npm install first: \(fontFile.path) is missing") }

/// SVG path data for `text` in IBM Plex Sans at `weight`, with its baseline at y = 0, and its width.
func outline(_ text: String, size: CGFloat, weight: CGFloat, tracking: CGFloat) -> (path: String, width: CGFloat) {
  let wght = 0x7767_6874  // "wght"
  let varied = CTFontDescriptorCreateCopyWithAttributes(
    descriptor, [kCTFontVariationAttribute: [wght: weight]] as CFDictionary)
  let font = CTFontCreateWithFontDescriptor(varied, size, nil)
  let attributed = NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTKernAttributeName as String): tracking * size,
  ])
  let line = CTLineCreateWithAttributedString(attributed)
  var d = ""
  for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let count = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: count)
    var positions = [CGPoint](repeating: .zero, count: count)
    CTRunGetGlyphs(run, CFRange(location: 0, length: count), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: count), &positions)
    for (glyph, p) in zip(glyphs, positions) {
      // Font outlines grow upward; SVG grows downward, so flip y around the baseline.
      var flip = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: p.x, ty: 0)
      guard let path = CTFontCreatePathForGlyph(font, glyph, &flip) else { continue }
      path.applyWithBlock { el in
        let pts = el.pointee.points
        switch el.pointee.type {
        case .moveToPoint: d += "M\(f(pts[0].x)) \(f(pts[0].y))"
        case .addLineToPoint: d += "L\(f(pts[0].x)) \(f(pts[0].y))"
        case .addQuadCurveToPoint: d += "Q\(f(pts[0].x)) \(f(pts[0].y)) \(f(pts[1].x)) \(f(pts[1].y))"
        case .addCurveToPoint:
          d += "C\(f(pts[0].x)) \(f(pts[0].y)) \(f(pts[1].x)) \(f(pts[1].y)) \(f(pts[2].x)) \(f(pts[2].y))"
        case .closeSubpath: d += "Z"
        @unknown default: break
        }
      }
    }
  }
  let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil)) - tracking * size
  return (d, width)
}

// MARK: The lockup: mark, then the name, centred on the mark by the letters' cap height

let markSize: CGFloat = 64
let textSize: CGFloat = 30
let gap: CGFloat = 16
let capHeight: CGFloat = 0.698 * textSize  // IBM Plex Sans cap height is 698 units per 1000
let word = outline("Daily Tracker", size: textSize, weight: 600, tracking: -0.012)
let lockupWidth = markSize + gap + word.width
let baseline = (markSize + capHeight) / 2

func lockup(ink: String) -> String {
  """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \(f(lockupWidth)) \(f(markSize))" width="\(f(lockupWidth * 2))" height="\(f(markSize * 2))" role="img" aria-label="Daily Tracker">
  \(markSVG(size: markSize))
    <path transform="translate(\(f(markSize + gap)) \(f(baseline)))" fill="\(ink)" d="\(word.path)"/>
  </svg>

  """
}

let mark = """
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Daily Tracker">
  \(markSVG())
  </svg>

  """

// MARK: Bitmaps: the home-screen icon and the Mac app icon

func srgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> CGColor {
  CGColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255, green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255, alpha: alpha)
}

/// The ruler and the now line, drawn on the 64 grid (y down) of whatever transform `ctx` holds.
/// `weight` thins the strokes for large renderings: the numbers are tuned for a 16 px tab, and the
/// same strokes look heavy at Dock size.
func drawMarkContent(_ ctx: CGContext, weight: CGFloat = 1) {
  ctx.setLineCap(.round)
  ctx.setLineJoin(.round)
  let ruler = CGMutablePath()
  ruler.move(to: CGPoint(x: Mark.left, y: Mark.base))
  ruler.addLine(to: CGPoint(x: Mark.right, y: Mark.base))
  for t in Mark.ticks {
    ruler.move(to: CGPoint(x: t.x, y: Mark.base))
    ruler.addLine(to: CGPoint(x: t.x, y: Mark.base - t.height))
  }
  ctx.addPath(ruler)
  ctx.setStrokeColor(srgb(0x8796AA))
  ctx.setLineWidth(Mark.tickWidth * weight)
  ctx.strokePath()
  ctx.move(to: CGPoint(x: Mark.nowX, y: Mark.nowTop))
  ctx.addLine(to: CGPoint(x: Mark.nowX, y: Mark.nowBottom))
  ctx.setStrokeColor(srgb(0x2DD4BF))
  ctx.setLineWidth(Mark.nowWidth * weight)
  ctx.strokePath()
}

func bitmap(pixels: Int, draw: (CGContext) -> Void) -> Data {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  let ctx = NSGraphicsContext.current!.cgContext
  // Flip to a y-down canvas so the SVG's numbers apply unchanged.
  ctx.translateBy(x: 0, y: CGFloat(pixels))
  ctx.scaleBy(x: 1, y: -1)
  draw(ctx)
  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])!
}

/// Full bleed with no transparency: the phone rounds the corners itself.
func touchIcon(pixels: Int) -> Data {
  bitmap(pixels: pixels) { ctx in
    let k = CGFloat(pixels) / Mark.size
    ctx.scaleBy(x: k, y: k)
    ctx.setFillColor(srgb(0x0E1E33))
    ctx.fill(CGRect(x: 0, y: 0, width: Mark.size, height: Mark.size))
    // A touch more room than the tile, since the phone's mask trims the corners.
    ctx.translateBy(x: 32, y: 32)
    ctx.scaleBy(x: 0.9, y: 0.9)
    ctx.translateBy(x: -32, y: -32)
    drawMarkContent(ctx, weight: 0.85)
  }
}

/// The mark on the macOS icon grid: an 824 tile on a 1024 canvas with the system-style shadow, a
/// slight shift from the top of the tile to the bottom and a hairline of light along its edge, the
/// depth a Mac icon has. macos/make-icon.swift turns this into the app's icon set.
func macIcon() -> Data {
  bitmap(pixels: 1024) { ctx in
    let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
    let shape = CGPath(roundedRect: tile, cornerWidth: 185, cornerHeight: 185, transform: nil)
    ctx.saveGState()
    // Shadow offsets ignore the flip above, so negative is down.
    ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 20, color: srgb(0x000000, 0.3))
    ctx.addPath(shape)
    ctx.setFillColor(srgb(0x0E1E33))
    ctx.fillPath()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.addPath(shape)
    ctx.clip()
    let gradient = CGGradient(colorsSpace: nil, colors: [srgb(0x15294A), srgb(0x0A1628)] as CFArray, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 100), end: CGPoint(x: 512, y: 924), options: [])
    ctx.addPath(CGPath(roundedRect: tile.insetBy(dx: 3, dy: 3), cornerWidth: 182, cornerHeight: 182, transform: nil))
    ctx.setStrokeColor(srgb(0xFFFFFF, 0.07))
    ctx.setLineWidth(6)
    ctx.strokePath()
    ctx.restoreGState()

    ctx.translateBy(x: tile.minX, y: tile.minY)
    ctx.scaleBy(x: tile.width / Mark.size, y: tile.height / Mark.size)
    drawMarkContent(ctx, weight: 0.7)
  }
}

// MARK: Write everything

let brand = root.appending(path: "docs/brand")
try FileManager.default.createDirectory(at: brand, withIntermediateDirectories: true)
try mark.write(to: root.appending(path: "public/favicon.svg"), atomically: true, encoding: .utf8)
try mark.write(to: brand.appending(path: "mark.svg"), atomically: true, encoding: .utf8)
try lockup(ink: Color.inkLight).write(to: brand.appending(path: "lockup-light.svg"), atomically: true, encoding: .utf8)
try lockup(ink: Color.inkDark).write(to: brand.appending(path: "lockup-dark.svg"), atomically: true, encoding: .utf8)
try touchIcon(pixels: 180).write(to: root.appending(path: "public/apple-touch-icon.png"))
try macIcon().write(to: root.appending(path: "macos/AppIcon.png"))

func dataURI(_ svg: String) -> String { "data:image/svg+xml;base64," + Data(svg.utf8).base64EncodedString() }
let light = dataURI(lockup(ink: Color.inkLight))
let dark = dataURI(lockup(ink: Color.inkDark))
let markURI = dataURI(mark)
let touchURI = "data:image/png;base64," + touchIcon(pixels: 180).base64EncodedString()
let macURI = "data:image/png;base64," + macIcon().base64EncodedString()

// Self-contained, so it opens anywhere, including as a single file.
let preview = """
  <!doctype html>
  <meta charset="utf-8">
  <title>Daily Tracker logo</title>
  <style>
    body { margin: 0; font: 14px/1.5 -apple-system, system-ui, sans-serif; color: #3F4D5F; background: #F2F5F3 }
    section { display: flex; flex-wrap: wrap; align-items: center; gap: 40px; padding: 32px 40px }
    .dark { background: #0B1524; color: #A9B6C6 }
    .white { background: #FFFFFF }
    h2 { width: 100%; margin: 0; font-size: 13px; font-weight: 500 }
    figure { margin: 0; display: grid; justify-items: center; gap: 8px }
    figcaption { font-size: 12px }
  </style>
  <section class="white">
    <h2>Lockup, light</h2>
    <img src="\(light)" height="64" alt="">
    <img src="\(light)" height="32" alt="">
    <img src="\(light)" height="22" alt="">
  </section>
  <section class="dark">
    <h2>Lockup, dark</h2>
    <img src="\(dark)" height="64" alt="">
    <img src="\(dark)" height="32" alt="">
    <img src="\(dark)" height="22" alt="">
  </section>
  <section>
    <h2>Mark at the sizes it's used</h2>
    <figure><img src="\(markURI)" width="128" alt=""><figcaption>128</figcaption></figure>
    <figure><img src="\(markURI)" width="64" alt=""><figcaption>64</figcaption></figure>
    <figure><img src="\(markURI)" width="32" alt=""><figcaption>32, sign-in</figcaption></figure>
    <figure><img src="\(markURI)" width="20" alt=""><figcaption>20, sidebar</figcaption></figure>
    <figure><img src="\(markURI)" width="16" alt=""><figcaption>16, tab</figcaption></figure>
    <figure><img src="\(touchURI)" width="90" alt="" style="border-radius: 20px"><figcaption>Home screen</figcaption></figure>
    <figure><img src="\(macURI)" width="128" alt=""><figcaption>Mac app</figcaption></figure>
  </section>

  """
try preview.write(to: brand.appending(path: "preview.html"), atomically: true, encoding: .utf8)
print("Wrote favicon, home-screen icon and docs/brand/ (open docs/brand/preview.html to compare).")
