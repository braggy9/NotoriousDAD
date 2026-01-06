import Foundation
import UserNotifications

/// Manages local notifications for mix generation and server status
@MainActor
class NotificationManager: ObservableObject {
    static let shared = NotificationManager()

    @Published var isAuthorized = false

    private init() {}

    // MARK: - Authorization

    /// Request permission to send notifications
    func requestAuthorization() async {
        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            isAuthorized = granted
            print("🔔 Notification permission: \(granted ? "granted" : "denied")")
        } catch {
            print("🔔 Notification authorization error: \(error)")
            isAuthorized = false
        }
    }

    /// Check current authorization status
    func checkAuthorization() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        isAuthorized = settings.authorizationStatus == .authorized
    }

    // MARK: - Mix Notifications

    /// Notify when a mix generation completes
    func notifyMixComplete(mixName: String, trackCount: Int) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Mix Ready! 🎧"
        content.body = "\(mixName) with \(trackCount) tracks is ready to play"
        content.sound = .default
        content.categoryIdentifier = "MIX_COMPLETE"

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil // Deliver immediately
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("🔔 Failed to schedule notification: \(error)")
            }
        }
    }

    /// Notify when a mix generation fails
    func notifyMixFailed(error: String) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Mix Generation Failed"
        content.body = error
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Server Status Notifications

    /// Notify when server analysis completes
    func notifyAnalysisComplete(tracksAnalyzed: Int) {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Audio Library Ready! 🎵"
        content.body = "\(tracksAnalyzed) tracks analyzed with BPM and key detection"
        content.sound = .default
        content.categoryIdentifier = "ANALYSIS_COMPLETE"

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    /// Notify when server is down
    func notifyServerDown() {
        guard isAuthorized else { return }

        let content = UNMutableNotificationContent()
        content.title = "Server Offline ⚠️"
        content.body = "MixMaster server is not responding"
        content.sound = .defaultCritical
        content.categoryIdentifier = "SERVER_DOWN"

        let request = UNNotificationRequest(
            identifier: "server_down",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    /// Notify when server is back online
    func notifyServerUp() {
        guard isAuthorized else { return }

        // Remove the server down notification
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["server_down"])

        let content = UNMutableNotificationContent()
        content.title = "Server Online ✅"
        content.body = "MixMaster server is back and ready"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().add(request)
    }

    // MARK: - Scheduled Checks

    /// Schedule a background check for server status
    func scheduleServerCheck(interval: TimeInterval = 300) {
        // Note: For actual background execution, would need BGTaskScheduler
        // This is for foreground checks
        Timer.scheduledTimer(withTimeInterval: interval, repeats: true) { [weak self] _ in
            Task {
                await self?.checkServerStatus()
            }
        }
    }

    /// Check server status and notify if changed
    private func checkServerStatus() async {
        let serverURL = "https://mixmaster.mixtape.run/api/generate-mix"

        guard let url = URL(string: serverURL) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "HEAD"
        request.timeoutInterval = 10

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode >= 500 {
                    notifyServerDown()
                }
            }
        } catch {
            // Server not responding
            notifyServerDown()
        }
    }
}
