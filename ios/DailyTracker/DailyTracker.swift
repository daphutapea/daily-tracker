// Daily Tracker for iPhone: the web build in a native screen, as the Mac app does it
// (macos/main.swift). Pages come from the app itself through the dailytracker:// scheme, so nothing
// has to be hosted; data comes from Supabase over the network, so the phone, the Mac and a browser
// share everything. Reminders and summaries become iPhone notifications that iOS keeps, so they
// arrive with the app closed.

import UIKit
import UserNotifications
import WebKit

private let appScheme = "dailytracker"
private let startURL = URL(string: "\(appScheme)://app/")!
/// Reminders scheduled from the page carry this prefix, so a refresh replaces them and nothing else.
private let reminderPrefix = "reminder:"
/// A snoozed reminder is a new request with this prefix, so a refresh keeps it unless its task is done.
private let snoozePrefix = "snooze:"
/// iOS keeps at most 64 notifications per app; this leaves room for snoozes.
private let maxScheduled = 56

/// Runs before the page's own scripts: tells the page it's in the iPhone app (src/lib/native.ts), and
/// reports the page's background whenever the theme changes, so the strip behind the status bar
/// matches it.
private let pageSetup = """
  window.dailyTrackerPlatform = 'ios';
  (function () {
    function send() {
      var color = getComputedStyle(document.body || document.documentElement).backgroundColor;
      if (!color || color === 'rgba(0, 0, 0, 0)') color = getComputedStyle(document.documentElement).backgroundColor;
      window.webkit.messageHandlers.dailyTracker.postMessage({ type: 'surface', color: color });
    }
    function soon() { requestAnimationFrame(send); }
    new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-intro', 'class'] });
    document.addEventListener('DOMContentLoaded', soon);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', soon);
  })();
  """

// MARK: App and screen

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Set up before the first screen, so a notification that launched the app is handled.
    Bridge.shared.startNotifications()
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting session: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(name: nil, sessionRole: session.role)
    configuration.delegateClass = SceneDelegate.self
    return configuration
  }
}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let scene = scene as? UIWindowScene else { return }
    let window = UIWindow(windowScene: scene)
    window.rootViewController = TrackerViewController()
    window.makeKeyAndVisible()
    self.window = window
  }
}

/// The page fills the screen below the status bar and runs under the home indicator; the page pads
/// itself there with env(safe-area-inset-bottom). The strip behind the status bar takes the page's
/// background, and the status bar's text is light or dark to suit it.
final class TrackerViewController: UIViewController {
  override func loadView() {
    view = UIView()
    view.backgroundColor = Bridge.shared.surface
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let webView = Bridge.shared.webView
    webView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
    ])
    Bridge.shared.host = self
  }

  override var preferredStatusBarStyle: UIStatusBarStyle {
    Bridge.shared.surfaceIsDark ? .lightContent : .darkContent
  }

  func surfaceChanged() {
    view.backgroundColor = Bridge.shared.surface
    setNeedsStatusBarAppearanceUpdate()
  }
}

// MARK: The page

/// Serves files from the bundled web build. Unknown paths without an extension get index.html,
/// so reloading on /tasks or /notes/<id> lands on the right page. Same as the Mac app's.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  private let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    var file = resolve(url.path)
    if file == nil, url.pathExtension.isEmpty {
      file = root.appending(path: "index.html")
    }
    guard let file, let data = try? Data(contentsOf: file) else {
      respond(task, url: url, status: 404, type: "text/plain", data: Data())
      return
    }
    respond(task, url: url, status: 200, type: Self.mimeType(for: file.pathExtension), data: data)
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}

  /// Maps a request path to a file inside the web root, refusing anything that escapes it.
  private func resolve(_ path: String) -> URL? {
    let relative = path == "/" || path.isEmpty ? "index.html" : String(path.drop(while: { $0 == "/" }))
    let candidate = root.appending(path: relative).standardizedFileURL
    guard candidate.path.hasPrefix(root.path + "/") else { return nil }
    var isDirectory: ObjCBool = false
    guard FileManager.default.fileExists(atPath: candidate.path, isDirectory: &isDirectory), !isDirectory.boolValue else {
      return nil
    }
    return candidate
  }

  private func respond(_ task: any WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
    let headers = [
      "Content-Type": type,
      "Content-Length": String(data.count),
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    ]
    let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    task.didReceive(response)
    task.didReceive(data)
    task.didFinish()
  }

  private static func mimeType(for ext: String) -> String {
    switch ext.lowercased() {
    case "html": "text/html; charset=utf-8"
    case "js", "mjs": "text/javascript; charset=utf-8"
    case "css": "text/css; charset=utf-8"
    case "json", "map": "application/json"
    case "webmanifest": "application/manifest+json"
    case "svg": "image/svg+xml"
    case "png": "image/png"
    case "ico": "image/x-icon"
    case "woff2": "font/woff2"
    case "woff": "font/woff"
    case "txt": "text/plain; charset=utf-8"
    default: "application/octet-stream"
    }
  }
}

/// A reminder the page handed over (src/lib/native.ts). iOS keeps it and shows it at `at`.
private struct Reminder: Sendable {
  let id: String
  let kind: String
  let taskId: String?
  let title: String
  let body: String
  let at: Date
  let path: String

  init?(_ raw: Any) {
    guard let d = raw as? [String: Any],
      let id = d["id"] as? String, let kind = d["kind"] as? String, let title = d["title"] as? String,
      let body = d["body"] as? String, let at = d["at"] as? Double, let path = d["path"] as? String
    else { return nil }
    self.id = id
    self.kind = kind
    self.taskId = d["taskId"] as? String
    self.title = title
    self.body = body
    self.at = Date(timeIntervalSince1970: at / 1000)
    self.path = path
  }
}

/// The web view and everything the page asks of the phone: notifications, the icon badge, sharing a
/// file, and links that leave the app.
@MainActor
final class Bridge: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
  static let shared = Bridge()

  let webView: WKWebView
  weak var host: TrackerViewController?
  private(set) var surface: UIColor = .systemBackground
  private(set) var surfaceIsDark = false
  /// True once the page has mounted and said hello. Until then, messages for it wait here.
  private var pageListening = false
  private var heldForPage: [[String: String]] = []

  override init() {
    let configuration = WKWebViewConfiguration()
    let webRoot = Bundle.main.resourceURL!.appending(path: "web")
    configuration.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: appScheme)
    configuration.websiteDataStore = .default()  // keeps you signed in between launches
    configuration.userContentController.addUserScript(
      WKUserScript(source: pageSetup, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    webView = WKWebView(frame: .zero, configuration: configuration)
    super.init()
    webView.configuration.userContentController.add(self, name: "dailyTracker")
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    // A long press on a link inside the app would preview a dailytracker:// page, which means nothing.
    webView.allowsLinkPreview = false
    // The page pads itself away from the home indicator, so the scroll view must not add insets too.
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .clear
    webView.isInspectable = true  // Safari > Develop can inspect the page, as with the Mac app
    webView.load(URLRequest(url: startURL))
  }

  // MARK: Navigation

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    pageListening = false
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }

  /// The app's own pages stay in the app; every other link opens in Safari or the app it belongs to.
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
    guard let url = navigationAction.request.url else { return .cancel }
    if url.scheme == appScheme || url.scheme == "about" { return .allow }
    await UIApplication.shared.open(url)
    return .cancel
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url { UIApplication.shared.open(url) }
    return nil
  }

  // MARK: JavaScript dialogs (the app asks before discarding changes)

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
    await withCheckedContinuation { continuation in
      guard let presenter = presenter() else { return continuation.resume(returning: false) }
      let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
      alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in continuation.resume(returning: false) })
      alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in continuation.resume(returning: true) })
      presenter.present(alert, animated: true)
    }
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
    await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
      guard let presenter = presenter() else { return continuation.resume() }
      let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
      alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in continuation.resume() })
      presenter.present(alert, animated: true)
    }
  }

  private func presenter() -> UIViewController? {
    var top: UIViewController? = host
    while let next = top?.presentedViewController { top = next }
    return top
  }

  // MARK: Messages from and to the page (src/lib/native.ts)

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "hello":
      pageListening = true
      let held = heldForPage
      heldForPage = []
      held.forEach(sendToPage)
      Task { await reportPermission() }
    case "surface":
      if let css = body["color"] as? String, let color = UIColor(css: css) { setSurface(color) }
    case "reminders":
      let reminders = (body["reminders"] as? [Any] ?? []).compactMap(Reminder.init)
      let openTasks = (body["openTasks"] as? [String]).map(Set.init)
      Task {
        await schedule(reminders)
        if let openTasks { await clearFinished(keeping: openTasks) }
      }
    case "today":
      let badge = body["badge"] as? Int ?? 0
      UNUserNotificationCenter.current().setBadgeCount(badge)
    case "requestPermission":
      Task { await requestPermission() }
    case "openNotificationSettings":
      if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
    case "testNotification":
      sendTestNotification()
    case "save":
      share(filename: body["filename"] as? String ?? "daily-tracker.json", content: body["content"] as? String ?? "")
    default:
      break  // backups, Show backups and Calendar settings are the Mac app's
    }
  }

  private func sendToPage(_ message: [String: String]) {
    guard pageListening else {
      heldForPage.append(message)
      return
    }
    guard let data = try? JSONSerialization.data(withJSONObject: message), let json = String(data: data, encoding: .utf8)
    else { return }
    webView.evaluateJavaScript("window.dailyTrackerNative && window.dailyTrackerNative(\(json))", completionHandler: nil)
  }

  private func setSurface(_ color: UIColor) {
    surface = color
    surfaceIsDark = color.luminance < 0.5
    host?.surfaceChanged()
  }

  /// Download a copy: the share sheet, from which it can go to Files, AirDrop or Mail.
  private func share(filename: String, content: String) {
    let url = FileManager.default.temporaryDirectory.appending(path: filename)
    guard (try? content.write(to: url, atomically: true, encoding: .utf8)) != nil, let presenter = presenter() else { return }
    let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in
      MainActor.assumeIsolated {
        if completed { self?.sendToPage(["type": "saved", "name": filename]) }
      }
    }
    sheet.popoverPresentationController?.sourceView = webView
    presenter.present(sheet, animated: true)
  }

  // MARK: Notifications

  func startNotifications() {
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: "task",
        actions: [
          // Opens the app, so the page is there to mark it done.
          UNNotificationAction(identifier: "done", title: "Mark done", options: [.foreground]),
          UNNotificationAction(identifier: "snooze", title: "Snooze 10 minutes", options: []),
        ],
        intentIdentifiers: []
      ),
      UNNotificationCategory(
        identifier: "event",
        actions: [UNNotificationAction(identifier: "snooze", title: "Snooze 10 minutes", options: [])],
        intentIdentifiers: []
      ),
    ])
  }

  private func authorizationStatus() async -> UNAuthorizationStatus {
    await withCheckedContinuation { continuation in
      UNUserNotificationCenter.current().getNotificationSettings { continuation.resume(returning: $0.authorizationStatus) }
    }
  }

  private func reportPermission() async {
    let status =
      switch await authorizationStatus() {
      case .authorized, .provisional, .ephemeral: "granted"
      case .denied: "denied"
      default: "undetermined"
      }
    sendToPage(["type": "permission", "status": status])
  }

  private func requestPermission() async {
    _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
    await reportPermission()
  }

  /// Replaces every reminder handed over earlier with the page's current list, nearest first, up to
  /// what iOS will hold.
  private func schedule(_ reminders: [Reminder]) async {
    let center = UNUserNotificationCenter.current()
    let upcoming = reminders.filter { $0.at > Date() }.sorted { $0.at < $1.at }
    if !upcoming.isEmpty, await authorizationStatus() == .notDetermined {
      await requestPermission()
    }
    let stale: [String] = await withCheckedContinuation { continuation in
      center.getPendingNotificationRequests { requests in
        continuation.resume(returning: requests.map(\.identifier).filter { $0.hasPrefix(reminderPrefix) })
      }
    }
    center.removePendingNotificationRequests(withIdentifiers: stale)

    for reminder in upcoming.prefix(maxScheduled) {
      let content = UNMutableNotificationContent()
      content.title = reminder.title
      content.body = reminder.body
      content.sound = .default
      content.categoryIdentifier = reminder.kind
      content.userInfo = ["path": reminder.path, "taskId": reminder.taskId ?? ""]
      let when = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: reminder.at)
      let request = UNNotificationRequest(
        identifier: reminderPrefix + reminder.id,
        content: content,
        trigger: UNCalendarNotificationTrigger(dateMatching: when, repeats: false)
      )
      try? await center.add(request)
    }
  }

  /// A task finished or deleted since its reminder went off takes that reminder with it: a snoozed copy
  /// won't come back, and the one still in Notification Center goes. Same as the Mac app.
  private func clearFinished(keeping openTasks: Set<String>) async {
    let center = UNUserNotificationCenter.current()
    let isFinished: @Sendable (UNNotificationRequest) -> Bool = { request in
      guard let taskId = request.content.userInfo["taskId"] as? String, !taskId.isEmpty else { return false }
      return !openTasks.contains(taskId)
    }
    let snoozed: [String] = await withCheckedContinuation { continuation in
      center.getPendingNotificationRequests { requests in
        continuation.resume(returning: requests.filter { $0.identifier.hasPrefix(snoozePrefix) && isFinished($0) }.map(\.identifier))
      }
    }
    center.removePendingNotificationRequests(withIdentifiers: snoozed)
    let shown: [String] = await withCheckedContinuation { continuation in
      center.getDeliveredNotifications { notifications in
        continuation.resume(returning: notifications.map(\.request).filter(isFinished).map(\.identifier))
      }
    }
    center.removeDeliveredNotifications(withIdentifiers: shown)
  }

  private func sendTestNotification() {
    let content = UNMutableNotificationContent()
    content.title = "Daily Tracker"
    content.body = "Notifications are working. Reminders will look like this."
    content.sound = .default
    content.userInfo = ["test": true]
    let request = UNNotificationRequest(identifier: "test", content: content, trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false))
    UNUserNotificationCenter.current().add(request)
  }

  /// While you're in the app, the page shows the reminder itself, so iOS stays quiet. The test
  /// notification always shows, since showing it is the point.
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    notification.request.content.userInfo["test"] != nil ? [.banner, .sound] : []
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let request = response.notification.request
    let path = request.content.userInfo["path"] as? String
    let taskId = request.content.userInfo["taskId"] as? String
    switch response.actionIdentifier {
    case "snooze":
      guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return }
      let snoozed = UNNotificationRequest(
        identifier: "\(snoozePrefix)\(request.identifier):\(Date().timeIntervalSince1970)",
        content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 600, repeats: false)
      )
      try? await center.add(snoozed)
    case "done":
      guard let taskId, !taskId.isEmpty else { return }
      await MainActor.run { self.sendToPage(["type": "done", "taskId": taskId]) }
    case UNNotificationDefaultActionIdentifier:
      if let path { await MainActor.run { self.sendToPage(["type": "open", "path": path]) } }
    default:
      break
    }
  }
}

private extension UIColor {
  /// Reads "rgb(242, 245, 243)" or "rgba(…, 1)", the form getComputedStyle reports.
  convenience init?(css: String) {
    let numbers = css.split(whereSeparator: { !"0123456789.".contains($0) }).compactMap { Double($0) }
    guard numbers.count >= 3 else { return nil }
    let alpha = numbers.count >= 4 ? numbers[3] : 1
    guard alpha > 0 else { return nil }
    self.init(red: numbers[0] / 255, green: numbers[1] / 255, blue: numbers[2] / 255, alpha: alpha)
  }

  /// Relative luminance, 0 for black to 1 for white, near enough to pick light or dark text.
  var luminance: CGFloat {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    getRed(&r, green: &g, blue: &b, alpha: &a)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
}
