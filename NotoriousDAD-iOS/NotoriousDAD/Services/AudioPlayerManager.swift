import Foundation
import AVFoundation
import Combine

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

    init() {
        // Configure audio session for playback
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            self.error = "Failed to configure audio session: \(error.localizedDescription)"
        }
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
        // If already downloaded, return cached file
        if let cachedURL = downloadedFileURL, FileManager.default.fileExists(atPath: cachedURL.path) {
            completion(.success(cachedURL))
            return
        }

        downloadProgress = 0

        let session = URLSession(configuration: .default, delegate: DownloadDelegate(manager: self), delegateQueue: nil)
        downloadTask = session.downloadTask(with: url)
        downloadTask?.resume()

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
        // Move to permanent location in temp directory
        let tempDir = FileManager.default.temporaryDirectory
        let fileName = url.lastPathComponent.isEmpty ? "mix.mp3" : url.lastPathComponent
        let destinationURL = tempDir.appendingPathComponent(fileName)

        do {
            // Remove existing file if present
            if FileManager.default.fileExists(atPath: destinationURL.path) {
                try FileManager.default.removeItem(at: destinationURL)
            }

            try FileManager.default.moveItem(at: url, to: destinationURL)
            downloadedFileURL = destinationURL
            downloadProgress = 1.0
            downloadCompletion?(.success(destinationURL))
        } catch {
            downloadCompletion?(.failure(error))
        }
    }

    fileprivate func handleDownloadProgress(progress: Double) {
        DispatchQueue.main.async {
            self.downloadProgress = progress
        }
    }

    fileprivate func handleDownloadError(error: Error) {
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
