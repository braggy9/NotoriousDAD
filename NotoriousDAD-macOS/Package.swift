// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "NotoriousDAD",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(
            name: "NotoriousDAD",
            targets: ["NotoriousDAD"]
        ),
    ],
    dependencies: [
        // Local package for core logic
        .package(path: "../NotoriousDADKit"),
        // Spotify API
        .package(url: "https://github.com/Peter-Schorn/SpotifyAPI.git", from: "3.0.0"),
    ],
    targets: [
        .executableTarget(
            name: "NotoriousDAD",
            dependencies: [
                "NotoriousDADKit",
                .product(name: "SpotifyAPI", package: "SpotifyAPI"),
            ],
            path: "Sources/NotoriousDAD"
        ),
    ]
)
