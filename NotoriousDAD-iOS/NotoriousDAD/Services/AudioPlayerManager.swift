import Foundation
import AVFoundation
import Combine
#if os(iOS)
import UIKit
#endif

/// Manages audio playback for generated mixes with streaming support
class AudioPlayerManager: ObservableObject {
    @Published var isPlaying = false
    @Published var currentTime: TimeInterval = 0
    @Published var duration: TimeInterval = 0
    @Published var downloadProgress: Double = 0
    @Published var isLoading = false
    @Published var error: String?

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var downloadTask: URLSessionDownloadTask?
    private var downloadedFileURL: URL?
    private var downloadURL: URL?  // Store original URL to extract filename

    init() {
        #if os(iOS)
        // Configure audio session for background playback (iOS only)
        do {
            // .playback category + options allows background audio and AirPlay
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetoothA2DP]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            self.error = "Failed to configure audio session: \(error.localizedDescription)"
        }

        // Enable remote control events (lock screen controls)
        UIApplication.shared.beginReceivingRemoteControlEvents()
        #endif
    }

    deinit {
        cleanup()
    }

    /// Stream audio from URL (starts playing immediately while downloading)
    func streamAudio(from url: URL) {
        cleanup()

        isLoading = true
        error = nil

        // Create player item with remote URL
        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)

        // Observe playback time
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.currentTime = time.seconds

            if let duration = self?.player?.currentItem?.duration.seconds,
               !duration.isNaN && !duration.isInfinite {
                self?.duration = duration
            }
        }

        // Observe player status
        player?.currentItem?.publisher(for: \.status)
            .sink { [weak self] status in
                switch status {
                case .readyToPlay:
                    self?.isLoading = false
                case .failed:
                    self?.error = "Failed to load audio"
                    self?.isLoading = false
                default:
                    break
                }
            }
            .store(in: &cancellables)

        // Auto-play when ready
        player?.play()
        isPlaying = true
    }

    /// Download audio file to temporary location (for sharing/saving)
    func downloadAudio(from url: URL, completion: @escaping (Result<URL, Error>) -> Void) {
        print("🔽 AudioPlayerManager: Starting download from: \(url.absoluteString)")

        // If already downloaded, return cached file
        if let cachedURL = downloadedFileURL, FileManager.default.fileExists(atPath: cachedURL.path) {
            print("✅ AudioPlayerManager: Using cached file at: \(cachedURL.path)")
            completion(.success(cachedURL))
            return
        }

        downloadProgress = 0

        // Store original URL to extract filename later
        self.downloadURL = url

        print("📡 AudioPlayerManager: Creating download session...")
        let session = URLSession(configuration: .default, delegate: DownloadDelegate(manager: self), delegateQueue: nil)
        downloadTask = session.downloadTask(with: url)
        downloadTask?.resume()
        print("▶️ AudioPlayerManager: Download task started")

        // Store completion handler
        self.downloadCompletion = completion
    }

    /// Toggle play/pause
    func togglePlayPause() {
        guard let player = player else { return }

        if isPlaying {
            player.pause()
        } else {
            player.play()
        }
        isPlaying.toggle()
    }

    /// Seek to position (0.0 to 1.0)
    func seek(to position: Double) {
        guard let duration = player?.currentItem?.duration.seconds,
              !duration.isNaN && !duration.isInfinite else { return }

        let targetTime = CMTime(seconds: duration * position, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        player?.seek(to: targetTime)
    }

    /// Stop playback and cleanup
    func stop() {
        player?.pause()
        player?.seek(to: .zero)
        isPlaying = false
        currentTime = 0
    }

    /// Get the downloaded file URL (for sharing)
    func getDownloadedFileURL() -> URL? {
        return downloadedFileURL
    }

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private var downloadCompletion: ((Result<URL, Error>) -> Void)?

    private func cleanup() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        player?.pause()
        player = nil
        downloadTask?.cancel()
        downloadTask = nil
    }

    fileprivate func handleDownloadComplete(url: URL) {
        print("✅ AudioPlayerManager: Download completed to temp location: \(url.path)")

        // Extract filename from original download URL query parameter
        var fileName = "mix.mp3"  // Fallback
        if let downloadURL = self.downloadURL,
           let components = URLComponents(url: downloadURL, resolvingAgainstBaseURL: false),
           let queryItems = components.queryItems,
           let fileParam = queryItems.first(where: { $0.name == "file" }),
           let fileValue = fileParam.value {
            fileName = fileValue
            print("📝 AudioPlayerManager: Extracted filename from URL: \(fileName)")
        } else {
            print("⚠️ AudioPlayerManager: Could not extract filename, using default")
        }

        // Move to permanent location in temp directory
        let tempDir = FileManager.default.temporaryDirectory
        let destinationURL = tempDir.appendingPathComponent(fileName)

        print("📁 AudioPlayerManager: Moving to: \(destinationURL.path)")

        do {
            // Remove existing file if present
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
                print("🗑️ AudioPlayerManager: Removed existing file")
            }

            try FileManager.default.moveItem(at: url, to: destinationURL)
            downloadedFileURL = destinationURL

            // Update UI on main thread
            DispatchQueue.main.async {
                self.downloadProgress = 1.0
                print("✅ AudioPlayerManager: File moved successfully, calling completion")
                self.downloadCompletion?(.success(destinationURL))
            }
        } catch {
            print("❌ AudioPlayerManager: Failed to move file: \(error.localizedDescription)")
            DispatchQueue.main.async {
                self.downloadCompletion?(.failure(error))
            }
        }
    }

    fileprivate func handleDownloadProgress(progress: Double) {
        print("📊 AudioPlayerManager: Download progress: \(Int(progress * 100))%")
        DispatchQueue.main.async {
            self.downloadProgress = progress
        }
    }

    fileprivate func handleDownloadError(error: Error) {
        print("❌ AudioPlayerManager: Download error: \(error.localizedDescription)")
        DispatchQueue.main.async {
            self.error = error.localizedDescription
            self.downloadProgress = 0
        }
        downloadCompletion?(.failure(error))
    }
}

// MARK: - Download Delegate

private class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    weak var manager: AudioPlayerManager?

    init(manager: AudioPlayerManager) {
        self.manager = manager
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        manager?.handleDownloadComplete(url: location)
    }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        manager?.handleDownloadProgress(progress: progress)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let error = error {
            manager?.handleDownloadError(error: error)
        }
    }
}
