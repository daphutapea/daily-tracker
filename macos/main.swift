// Daily Tracker for macOS: a native window around the web build in Resources/web.
// Pages are served from the app bundle through the dailytracker:// scheme; data still comes
// from Supabase over the network, so the app and the browser version share everything.

import AppKit
import Carbon.HIToolbox
import EventKit
import OSLog
import ServiceManagement
import UniformTypeIdentifiers
import UserNotifications
import WebKit

private let appScheme = "dailytracker"
private let startURL = URL(string: "\(appScheme)://app/")!

/// `--smoke-test`: load the page without showing a window, print the visible text, and quit.
/// The build script runs this before installing, so a broken build never replaces a working app.
private let isSmokeTest = CommandLine.arguments.contains("--smoke-test")

/// Serves files from the bundled web build. Unknown paths without an extension get index.html,
/// so reloading on /tasks or /notes/<id> lands on the right page.
@MainActor
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

/// A reminder the page handed over (src/lib/native.ts). macOS keeps it and shows it at `at`, even if
/// the window is closed or the app has quit.
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

/// Reminders scheduled from the page carry this prefix, so a refresh replaces them and nothing else.
private let reminderPrefix = "reminder:"

/// One line of the menu bar's Today list (src/lib/reminders.ts, todaySummary).
private struct TodayItem {
  let when: String
  let title: String
  let path: String
}

private let log = Logger(subsystem: "com.daphutapea.dailytracker", category: "app")

/// Writes a line to the system log and to ~/Library/Logs/DailyTracker.log, which Console.app lists
/// under Log Reports and which can be read without special permissions.
private func note(_ message: String) {
  log.notice("\(message, privacy: .public)")
  let url = FileManager.default.homeDirectoryForCurrentUser.appending(path: "Library/Logs/DailyTracker.log")
  let line = Data("\(ISO8601DateFormatter().string(from: Date())) \(message)\n".utf8)
  if let handle = try? FileHandle(forWritingTo: url) {
    _ = try? handle.seekToEnd()
    try? handle.write(contentsOf: line)
    try? handle.close()
  } else {
    try? line.write(to: url)
  }
}

/// ⌥⌘T from any app opens Quick add. Carbon's hot keys need no Accessibility permission, unlike
/// watching every key press. The handler is a C function, so it reaches the app through `shared`.
@MainActor
private enum QuickAddHotKey {
  static weak var shared: AppDelegate?
  private static var ref: EventHotKeyRef?

  static func register(for delegate: AppDelegate) {
    shared = delegate
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    // The event dispatcher target, as the HotKey library uses, receives the press whichever app is
    // in front; the application target is only guaranteed while this app is active.
    let handler = InstallEventHandler(GetEventDispatcherTarget(), { _, _, _ in
      note("⌥⌘T pressed")
      DispatchQueue.main.async {
        MainActor.assumeIsolated { QuickAddHotKey.shared?.quickAddFromAnywhere() }
      }
      return noErr
    }, 1, &spec, nil, nil)
    let id = EventHotKeyID(signature: OSType(0x4454_4B31), id: 1)  // "DTK1"
    let status = RegisterEventHotKey(
      UInt32(kVK_ANSI_T), UInt32(cmdKey | optionKey), id, GetEventDispatcherTarget(), 0, &ref)
    note("⌥⌘T shortcut: handler \(handler), registration \(status) (0 means ready)")
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler,
  UNUserNotificationCenterDelegate
{
  private var window: NSWindow!
  private var webView: WKWebView!
  private var statusItem: NSStatusItem?
  private var nextReminder: Reminder?
  private var todayItems: [TodayItem] = []
  private var overdueCount = 0
  /// For iPhone alerts: a "Daily Tracker" calendar in iCloud, which brings its alerts to the phone.
  private let eventStore = EKEventStore()
  private var calendarWasOn = false
  private var hasShownWindow = false
  /// True once the page has mounted and said hello. Until then, messages for it wait in `heldForPage`.
  private var pageListening = false
  private var heldForPage: [[String: String]] = []

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = makeMainMenu()

    let webRoot = Bundle.main.resourceURL!.appending(path: "web")
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: appScheme)
    configuration.websiteDataStore = .default()  // keeps you signed in between launches
    configuration.userContentController.add(self, name: "dailyTracker")

    webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true

    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Daily Tracker"
    window.minSize = NSSize(width: 420, height: 560)
    window.contentView = webView
    window.isReleasedWhenClosed = false
    if !window.setFrameUsingName("DailyTrackerMain") { window.center() }
    window.setFrameAutosaveName("DailyTrackerMain")

    webView.load(URLRequest(url: startURL))

    if isSmokeTest {
      Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { _ in
        print("SMOKE TEST FAILED: the page did not finish loading")
        exit(1)
      }
      return
    }

    let center = UNUserNotificationCenter.current()
    center.delegate = self
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: "task",
        actions: [
          UNNotificationAction(identifier: "done", title: "Mark done", options: []),
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
    makeStatusItem()
    QuickAddHotKey.register(for: self)

    // Stay hidden until the first page paints so dark mode never flashes white. The timer is a
    // fallback in case the load is slow.
    Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated { self?.showWindowOnce() }
    }
  }

  /// Waits for React to render, then prints what a person would read on the first screen.
  private func reportSmokeTest() async {
    try? await Task.sleep(for: .seconds(3))
    let text = (try? await webView.evaluateJavaScript("document.getElementById('root')?.innerText ?? ''")) as? String ?? ""
    let summary = text.split(whereSeparator: \.isNewline).prefix(6).joined(separator: " | ")
    if summary.isEmpty {
      print("SMOKE TEST FAILED: the page rendered nothing")
      exit(1)
    }
    // Reminders, the menu bar and Save all depend on the page seeing this message handler.
    let bridge = (try? await webView.evaluateJavaScript("typeof window.webkit?.messageHandlers?.dailyTracker?.postMessage")) as? String
    if bridge != "function" {
      print("SMOKE TEST FAILED: the page can't reach the app (no dailyTracker message handler)")
      exit(1)
    }
    print("SMOKE TEST OK: \(summary)")
    exit(0)
  }

  /// Closing the window keeps the app running in the menu bar, so reminders stay in step with your
  /// data. Quit with Cmd+Q; reminders already handed to macOS still arrive after that.
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

  func applicationWillTerminate(_ notification: Notification) {
    if !isSmokeTest { note("Quit") }
  }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    bringToFront()
    return true
  }

  /// The first show after launch. Later page loads (a reload, a crashed web process) leave a closed
  /// window closed.
  private func showWindowOnce() {
    guard !hasShownWindow else { return }
    hasShownWindow = true
    bringToFront()
  }

  private func bringToFront() {
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
  }

  @objc private func reloadPage(_ sender: Any?) {
    webView.reload()
  }

  // MARK: Navigation

  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    pageListening = false
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if isSmokeTest {
      Task { await reportSmokeTest() }
      return
    }
    showWindowOnce()
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
    if isSmokeTest {
      print("SMOKE TEST FAILED: \(error.localizedDescription)")
      exit(1)
    }
    showWindowOnce()
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }

  /// The app's own pages stay in the window; every other link (quick links, Telegram, docs) opens
  /// in your default browser.
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
    guard let url = navigationAction.request.url else { return .cancel }
    if url.scheme == appScheme || url.scheme == "about" { return .allow }
    NSWorkspace.shared.open(url)
    return .cancel
  }

  func webView(
    _ webView: WKWebView,
    createWebViewWith configuration: WKWebViewConfiguration,
    for navigationAction: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = navigationAction.request.url { NSWorkspace.shared.open(url) }
    return nil
  }

  // MARK: JavaScript dialogs (the app asks before deleting or discarding changes)

  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async -> Bool {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    alert.addButton(withTitle: "Cancel")
    return await alert.beginSheetModal(for: window) == .alertFirstButtonReturn
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo) async {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    _ = await alert.beginSheetModal(for: window)
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
    case "reminders":
      let reminders = (body["reminders"] as? [Any] ?? []).compactMap(Reminder.init)
      let calendar = body["calendar"] as? Bool ?? false
      Task { await schedule(reminders, calendar: calendar) }
    case "today":
      overdueCount = body["overdue"] as? Int ?? 0
      todayItems = (body["items"] as? [[String: Any]] ?? []).compactMap { d in
        guard let when = d["when"] as? String, let title = d["title"] as? String, let path = d["path"] as? String
        else { return nil }
        return TodayItem(when: when, title: title, path: path)
      }
      let badge = body["badge"] as? Int ?? 0
      NSApp.dockTile.badgeLabel = badge > 0 ? String(badge) : nil
      rebuildStatusMenu()
    case "requestPermission":
      Task { await requestPermission() }
    case "openNotificationSettings":
      let id = Bundle.main.bundleIdentifier ?? ""
      if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=\(id)") {
        NSWorkspace.shared.open(url)
      }
    case "openCalendarSettings":
      if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars") {
        NSWorkspace.shared.open(url)
      }
    case "testNotification":
      Task { await sendTestNotification() }
    case "save":
      save(filename: body["filename"] as? String ?? "daily-tracker.json", content: body["content"] as? String ?? "")
    default:
      break
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

  // MARK: Notifications

  private func authorizationStatus() async -> UNAuthorizationStatus {
    await withCheckedContinuation { continuation in
      UNUserNotificationCenter.current().getNotificationSettings { continuation.resume(returning: $0.authorizationStatus) }
    }
  }

  private func reportPermission() async {
    let status =
      switch await authorizationStatus() {
      case .authorized, .provisional: "granted"
      case .denied: "denied"
      default: "undetermined"
      }
    sendToPage(["type": "permission", "status": status])
  }

  private func requestPermission() async {
    _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
    await reportPermission()
  }

  /// Replaces every reminder handed over earlier with the page's current list. With `calendar`, they
  /// go into the iCloud calendar instead, whose alerts reach both this Mac and the iPhone; this app's
  /// own notifications then stay quiet, so the Mac never shows two.
  private func schedule(_ reminders: [Reminder], calendar wantsCalendar: Bool) async {
    let center = UNUserNotificationCenter.current()
    let upcoming = reminders.filter { $0.at > Date() }

    var viaCalendar = false
    if wantsCalendar {
      if EKEventStore.authorizationStatus(for: .event) == .notDetermined { _ = await requestCalendarAccess() }
      let access = calendarAccess()
      if access == "granted" {
        do {
          let (calendar, inICloud) = try trackerCalendar()
          try syncCalendar(upcoming, into: calendar)
          viaCalendar = true
          sendToPage(["type": "calendar", "status": inICloud ? "granted" : "local"])
        } catch {
          note("Calendar update failed: \(error.localizedDescription)")
          sendToPage(["type": "calendar", "status": "error"])
        }
      } else {
        sendToPage(["type": "calendar", "status": access])
      }
    } else if calendarWasOn {
      clearUpcomingCalendarEntries()
      sendToPage(["type": "calendar", "status": "off"])
    }
    calendarWasOn = wantsCalendar

    if !viaCalendar, !upcoming.isEmpty, await authorizationStatus() == .notDetermined {
      await requestPermission()
    }

    let stale: [String] = await withCheckedContinuation { continuation in
      center.getPendingNotificationRequests { requests in
        continuation.resume(returning: requests.map(\.identifier).filter { $0.hasPrefix(reminderPrefix) })
      }
    }
    center.removePendingNotificationRequests(withIdentifiers: stale)

    for reminder in viaCalendar ? [] : upcoming {
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
    nextReminder = upcoming.first
    rebuildStatusMenu()
  }

  // MARK: iPhone alerts, through a calendar in iCloud

  private func calendarAccess() -> String {
    switch EKEventStore.authorizationStatus(for: .event) {
    case .fullAccess: "granted"
    case .notDetermined: "undetermined"
    default: "denied"  // denied, restricted, or write-only, which can't tidy up its own entries
    }
  }

  private func requestCalendarAccess() async -> Bool {
    await withCheckedContinuation { continuation in
      eventStore.requestFullAccessToEvents { granted, _ in continuation.resume(returning: granted) }
    }
  }

  /// The "Daily Tracker" calendar, made once in iCloud (where the iPhone sees it) and found again by
  /// its identifier. Without iCloud it falls back to a calendar on this Mac.
  private func trackerCalendar() throws -> (EKCalendar, inICloud: Bool) {
    let key = "TrackerCalendarID"
    if let id = UserDefaults.standard.string(forKey: key), let existing = eventStore.calendar(withIdentifier: id) {
      return (existing, existing.source.title == "iCloud")
    }
    let iCloud = eventStore.sources.first { $0.sourceType == .calDAV && $0.title == "iCloud" }
    guard let source = iCloud ?? eventStore.defaultCalendarForNewEvents?.source ?? eventStore.sources.first
    else { throw CocoaError(.featureUnsupported) }
    let calendar = EKCalendar(for: .event, eventStore: eventStore)
    calendar.title = "Daily Tracker"
    calendar.cgColor = CGColor(srgbRed: 0x2D / 255, green: 0xD4 / 255, blue: 0xBF / 255, alpha: 1)
    calendar.source = source
    try eventStore.saveCalendar(calendar, commit: true)
    UserDefaults.standard.set(calendar.calendarIdentifier, forKey: key)
    note("Made the Daily Tracker calendar in \(source.title)")
    return (calendar, iCloud != nil)
  }

  private func calendarKey(_ reminder: Reminder) -> String {
    "dailytracker://reminder/" + (reminder.id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? reminder.id)
  }

  /// Each reminder becomes a five-minute entry at its time with an alert, keyed by its URL. Entries
  /// that are no longer wanted go if they're still ahead; past ones stay two days as a record.
  private func syncCalendar(_ reminders: [Reminder], into calendar: EKCalendar) throws {
    let now = Date()
    let window = eventStore.predicateForEvents(
      withStart: now.addingTimeInterval(-3 * 86_400), end: now.addingTimeInterval(16 * 86_400), calendars: [calendar])
    var wanted: [String: Reminder] = [:]
    for reminder in reminders { wanted[calendarKey(reminder)] = reminder }
    var present = Set<String>()
    for entry in eventStore.events(matching: window) {
      let key = entry.url?.absoluteString ?? ""
      if wanted[key] != nil {
        present.insert(key)
      } else if entry.startDate > now || entry.startDate < now.addingTimeInterval(-2 * 86_400) {
        try eventStore.remove(entry, span: .thisEvent, commit: false)
      }
    }
    for (key, reminder) in wanted where !present.contains(key) {
      let entry = EKEvent(eventStore: eventStore)
      entry.calendar = calendar
      // A phone's alert shows the title and time only, so the title carries the detail.
      entry.title = reminder.kind == "summary" ? reminder.title : "\(reminder.title) · \(reminder.body)"
      entry.notes = reminder.body
      entry.startDate = reminder.at
      entry.endDate = reminder.at.addingTimeInterval(5 * 60)
      entry.url = URL(string: key)
      entry.addAlarm(EKAlarm(relativeOffset: 0))
      try eventStore.save(entry, span: .thisEvent, commit: false)
    }
    try eventStore.commit()
  }

  /// Turning iPhone alerts off removes the entries still ahead, so no stray alert arrives later.
  private func clearUpcomingCalendarEntries() {
    guard calendarAccess() == "granted", let id = UserDefaults.standard.string(forKey: "TrackerCalendarID"),
      let calendar = eventStore.calendar(withIdentifier: id)
    else { return }
    let now = Date()
    let ahead = eventStore.predicateForEvents(withStart: now, end: now.addingTimeInterval(16 * 86_400), calendars: [calendar])
    for entry in eventStore.events(matching: ahead) { try? eventStore.remove(entry, span: .thisEvent, commit: false) }
    try? eventStore.commit()
  }

  private func sendTestNotification() async {
    if await authorizationStatus() == .notDetermined { await requestPermission() }
    let content = UNMutableNotificationContent()
    content.title = "Daily Tracker"
    content.body = "Notifications work. Your reminders will look like this."
    content.sound = .default
    content.userInfo = ["test": "1"]
    let request = UNNotificationRequest(
      identifier: "test:\(Date().timeIntervalSince1970)",
      content: content,
      trigger: UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
    )
    try? await UNUserNotificationCenter.current().add(request)
  }

  /// While you're looking at the app, the page shows the reminder itself, so macOS stays quiet.
  /// The test notification always shows, since showing it is the point.
  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    if notification.request.content.userInfo["test"] != nil { return [.banner, .sound] }
    let watching = await MainActor.run { NSApp.isActive && self.window.isVisible && !self.window.isMiniaturized }
    return watching ? [] : [.banner, .sound, .list]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    let request = response.notification.request
    let path = request.content.userInfo["path"] as? String
    let taskId = request.content.userInfo["taskId"] as? String
    switch response.actionIdentifier {
    case "snooze":
      guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else { return }
      let snoozed = UNNotificationRequest(
        identifier: "snooze:\(request.identifier):\(Date().timeIntervalSince1970)",
        content: content,
        trigger: UNTimeIntervalNotificationTrigger(timeInterval: 600, repeats: false)
      )
      try? await center.add(snoozed)
    case "done":
      guard let taskId, !taskId.isEmpty else { return }
      await MainActor.run { self.sendToPage(["type": "done", "taskId": taskId]) }
    case UNNotificationDefaultActionIdentifier:
      await MainActor.run {
        self.bringToFront()
        if let path { self.sendToPage(["type": "open", "path": path]) }
      }
    default:
      break
    }
  }

  // MARK: Menu bar item

  private func makeStatusItem() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    item.button?.image = NSImage(systemSymbolName: "checklist", accessibilityDescription: "Daily Tracker")
    statusItem = item
    rebuildStatusMenu()
  }

  /// Rebuilt whenever the page sends a new Today list or reminder schedule, so it's never stale.
  private func rebuildStatusMenu() {
    guard let statusItem else { return }
    let menu = NSMenu()
    menu.autoenablesItems = false
    menu.addItem(menuItem("Open Daily Tracker", #selector(openFromMenu(_:))))
    let quickAdd = menuItem("Quick Add…", #selector(quickAddFromMenu(_:)))
    quickAdd.keyEquivalent = "t"
    quickAdd.keyEquivalentModifierMask = [.command, .option]
    menu.addItem(quickAdd)
    menu.addItem(.separator())

    menu.addItem(info("Today"))
    if todayItems.isEmpty {
      menu.addItem(info("Nothing left today"))
    }
    for entry in todayItems {
      let title = entry.title.count > 44 ? entry.title.prefix(43) + "…" : Substring(entry.title)
      let row = menuItem("\(entry.when)   \(title)", #selector(openTodayItem(_:)))
      row.representedObject = entry.path
      menu.addItem(row)
    }
    if overdueCount > 0 {
      let overdue = menuItem("\(overdueCount) overdue", #selector(openTodayItem(_:)))
      overdue.representedObject = "/tasks?show=overdue"
      menu.addItem(overdue)
    }
    menu.addItem(.separator())

    if let reminder = nextReminder {
      let format = DateFormatter()
      format.dateFormat = Calendar.current.isDateInToday(reminder.at) ? "HH:mm" : "EEE d MMM, HH:mm"
      let title = reminder.title.count > 36 ? reminder.title.prefix(35) + "…" : Substring(reminder.title)
      menu.addItem(info("Next reminder: \(title), \(format.string(from: reminder.at))"))
    } else {
      menu.addItem(info("No reminders in the next two weeks"))
    }
    menu.addItem(.separator())

    let login = menuItem("Open at Login", #selector(toggleOpenAtLogin(_:)))
    login.state = SMAppService.mainApp.status == .enabled ? .on : .off
    menu.addItem(login)
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "Quit Daily Tracker", action: #selector(NSApplication.terminate(_:)), keyEquivalent: ""))
    statusItem.menu = menu
  }

  private func menuItem(_ title: String, _ action: Selector) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
    item.target = self
    return item
  }

  /// A line of text in the menu that isn't a command.
  private func info(_ title: String) -> NSMenuItem {
    let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
    item.isEnabled = false
    return item
  }

  @objc private func openTodayItem(_ sender: NSMenuItem) {
    guard let path = sender.representedObject as? String else { return }
    bringToFront()
    sendToPage(["type": "open", "path": path])
  }

  /// The global shortcut: whatever app you're in, Daily Tracker comes forward with Quick add open.
  func quickAddFromAnywhere() {
    note("Opening Quick add (page listening: \(pageListening), window loaded: \(webView.url != nil))")
    quickAddFromMenu(nil)
  }

  @objc private func openFromMenu(_ sender: Any?) {
    bringToFront()
  }

  @objc private func quickAddFromMenu(_ sender: Any?) {
    bringToFront()
    sendToPage(["type": "quickAdd"])
  }

  @objc private func openSettings(_ sender: Any?) {
    bringToFront()
    sendToPage(["type": "open", "path": "/settings"])
  }

  @objc private func toggleOpenAtLogin(_ sender: NSMenuItem) {
    let service = SMAppService.mainApp
    do {
      if service.status == .enabled { try service.unregister() } else { try service.register() }
    } catch {
      let alert = NSAlert()
      alert.messageText = "Couldn’t change Open at Login"
      alert.informativeText = error.localizedDescription
      alert.runModal()
    }
    if service.status == .requiresApproval {
      // macOS asks you to allow it once in System Settings → General → Login Items.
      SMAppService.openSystemSettingsLoginItems()
    }
    sender.state = service.status == .enabled ? .on : .off
  }

  // MARK: Saving files (the export in Settings)

  private func save(filename: String, content: String) {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = filename
    panel.canCreateDirectories = true
    if let type = UTType(filenameExtension: (filename as NSString).pathExtension) {
      panel.allowedContentTypes = [type]
    }
    Task {
      guard await panel.beginSheetModal(for: window) == .OK, let url = panel.url else { return }
      do {
        try content.write(to: url, atomically: true, encoding: .utf8)
        sendToPage(["type": "saved", "name": url.lastPathComponent])
      } catch {
        let alert = NSAlert()
        alert.messageText = "Couldn’t save the file"
        alert.informativeText = error.localizedDescription
        _ = await alert.beginSheetModal(for: window)
      }
    }
  }

  // MARK: Menus (the Edit menu is what makes Cmd+C, Cmd+V and Cmd+Z work in text fields)

  private func makeMainMenu() -> NSMenu {
    let main = NSMenu()

    let app = NSMenu()
    app.addItem(withTitle: "About Daily Tracker", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    app.addItem(.separator())
    app.addItem(withTitle: "Settings…", action: #selector(openSettings(_:)), keyEquivalent: ",").target = self
    app.addItem(.separator())
    app.addItem(withTitle: "Hide Daily Tracker", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    app.addItem(.separator())
    app.addItem(withTitle: "Quit Daily Tracker", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
    redo.keyEquivalentModifierMask = [.command, .shift]
    edit.addItem(.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

    let view = NSMenu(title: "View")
    view.addItem(withTitle: "Reload", action: #selector(reloadPage(_:)), keyEquivalent: "r").target = self
    let fullScreen = view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
    fullScreen.keyEquivalentModifierMask = [.command, .control]

    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
    windowMenu.addItem(.separator())
    windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    NSApp.windowsMenu = windowMenu

    for submenu in [app, edit, view, windowMenu] {
      let item = NSMenuItem()
      item.submenu = submenu
      main.addItem(item)
    }
    return main
  }
}

let delegate = AppDelegate()
NSApplication.shared.delegate = delegate
NSApplication.shared.setActivationPolicy(.regular)
NSApplication.shared.run()
