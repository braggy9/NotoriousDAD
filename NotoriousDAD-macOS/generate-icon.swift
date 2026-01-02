#!/usr/bin/env swift

import Cocoa
import Foundation

// Icon sizes needed for macOS (size in points, actual pixels = size * scale)
let sizes: [(points: Int, scale: Int, filename: String)] = [
    (16, 1, "icon_16x16.png"),       // 16x16 pixels
    (16, 2, "icon_16x16@2x.png"),    // 32x32 pixels
    (32, 1, "icon_32x32.png"),       // 32x32 pixels
    (32, 2, "icon_32x32@2x.png"),    // 64x64 pixels
    (128, 1, "icon_128x128.png"),    // 128x128 pixels
    (128, 2, "icon_128x128@2x.png"), // 256x256 pixels
    (256, 1, "icon_256x256.png"),    // 256x256 pixels
    (256, 2, "icon_256x256@2x.png"), // 512x512 pixels
    (512, 1, "icon_512x512.png"),    // 512x512 pixels
    (512, 2, "icon_512x512@2x.png"), // 1024x1024 pixels
]

func generateIcon(pixelSize: Int) -> NSImage {
    let size = CGFloat(pixelSize)
    let image = NSImage(size: NSSize(width: size, height: size))

    image.lockFocus()

    let context = NSGraphicsContext.current!.cgContext
    let rect = CGRect(x: 0, y: 0, width: size, height: size)

    // Rounded rectangle path (macOS icon style)
    let cornerRadius = size * 0.22
    let inset = size * 0.02
    let path = CGPath(roundedRect: rect.insetBy(dx: inset, dy: inset),
                      cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)

    // Purple gradient background
    let colors = [
        NSColor(red: 0.6, green: 0.2, blue: 0.9, alpha: 1.0).cgColor,
        NSColor(red: 0.3, green: 0.1, blue: 0.6, alpha: 1.0).cgColor,
    ]
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                               colors: colors as CFArray,
                               locations: [0.0, 1.0])!

    context.saveGState()
    context.addPath(path)
    context.clip()
    context.drawLinearGradient(gradient,
                                start: CGPoint(x: 0, y: size),
                                end: CGPoint(x: size, y: 0),
                                options: [])
    context.restoreGState()

    // Draw waveform bars
    context.setFillColor(NSColor.white.cgColor)

    let centerY = size / 2
    let barWidth = size * 0.06
    let spacing = size * 0.09
    let startX = size * 0.25

    let heights: [CGFloat] = [0.15, 0.35, 0.55, 0.7, 0.55, 0.35, 0.15]

    for (i, heightRatio) in heights.enumerated() {
        let barHeight = size * heightRatio
        let x = startX + CGFloat(i) * spacing
        let y = centerY - barHeight / 2

        let barRect = CGRect(x: x, y: y, width: barWidth, height: barHeight)
        let barPath = CGPath(roundedRect: barRect, cornerWidth: barWidth / 2, cornerHeight: barWidth / 2, transform: nil)
        context.addPath(barPath)
        context.fillPath()
    }

    image.unlockFocus()

    return image
}

func saveImage(_ image: NSImage, to path: String, pixelSize: Int) {
    // Create a bitmap with exact pixel dimensions
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                pixelsWide: pixelSize,
                                pixelsHigh: pixelSize,
                                bitsPerSample: 8,
                                samplesPerPixel: 4,
                                hasAlpha: true,
                                isPlanar: false,
                                colorSpaceName: .deviceRGB,
                                bytesPerRow: 0,
                                bitsPerPixel: 0)!

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    image.draw(in: NSRect(x: 0, y: 0, width: pixelSize, height: pixelSize))

    NSGraphicsContext.restoreGraphicsState()

    guard let pngData = rep.representation(using: .png, properties: [:]) else {
        print("❌ Failed to create PNG data")
        return
    }

    do {
        try pngData.write(to: URL(fileURLWithPath: path))
        print("✅ Created: \(filename(from: path)) (\(pixelSize)x\(pixelSize))")
    } catch {
        print("❌ Failed to write: \(error)")
    }
}

func filename(from path: String) -> String {
    return String(path.split(separator: "/").last ?? "")
}

// Main
let outputDir = "NotoriousDAD/Assets.xcassets/AppIcon.appiconset"

print("🎨 Generating Notorious DAD app icons...")
print("")

for (points, scale, filename) in sizes {
    let pixelSize = points * scale
    let image = generateIcon(pixelSize: pixelSize)
    let path = "\(outputDir)/\(filename)"
    saveImage(image, to: path, pixelSize: pixelSize)
}

print("")
print("✅ All icons generated!")
