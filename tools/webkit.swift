// The WebKit runner for tools/webkit.mjs: one WKWebView, a phone's width at 3x, measured from the page.
// swiftc -O tools/webkit.swift -o tools/shots/webkit-runner   (tools/webkit.mjs does this for you)
// webkit-runner <url> <css width> <zoom: device pixels per CSS pixel over the Mac's 2x> <timeout s>
// It prints one JSON line: the page's own report, with the CPU the web and GPU processes spent
// between the page's "start" mark and its "done". The window is borderless and off the screen, and
// occlusion detection is off, so it measures with the screen locked and shows nothing.
import Cocoa
import WebKit

setvbuf(stdout, nil, _IONBF, 0)
let args = CommandLine.arguments
let url = URL(string: args[1])!
let wCSS = Double(args.count > 2 ? args[2] : "390")!
let mag = Double(args.count > 3 ? args[3] : "1.5")!
let timeout = Double(args.count > 4 ? args[4] : "60")!

func cpuTime(_ pid: pid_t) -> Double {
  var info = rusage_info_v2()
  let r = withUnsafeMutablePointer(to: &info) { p in
    p.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) { proc_pid_rusage(pid, RUSAGE_INFO_V2, $0) }
  }
  if r != 0 { return 0 }
  var tb = mach_timebase_info_data_t(); mach_timebase_info(&tb)
  return Double(info.ri_user_time + info.ri_system_time) * Double(tb.numer) / Double(tb.denom) / 1e9
}
func pidsNamed(_ name: String) -> Set<pid_t> {
  let p = Process(); p.executableURL = URL(fileURLWithPath: "/bin/ps"); p.arguments = ["-A", "-o", "pid=,comm="]
  let pipe = Pipe(); p.standardOutput = pipe; try? p.run()
  let data = pipe.fileHandleForReading.readDataToEndOfFile(); p.waitUntilExit()
  let s = String(data: data, encoding: .utf8) ?? ""
  return Set(s.split(separator: "\n").compactMap { l in
    let t = l.trimmingCharacters(in: .whitespaces); guard t.hasSuffix(name) else { return nil }
    return pid_t(t.split(separator: " ")[0]) })
}

class Runner: NSObject, NSApplicationDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var web: WKWebView!
  var gpuBefore: Set<pid_t> = []
  var start: [String: Double] = [:]
  func applicationDidFinishLaunching(_ n: Notification) {
    gpuBefore = pidsNamed("com.apple.WebKit.GPU")
    let cfg = WKWebViewConfiguration()
    cfg.userContentController.add(self, name: "porch")
    cfg.websiteDataStore = .nonPersistent()
    let size = NSSize(width: wCSS * mag, height: 844 * mag)
    web = WKWebView(frame: NSRect(origin: .zero, size: size), configuration: cfg)
    let sel = NSSelectorFromString("_setWindowOcclusionDetectionEnabled:")
    if web.responds(to: sel) { web.perform(sel, with: nil) }
    window = NSWindow(contentRect: NSRect(x: -4000, y: -4000, width: size.width, height: size.height), styleMask: [.borderless], backing: .buffered, defer: false)
    window.contentView = web
    window.orderFrontRegardless()
    /* pageZoom, not magnification: it is the CSS pixel that grows, so the page lays out at the
       phone's width and draws at its 3x. Magnification is a pinch, and keeps the wider layout */
    web.pageZoom = mag
    web.load(URLRequest(url: url))
    DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { print("{\"timeout\":true}"); exit(2) }
  }
  func cpu() -> [String: Double] {
    var out: [String: Double] = [:]
    if web.responds(to: NSSelectorFromString("_webProcessIdentifier")), let pid = web.value(forKey: "_webProcessIdentifier") as? Int32 { out["web"] = cpuTime(pid) }
    out["gpu"] = pidsNamed("com.apple.WebKit.GPU").subtracting(gpuBefore).map { cpuTime($0) }.reduce(0, +)
    return out
  }
  func userContentController(_ uc: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let b = m.body as? [String: Any], let kind = b["kind"] as? String else { return }
    if kind == "start" { start = cpu(); return }
    if kind == "done" {
      let z = cpu()
      let page = String(data: try! JSONSerialization.data(withJSONObject: b), encoding: .utf8)!
      print("{\"cpuWeb\":\((z["web"] ?? 0) - (start["web"] ?? 0)),\"cpuGpu\":\((z["gpu"] ?? 0) - (start["gpu"] ?? 0)),\"page\":\(page)}")
      exit(0)
    }
  }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let runner = Runner()
app.delegate = runner
app.run()
