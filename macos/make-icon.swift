// Writes the app icon set: macos/AppIcon.png if you provide one (1024x1024), otherwise the
// placeholder from DESIGN.md (the day ruler on an ink tile).
// Usage: swift macos/make-icon.swift <output.iconset>

import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

let custom = URL(fileURLWithPath: "macos/AppIcon.png")
let source: NSImage = FileManager.default.fileExists(atPath: custom.path)
  ? NSImage(contentsOf: custom)!
  : NSImage(size: NSSize(width: 1024, height: 1024), flipped: false) { _ in
    drawPlaceholder()
    return true
  }

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
  NSColor(
    srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
    green: CGFloat((hex >> 8) & 0xFF) / 255,
    blue: CGFloat(hex & 0xFF) / 255,
    alpha: alpha
  )
}

func stroke(_ path: NSBezierPath, _ color: NSColor, width: CGFloat) {
  path.lineWidth = width
  path.lineCapStyle = .round
  path.lineJoinStyle = .round
  color.setStroke()
  path.stroke()
}

func line(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat) -> NSBezierPath {
  let p = NSBezierPath()
  p.move(to: NSPoint(x: x1, y: y1))
  p.line(to: NSPoint(x: x2, y: y2))
  return p
}

/// Follows the macOS icon grid: an 824pt rounded tile on a 1024pt canvas, with the system-style shadow.
func drawPlaceholder() {
  let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
  let shape = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)

  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = rgb(0x000000, 0.3)
  shadow.shadowOffset = NSSize(width: 0, height: -10)
  shadow.shadowBlurRadius = 20
  shadow.set()
  rgb(0x0E1E33).setFill()
  shape.fill()
  NSGraphicsContext.restoreGraphicsState()

  // Ruler: baseline and hour ticks.
  let left: CGFloat = 250, right: CGFloat = 774, base: CGFloat = 400
  stroke(line(left, base, right, base), rgb(0x8796AA), width: 16)
  for i in 0...8 {
    let x = left + (right - left) * CGFloat(i) / 8
    stroke(line(x, base, x, base + (i % 2 == 0 ? 92 : 52)), rgb(0x8796AA), width: 16)
  }

  // A deadline mark (outlined diamond) and the teal "now" line.
  let d = NSBezierPath()
  let cx: CGFloat = 446, cy: CGFloat = 600, r: CGFloat = 52
  d.move(to: NSPoint(x: cx, y: cy + r))
  d.line(to: NSPoint(x: cx + r, y: cy))
  d.line(to: NSPoint(x: cx, y: cy - r))
  d.line(to: NSPoint(x: cx - r, y: cy))
  d.close()
  stroke(d, rgb(0xE4EBF3), width: 16)
  stroke(line(612, 352, 612, 724), rgb(0x2DD4BF), width: 36)
}

func writePNG(_ image: NSImage, pixels: Int, to url: URL) throws {
  let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
  )!
  rep.size = NSSize(width: pixels, height: pixels)
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  NSGraphicsContext.current?.imageInterpolation = .high
  image.draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels))
  NSGraphicsContext.restoreGraphicsState()
  try rep.representation(using: .png, properties: [:])!.write(to: url)
}

for points in [16, 32, 128, 256, 512] {
  try writePNG(source, pixels: points, to: output.appending(path: "icon_\(points)x\(points).png"))
  try writePNG(source, pixels: points * 2, to: output.appending(path: "icon_\(points)x\(points)@2x.png"))
}
