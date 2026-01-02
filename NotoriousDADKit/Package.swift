// swift-tools-version: 5.9
// The swift-tools-version declares the minimum version of Swift required to build this package.

import PackageDescription

let package = Package(
    name: "NotoriousDADKit",
    platforms: [
        .macOS(.v13),
        .iOS(.v16)
    ],
    products: [
        .library(
            name: "NotoriousDADKit",
            targets: ["NotoriousDADKit"]
        ),
    ],
    dependencies: [
        // Spotify API client - supports all endpoints
        .package(url: "https://github.com/Peter-Schorn/SpotifyAPI.git", from: "3.0.0"),
    ],
    targets: [
        .target(
            name: "NotoriousDADKit",
            dependencies: [
                .product(name: "SpotifyAPI", package: "SpotifyAPI"),
            ],
            path: "Sources/NotoriousDADKit"
        ),
        .testTarget(
            name: "NotoriousDADKitTests",
            dependencies: ["NotoriousDADKit"],
            path: "Tests/NotoriousDADKitTests"
        ),
    ]
)
