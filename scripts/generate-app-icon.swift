#!/usr/bin/env swift

import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

// MARK: - Icon Generator for "Notorious DAD"
// Theme: Electric Gold - Premium vinyl/turntable aesthetic

struct IconGenerator {

    // Color palette - Electric Gold theme
    struct Colors {
        // Background gradient
        static let bgDark = CGColor(red: 0.08, green: 0.08, blue: 0.10, alpha: 1.0)      // Near black
        static let bgMid = CGColor(red: 0.12, green: 0.11, blue: 0.14, alpha: 1.0)       // Dark charcoal

        // Gold accents
        static let goldBright = CGColor(red: 1.0, green: 0.84, blue: 0.0, alpha: 1.0)    // Bright gold
        static let goldDeep = CGColor(red: 0.85, green: 0.65, blue: 0.13, alpha: 1.0)    // Deep gold
        static let goldDark = CGColor(red: 0.55, green: 0.41, blue: 0.08, alpha: 1.0)    // Dark gold

        // Vinyl colors
        static let vinylBlack = CGColor(red: 0.05, green: 0.05, blue: 0.07, alpha: 1.0)
        static let vinylGroove = CGColor(red: 0.15, green: 0.15, blue: 0.18, alpha: 1.0)
        static let vinylShine = CGColor(red: 0.25, green: 0.25, blue: 0.30, alpha: 0.5)

        // Label area
        static let labelDark = CGColor(red: 0.10, green: 0.10, blue: 0.12, alpha: 1.0)
    }

    static func generateIcon(size: Int, variant: IconVariant = .default) -> CGImage? {
        let scale: CGFloat = CGFloat(size)

        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let context = CGContext(
                data: nil,
                width: size,
                height: size,
                bitsPerComponent: 8,
                bytesPerRow: 0,
                space: colorSpace,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
              ) else {
            return nil
        }

        // Enable antialiasing
        context.setAllowsAntialiasing(true)
        context.setShouldAntialias(true)

        let rect = CGRect(x: 0, y: 0, width: scale, height: scale)
        let center = CGPoint(x: scale / 2, y: scale / 2)

        // 1. Draw background gradient (subtle radial)
        drawBackground(context: context, rect: rect, center: center)

        // 2. Draw vinyl record
        drawVinylRecord(context: context, center: center, size: scale, variant: variant)

        // 3. Draw stylized waveform or "DAD" mark
        if variant == .withWaveform {
            drawWaveformAccent(context: context, center: center, size: scale)
        } else if variant == .withDAD {
            drawDADMark(context: context, center: center, size: scale)
        }

        // 4. Add subtle highlight/shine
        drawHighlight(context: context, rect: rect, center: center, size: scale)

        return context.makeImage()
    }

    private static func drawBackground(context: CGContext, rect: CGRect, center: CGPoint) {
        // Radial gradient from center
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
            colors: [Colors.bgMid, Colors.bgDark] as CFArray,
            locations: [0.0, 1.0]
        ) else { return }

        context.drawRadialGradient(
            gradient,
            startCenter: center,
            startRadius: 0,
            endCenter: center,
            endRadius: rect.width * 0.8,
            options: [.drawsAfterEndLocation]
        )
    }

    private static func drawVinylRecord(context: CGContext, center: CGPoint, size: CGFloat, variant: IconVariant) {
        let recordRadius = size * 0.42
        let labelRadius = size * 0.15
        let holeRadius = size * 0.025

        // Outer edge highlight
        context.setFillColor(Colors.vinylGroove)
        context.fillEllipse(in: CGRect(
            x: center.x - recordRadius - 2,
            y: center.y - recordRadius - 2,
            width: (recordRadius + 2) * 2,
            height: (recordRadius + 2) * 2
        ))

        // Main vinyl body
        context.setFillColor(Colors.vinylBlack)
        context.fillEllipse(in: CGRect(
            x: center.x - recordRadius,
            y: center.y - recordRadius,
            width: recordRadius * 2,
            height: recordRadius * 2
        ))

        // Vinyl grooves (concentric circles with subtle variation)
        context.setStrokeColor(Colors.vinylGroove)
        context.setLineWidth(0.5)

        let grooveCount = 12
        for i in 0..<grooveCount {
            let progress = CGFloat(i) / CGFloat(grooveCount)
            let radius = labelRadius + (recordRadius - labelRadius) * progress * 0.95

            // Vary the opacity slightly for visual interest
            let alpha: CGFloat = 0.3 + (CGFloat(i % 3) * 0.1)
            context.setStrokeColor(CGColor(red: 0.2, green: 0.2, blue: 0.23, alpha: alpha))

            context.strokeEllipse(in: CGRect(
                x: center.x - radius,
                y: center.y - radius,
                width: radius * 2,
                height: radius * 2
            ))
        }

        // Label area with gold gradient
        drawGoldLabel(context: context, center: center, radius: labelRadius)

        // Center hole
        context.setFillColor(Colors.bgDark)
        context.fillEllipse(in: CGRect(
            x: center.x - holeRadius,
            y: center.y - holeRadius,
            width: holeRadius * 2,
            height: holeRadius * 2
        ))

        // Gold ring around hole
        context.setStrokeColor(Colors.goldDeep)
        context.setLineWidth(size * 0.008)
        context.strokeEllipse(in: CGRect(
            x: center.x - holeRadius * 1.5,
            y: center.y - holeRadius * 1.5,
            width: holeRadius * 3,
            height: holeRadius * 3
        ))
    }

    private static func drawGoldLabel(context: CGContext, center: CGPoint, radius: CGFloat) {
        // Gold gradient for label
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
            colors: [Colors.goldBright, Colors.goldDeep, Colors.goldDark] as CFArray,
            locations: [0.0, 0.5, 1.0]
        ) else { return }

        // Clip to circle
        context.saveGState()
        context.addEllipse(in: CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        ))
        context.clip()

        // Draw gradient
        context.drawLinearGradient(
            gradient,
            start: CGPoint(x: center.x - radius, y: center.y + radius),
            end: CGPoint(x: center.x + radius, y: center.y - radius),
            options: []
        )

        context.restoreGState()

        // Subtle inner ring on label
        context.setStrokeColor(CGColor(red: 0.3, green: 0.25, blue: 0.1, alpha: 0.5))
        context.setLineWidth(1.0)
        context.strokeEllipse(in: CGRect(
            x: center.x - radius * 0.7,
            y: center.y - radius * 0.7,
            width: radius * 1.4,
            height: radius * 1.4
        ))
    }

    private static func drawWaveformAccent(context: CGContext, center: CGPoint, size: CGFloat) {
        // Draw a stylized waveform arc around the vinyl
        let waveRadius = size * 0.46
        let barCount = 7
        let barWidth = size * 0.025
        let maxBarHeight = size * 0.08

        // Waveform bars at bottom right
        let startAngle: CGFloat = -.pi * 0.15
        let angleSpan: CGFloat = .pi * 0.3

        context.setFillColor(Colors.goldBright)

        for i in 0..<barCount {
            let progress = CGFloat(i) / CGFloat(barCount - 1)
            let angle = startAngle + angleSpan * progress

            // Varied height for waveform effect
            let heightMultiplier: CGFloat
            switch i {
            case 0, 6: heightMultiplier = 0.4
            case 1, 5: heightMultiplier = 0.7
            case 2, 4: heightMultiplier = 0.9
            case 3: heightMultiplier = 1.0
            default: heightMultiplier = 0.5
            }

            let barHeight = maxBarHeight * heightMultiplier
            let x = center.x + cos(angle) * waveRadius
            let y = center.y + sin(angle) * waveRadius

            // Rotate bar to be perpendicular to radius
            context.saveGState()
            context.translateBy(x: x, y: y)
            context.rotate(by: angle + .pi / 2)

            // Draw rounded bar
            let barRect = CGRect(x: -barWidth/2, y: -barHeight/2, width: barWidth, height: barHeight)
            let barPath = CGPath(roundedRect: barRect, cornerWidth: barWidth/2, cornerHeight: barWidth/2, transform: nil)
            context.addPath(barPath)
            context.fillPath()

            context.restoreGState()
        }
    }

    private static func drawDADMark(context: CGContext, center: CGPoint, size: CGFloat) {
        // Draw "DAD" text on the gold label
        // This is a simplified version - in production you'd use Core Text

        // For now, draw three stylized vertical bars representing "DAD"
        let barWidth = size * 0.015
        let barHeight = size * 0.05
        let spacing = size * 0.025
        let startX = center.x - spacing

        context.setFillColor(Colors.labelDark)

        for i in 0..<3 {
            let x = startX + CGFloat(i) * spacing
            let rect = CGRect(
                x: x - barWidth/2,
                y: center.y - barHeight/2,
                width: barWidth,
                height: barHeight
            )
            context.fill(rect)
        }
    }

    private static func drawHighlight(context: CGContext, rect: CGRect, center: CGPoint, size: CGFloat) {
        // Subtle top-left highlight for depth
        guard let gradient = CGGradient(
            colorsSpace: CGColorSpace(name: CGColorSpace.sRGB),
            colors: [
                CGColor(red: 1, green: 1, blue: 1, alpha: 0.08),
                CGColor(red: 1, green: 1, blue: 1, alpha: 0.0)
            ] as CFArray,
            locations: [0.0, 1.0]
        ) else { return }

        let highlightCenter = CGPoint(x: size * 0.3, y: size * 0.7)
        context.drawRadialGradient(
            gradient,
            startCenter: highlightCenter,
            startRadius: 0,
            endCenter: highlightCenter,
            endRadius: size * 0.5,
            options: []
        )
    }

    enum IconVariant {
        case `default`
        case withWaveform
        case withDAD
    }

    // MARK: - Save Functions

    static func saveImage(_ image: CGImage, to path: String) -> Bool {
        let url = URL(fileURLWithPath: path)

        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            UTType.png.identifier as CFString,
            1,
            nil
        ) else {
            print("Failed to create image destination for \(path)")
            return false
        }

        CGImageDestinationAddImage(destination, image, nil)

        if CGImageDestinationFinalize(destination) {
            print("Saved: \(path)")
            return true
        } else {
            print("Failed to save: \(path)")
            return false
        }
    }
}

// MARK: - Main Execution

let projectPath = FileManager.default.currentDirectoryPath
let outputBase = "\(projectPath)/NotoriousDAD-iOS/NotoriousDAD/Assets.xcassets/AppIcon.appiconset"
let macOutputBase = "\(projectPath)/NotoriousDAD-macOS/NotoriousDAD/Assets.xcassets/AppIcon.appiconset"

print("Generating Notorious DAD App Icons - Electric Gold Theme")
print("=========================================================")
print("")

// Generate iOS icon (1024x1024 master)
print("Generating iOS icon...")
if let icon = IconGenerator.generateIcon(size: 1024, variant: .withWaveform) {
    let iosPath = "\(outputBase)/AppIcon-1024.png"
    if IconGenerator.saveImage(icon, to: iosPath) {
        print("  iOS icon saved successfully!")
    }
}

// Generate macOS icons (various sizes)
print("\nGenerating macOS icons...")
let macSizes = [
    (16, "icon_16x16.png"),
    (32, "icon_16x16@2x.png"),
    (32, "icon_32x32.png"),
    (64, "icon_32x32@2x.png"),
    (128, "icon_128x128.png"),
    (256, "icon_128x128@2x.png"),
    (256, "icon_256x256.png"),
    (512, "icon_256x256@2x.png"),
    (512, "icon_512x512.png"),
    (1024, "icon_512x512@2x.png")
]

for (size, filename) in macSizes {
    if let icon = IconGenerator.generateIcon(size: size, variant: .withWaveform) {
        let path = "\(macOutputBase)/\(filename)"
        _ = IconGenerator.saveImage(icon, to: path)
    }
}

// Also save variant versions for comparison
let variantsPath = "\(projectPath)/icon-variants"
try? FileManager.default.createDirectory(atPath: variantsPath, withIntermediateDirectories: true)

print("\nGenerating variant previews...")
let variants: [(IconGenerator.IconVariant, String)] = [
    (.default, "icon-default.png"),
    (.withWaveform, "icon-waveform.png"),
    (.withDAD, "icon-dad-mark.png")
]

for (variant, filename) in variants {
    if let icon = IconGenerator.generateIcon(size: 512, variant: variant) {
        let path = "\(variantsPath)/\(filename)"
        _ = IconGenerator.saveImage(icon, to: path)
    }
}

print("\n=========================================================")
print("Icon generation complete!")
print("Check: \(variantsPath) for variant previews")
