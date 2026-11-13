// Usage: hiddrag <x1> <y1> <x2> <y2> — press at (x1, y1), drag to (x2, y2), release; restores the cursor.
import CoreGraphics
import Foundation

let a = CommandLine.arguments.dropFirst().map { Double($0)! }
let start = CGPoint(x: a[0], y: a[1]), end = CGPoint(x: a[2], y: a[3])
let original = CGEvent(source: nil)!.location
let source = CGEventSource(stateID: .hidSystemState)
func post(_ type: CGEventType, _ p: CGPoint) {
    CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: p, mouseButton: .left)!.post(tap: .cghidEventTap)
}
post(.mouseMoved, start); usleep(100000)
post(.leftMouseDown, start); usleep(50000)
for i in 1...10 {
    let t = Double(i) / 10
    post(.leftMouseDragged, CGPoint(x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t)); usleep(15000)
}
post(.leftMouseUp, end); usleep(100000)
post(.mouseMoved, original)
