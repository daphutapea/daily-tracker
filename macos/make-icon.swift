// Writes the app icon set from macos/AppIcon.png (1024 x 1024). scripts/make-logo.swift draws that
// file from the logo; to use your own icon, replace it with any 1024 x 1024 PNG.
// Usage: swift macos/make-icon.swift <output.iconset>

import AppKit

let output = URL(fileURLWithPath: CommandLine.arguments[1])
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)

guard let source = NSImage(contentsOf: URL(fileURLWithPath: "macos/AppIcon.png")) else {
  print("macos/AppIcon.png is missing. Run npm run logo to draw it.")
  exit(1)
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
