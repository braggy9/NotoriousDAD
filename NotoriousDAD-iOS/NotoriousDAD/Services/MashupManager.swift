import Foundation
import SwiftUI

// MARK: - Mashup Data Models

struct MashupPair: Identifiable, Codable {
    let id = UUID()
    let track1: MashupTrack
    let track2: MashupTrack
    let compatibility: MashupCompatibility
    let mixingNotes: [String]

    enum CodingKeys: String, CodingKey {
        case track1, track2, compatibility, mixingNotes
    }
}

struct MashupTrack: Codable {
    let id: String
    let name: String
    let artist: String
    let bpm: Double
    let camelotKey: String
    let energy: Double
}

struct MashupCompatibility: Codable {
    let overallScore: Double
    let harmonicScore: Double
    let bpmScore: Double
    let energyScore: Double
    let spectrumScore: Double
    let difficulty: String // "easy", "medium", "hard"
}

struct MashupResponse: Codable {
    let mode: String
    let totalTracks: Int?
    let totalPairs: Int?
    let pairs: [MashupPair]?
    let targetTrack: MashupTrack?
    let bestPartner: MashupPair?
    let message: String?
    let summary: MashupSummary?
}

struct MashupSummary: Codable {
    let easyPairs: Int?
    let mediumPairs: Int?
    let hardPairs: Int?
    let avgCompatibility: Double?
}

// MARK: - Mashup Manager

class MashupManager: ObservableObject {
    static let shared = MashupManager()

    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var mashupPairs: [MashupPair] = []
    @Published var bestPartner: MashupPair?
    @Published var summary: MashupSummary?

    private let baseURL = "https://mixmaster.mixtape.run"

    private init() {}

    // MARK: - Find All Mashup Pairs

    func findMashupPairs(minScore: Int = 75) async {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        do {
            let url = URL(string: "\(baseURL)/api/find-mashups")!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = [
                "mode": "pairs",
                "tracks": "use-library",
                "minCompatibilityScore": minScore
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MashupError.invalidResponse
            }

            if httpResponse.statusCode != 200 {
                throw MashupError.serverError("Server returned status \(httpResponse.statusCode)")
            }

            let decoder = JSONDecoder()
            let result = try decoder.decode(MashupResponse.self, from: data)

            await MainActor.run {
                self.mashupPairs = result.pairs ?? []
                self.summary = result.summary
                self.isLoading = false

                print("🎵 Found \(self.mashupPairs.count) mashup pairs")
            }

        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to load mashups: \(error.localizedDescription)"
                self.isLoading = false
                print("❌ Mashup error: \(error)")
            }
        }
    }

    // MARK: - Find Best Partner for Track

    func findBestPartner(for trackId: String) async {
        await MainActor.run {
            isLoading = true
            errorMessage = nil
            bestPartner = nil
        }

        do {
            let url = URL(string: "\(baseURL)/api/find-mashups?trackId=\(trackId)")!
            var request = URLRequest(url: url)
            request.httpMethod = "GET"

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw MashupError.invalidResponse
            }

            if httpResponse.statusCode == 404 {
                await MainActor.run {
                    self.errorMessage = "Track not found in library"
                    self.isLoading = false
                }
                return
            }

            if httpResponse.statusCode != 200 {
                throw MashupError.serverError("Server returned status \(httpResponse.statusCode)")
            }

            let decoder = JSONDecoder()
            let result = try decoder.decode(MashupResponse.self, from: data)

            await MainActor.run {
                self.bestPartner = result.bestPartner
                self.isLoading = false

                if let partner = result.bestPartner {
                    print("🎵 Found partner: \(partner.track2.name) by \(partner.track2.artist)")
                } else {
                    self.errorMessage = result.message ?? "No compatible partner found"
                }
            }

        } catch {
            await MainActor.run {
                self.errorMessage = "Failed to find partner: \(error.localizedDescription)"
                self.isLoading = false
                print("❌ Partner search error: \(error)")
            }
        }
    }
}

// MARK: - Errors

enum MashupError: LocalizedError {
    case invalidResponse
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid server response"
        case .serverError(let message):
            return message
        }
    }
}
