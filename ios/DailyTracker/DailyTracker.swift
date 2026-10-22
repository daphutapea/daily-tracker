// Daily Tracker for iPhone: the web build in a native screen, as the Mac app does it
// (macos/main.swift). Pages come from the app itself through the dailytracker:// scheme, so nothing
// has to be hosted; data comes from Supabase over the network, so the phone, the Mac and a browser
// share everything. Reminders and summaries become iPhone notifications that iOS keeps, so they
// arrive with the app closed, and a background refresh keeps them in step with changes made
// elsewhere while the app stays closed.

import BackgroundTasks
import JavaScriptCore
import Security
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
/// The background refresh iOS runs now and then (Info.plist lists it).
private let refreshTaskID = "com.daphutapea.dailytracker.refresh"

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
    // Set up before the first screen, so a notification that launched the app is handled. The page
    // itself only loads when a screen appears, so a background launch never starts it.
    Bridge.shared.startNotifications()
    Refresher.shared.register()
    if ProcessInfo.processInfo.arguments.contains("--refresh-now") {
      // For checking the background refresh by hand: npm run iphone -- --simulator, then
      // xcrun simctl launch booted com.daphutapea.dailytracker --refresh-now
      Task { print("REFRESH:", await Refresher.shared.refresh()) }
    }
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

  func sceneDidEnterBackground(_ scene: UIScene) {
    Refresher.shared.schedule()
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

  /// Made when the first screen appears, never in a background launch, so the page can't renew the
  /// sign-in while the background refresh does.
  lazy var webView: WKWebView = makeWebView()
  weak var host: TrackerViewController?
  private(set) var surface: UIColor = .systemBackground
  private(set) var surfaceIsDark = false
  /// True once the page has mounted and said hello. Until then, messages for it wait here.
  private var pageListening = false
  private var heldForPage: [[String: String]] = []

  private func makeWebView() -> WKWebView {
    let configuration = WKWebViewConfiguration()
    let webRoot = Bundle.main.resourceURL!.appending(path: "web")
    configuration.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: appScheme)
    configuration.websiteDataStore = .default()
    configuration.userContentController.addUserScript(
      WKUserScript(source: pageSetup, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    )
    configuration.userContentController.add(self, name: "dailyTracker")
    // The sign-in, kept in the Keychain for the page (src/lib/native.ts, appSessionStorage).
    configuration.userContentController.addScriptMessageHandler(SessionHandler(), contentWorld: .page, name: "dailyTrackerSession")
    let webView = WKWebView(frame: .zero, configuration: configuration)
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
    return webView
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
    case "native":
      // What the background refresh needs: this phone's switches and where the data is.
      let defaults = UserDefaults.standard
      if let switches = body["switches"] as? [String: Bool] {
        defaults.set(switches["reminders"] ?? true, forKey: "RemindersOn")
        defaults.set(switches["badge"] ?? true, forKey: "BadgeOn")
      }
      if let url = body["supabaseUrl"] as? String, let key = body["supabaseKey"] as? String {
        defaults.set(url, forKey: "SupabaseURL")
        defaults.set(key, forKey: "SupabaseKey")
      }
      Refresher.shared.schedule()
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
  fileprivate func schedule(_ reminders: [Reminder]) async {
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
  fileprivate func clearFinished(keeping openTasks: Set<String>) async {
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

// MARK: The sign-in, kept in the Keychain

/// The Supabase session the page keeps through appSessionStorage, under the same key it would use in
/// localStorage. The background refresh reads and renews the same item, so there is only one.
enum SessionStore {
  private static let service = "Daily Tracker sign-in"

  private static func query(_ key: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
  }

  static func get(_ key: String) -> String? {
    var q = query(key)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &result) == errSecSuccess, let data = result as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  /// False when the Keychain refused it, so the page keeps the sign-in itself rather than lose it.
  @discardableResult
  static func set(_ key: String, _ value: String) -> Bool {
    let data = Data(value.utf8)
    // Readable after the first unlock, so a background refresh can use it while the phone is locked.
    let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock]
    var status = SecItemUpdate(query(key) as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      status = SecItemAdd(query(key).merging(attributes) { $1 } as CFDictionary, nil)
    }
    return status == errSecSuccess
  }

  static func remove(_ key: String) {
    SecItemDelete(query(key) as CFDictionary)
  }
}

/// Answers the page's appSessionStorage: get, set and remove, each with a reply.
final class SessionHandler: NSObject, WKScriptMessageHandlerWithReply {
  func userContentController(
    _ userContentController: WKUserContentController,
    didReceive message: WKScriptMessage
  ) async -> (Any?, String?) {
    guard let body = message.body as? [String: Any], let op = body["op"] as? String, let key = body["key"] as? String else {
      return (nil, "bad request")
    }
    switch op {
    case "get":
      return (SessionStore.get(key) ?? NSNull(), nil)
    case "set":
      return SessionStore.set(key, body["value"] as? String ?? "") ? (NSNull(), nil) : (nil, "the Keychain refused it")
    case "remove":
      SessionStore.remove(key)
      // Signed out: reminders for this account stop.
      let center = UNUserNotificationCenter.current()
      center.removeAllPendingNotificationRequests()
      try? await center.setBadgeCount(0)
      return (NSNull(), nil)
    default:
      return (nil, "unknown op")
    }
  }
}

// MARK: Background refresh

/// Now and then, with the app closed, iOS wakes it for a few seconds. The refresh fetches your tasks,
/// events and summary times itself, runs the same planner the page uses (build/native/plan.js, from
/// src/native/plan.ts), and reschedules the notifications, so a change made on your Mac reaches this
/// iPhone without opening the app.
@MainActor
final class Refresher {
  static let shared = Refresher()

  func register() {
    BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshTaskID, using: .main) { task in
      MainActor.assumeIsolated {
        guard let task = task as? BGAppRefreshTask else { return }
        Refresher.shared.handle(task)
      }
    }
  }

  /// Asks for the next refresh, in about half an hour at the earliest. iOS decides when.
  func schedule() {
    let request = BGAppRefreshTaskRequest(identifier: refreshTaskID)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 30 * 60)
    try? BGTaskScheduler.shared.submit(request)
  }

  private func handle(_ task: BGAppRefreshTask) {
    schedule()
    let work = Task { await refresh() }
    task.expirationHandler = { work.cancel() }
    Task {
      let done = await work.value
      task.setTaskCompleted(success: done == "ok")
    }
  }

  /// One refresh. Returns "ok", or why it stopped, for the --refresh-now check.
  func refresh() async -> String {
    let defaults = UserDefaults.standard
    guard let base = defaults.string(forKey: "SupabaseURL"), let apiKey = defaults.string(forKey: "SupabaseKey"),
      let host = URL(string: base)?.host(), let ref = host.split(separator: ".").first
    else { return "not set up: open the app once" }
    let storageKey = "sb-\(ref)-auth-token"
    guard var session = SessionStore.get(storageKey).flatMap(Self.json) else { return "signed out" }

    // Renew the sign-in when it's about to expire, and keep the new one for the page too.
    let expiresAt = session["expires_at"] as? Double ?? 0
    // --renew forces this path, for checking it by hand with --refresh-now.
    let forced = ProcessInfo.processInfo.arguments.contains("--renew")
    if forced || expiresAt - Date().timeIntervalSince1970 < 120 {
      guard let refreshToken = session["refresh_token"] as? String,
        let renewed = await post("\(base)/auth/v1/token?grant_type=refresh_token", apiKey: apiKey, body: ["refresh_token": refreshToken]),
        renewed["access_token"] is String, let text = Self.text(renewed)
      else { return "couldn't renew the sign-in" }
      SessionStore.set(storageKey, text)
      session = renewed
    }
    guard let token = session["access_token"] as? String else { return "no access token" }

    // Fetched side by side as raw bytes, which can cross threads; read once all three are in.
    async let tasksData = Self.load("\(base)/rest/v1/tasks?select=*", apiKey: apiKey, token: token)
    async let eventsData = Self.load("\(base)/rest/v1/events?select=*", apiKey: apiKey, token: token)
    async let profilesData = Self.load("\(base)/rest/v1/profiles?select=*", apiKey: apiKey, token: token)
    let (t, e, pr) = await (tasksData, eventsData, profilesData)
    guard let tasks = Self.rows(t), let events = Self.rows(e), let profile = Self.rows(pr)?.first else { return "couldn't load data" }
    if Task.isCancelled { return "out of time" }

    let input: [String: Any] = [
      "tasks": tasks, "events": events, "profile": profile,
      "switches": ["reminders": defaults.object(forKey: "RemindersOn") as? Bool ?? true, "badge": defaults.object(forKey: "BadgeOn") as? Bool ?? true],
      "now": Date().timeIntervalSince1970 * 1000,
    ]
    guard let plan = Self.plan(input) else { return "planner failed" }
    let reminders = (plan["reminders"] as? [Any] ?? []).compactMap(Reminder.init)
    let openTasks = Set(plan["openTasks"] as? [String] ?? [])
    await Bridge.shared.schedule(reminders)
    await Bridge.shared.clearFinished(keeping: openTasks)
    try? await UNUserNotificationCenter.current().setBadgeCount(plan["badge"] as? Int ?? 0)
    return "ok"
  }

  /// Runs DailyTrackerPlan.plan from the bundled script, with JSON in and JSON out.
  private static func plan(_ input: [String: Any]) -> [String: Any]? {
    guard let url = Bundle.main.url(forResource: "plan", withExtension: "js"), let script = try? String(contentsOf: url, encoding: .utf8),
      let context = JSContext(), let inputText = text(input)
    else { return nil }
    context.evaluateScript(script)
    let result = context.objectForKeyedSubscript("DailyTrackerPlan")?.objectForKeyedSubscript("plan")?.call(withArguments: [inputText])
    guard context.exception == nil, let output = result?.toString() else { return nil }
    return json(output)
  }

  nonisolated private static func load(_ url: String, apiKey: String, token: String) async -> Data? {
    guard let url = URL(string: url) else { return nil }
    var request = URLRequest(url: url)
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    guard let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return data
  }

  private static func rows(_ data: Data?) -> [[String: Any]]? {
    data.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [[String: Any]] }
  }

  private func post(_ url: String, apiKey: String, body: [String: Any]) async -> [String: Any]? {
    guard let url = URL(string: url), let payload = try? JSONSerialization.data(withJSONObject: body) else { return nil }
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.httpBody = payload
    request.setValue(apiKey, forHTTPHeaderField: "apikey")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    guard let (data, response) = try? await URLSession.shared.data(for: request), (response as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
  }

  private static func json(_ text: String) -> [String: Any]? {
    (try? JSONSerialization.jsonObject(with: Data(text.utf8))) as? [String: Any]
  }

  private static func text(_ object: [String: Any]) -> String? {
    (try? JSONSerialization.data(withJSONObject: object)).flatMap { String(data: $0, encoding: .utf8) }
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
