// Usage: hidtap <x> <y> [holdMs] — move to (x, y), press, hold, release; puts the cursor back afterwards.
import CoreGraphics
import Foundation

let args = CommandLine.arguments
let point = CGPoint(x: Double(args[1])!, y: Double(args[2])!)
let hold = args.count > 3 ? UInt32(args[3])! * 1000 : 120000
let original = CGEvent(source: nil)!.location
let source = CGEventSource(stateID: .hidSystemState)
func post(_ type: CGEventType) {
    let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)!
    event.setIntegerValueField(.mouseEventClickState, value: 1)
    event.post(tap: .cghidEventTap)
}
post(.mouseMoved); usleep(150000)
post(.leftMouseDown); usleep(hold)
post(.leftMouseUp); usleep(150000)
CGEvent(mouseEventSource: source, mouseType: .mouseMoved, mouseCursorPosition: original, mouseButton: .left)!.post(tap: .cghidEventTap)
