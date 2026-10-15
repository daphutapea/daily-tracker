// Daily Tracker for macOS: a native window around the web build in Resources/web.
// Pages are served from the app bundle through the dailytracker:// scheme; data still comes
// from Supabase over the network, so the app and the browser version share everything.

import AppKit
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

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
  private var window: NSWindow!
  private var webView: WKWebView!

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.mainMenu = makeMainMenu()

    let webRoot = Bundle.main.resourceURL!.appending(path: "web")
    let configuration = WKWebViewConfiguration()
    configuration.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: appScheme)
    configuration.websiteDataStore = .default()  // keeps you signed in between launches

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

    // Stay hidden until the first page paints so dark mode never flashes white. The timer is a
    // fallback in case the load is slow.
    Timer.scheduledTimer(withTimeInterval: 1.5, repeats: false) { [weak self] _ in
      MainActor.assumeIsolated { self?.showWindow() }
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
    print("SMOKE TEST OK: \(summary)")
    exit(0)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  private func showWindow() {
    guard !window.isVisible else { return }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate()
  }

  @objc private func reloadPage(_ sender: Any?) {
    webView.reload()
  }

  // MARK: Navigation

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if isSmokeTest {
      Task { await reportSmokeTest() }
      return
    }
    showWindow()
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
    if isSmokeTest {
      print("SMOKE TEST FAILED: \(error.localizedDescription)")
      exit(1)
    }
    showWindow()
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

  // MARK: Menus (the Edit menu is what makes Cmd+C, Cmd+V and Cmd+Z work in text fields)

  private func makeMainMenu() -> NSMenu {
    let main = NSMenu()

    let app = NSMenu()
    app.addItem(withTitle: "About Daily Tracker", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
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
