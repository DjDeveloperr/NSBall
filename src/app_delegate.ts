import "@nativescript/macos-node-api";
import { ViewController } from "./view_controller.js";
import {
  constrainRect,
  getInferredRectOfHoveredDockIcon,
  RADIUS,
} from "./util.js";
import { MouseCatcherView } from "./mouse_catcher.js";

export class AppDelegate
  extends NSObject
  implements NSApplicationDelegate, NSWindowDelegate
{
  static ObjCProtocols = [NSApplicationDelegate, NSWindowDelegate];

  static {
    NativeClass(this);
  }

  ballWindow!: NSWindow;
  ballViewController = ViewController.new();
  clickWindow!: NSWindow;

  putBackImageView = NSImageView.imageViewWithImage(
    NSImage.alloc().initWithContentsOfFile(
      new URL("../assets/PutBack.png", import.meta.url).pathname
    )
  );

  ballImageView = NSImageView.imageViewWithImage(
    NSImage.alloc().initWithContentsOfFile(
      new URL("../assets/Ball.png", import.meta.url).pathname
    )
  );

  _ballVisible = false;

  get ballVisible() {
    return this._ballVisible;
  }

  set ballVisible(value) {
    if (value === this.ballVisible) {
      return;
    }

    this._ballVisible = value;

    this.ballWindow.setIsVisible(value);
    this.ballViewController.sceneView.isPaused = !value;

    NSApp.dockTile.contentView = value
      ? this.putBackImageView
      : this.ballImageView;
    NSApp.dockTile.display();

    this.clickWindow.setIsVisible(value);
    if (value) {
      this.updateClickWindow();
    }
  }

  makeBallWindow() {
    const window = NSWindow.alloc().initWithContentRectStyleMaskBackingDefer(
      { origin: { x: 196, y: 240 }, size: { width: 480, height: 270 } },
      NSWindowStyleMask.FullSizeContentView,
      NSBackingStoreType.Buffered,
      false
    );

    window.title = "NSBall";
    window.isRestorable = false;
    window.isReleasedWhenClosed = false;
    window.delegate = this;

    window.collectionBehavior =
      NSWindowCollectionBehavior.Transient |
      NSWindowCollectionBehavior.IgnoresCycle |
      NSWindowCollectionBehavior.FullScreenNone;
    window.hasShadow = false;
    window.animationBehavior = NSWindowAnimationBehavior.None;
    window.tabbingMode = NSWindowTabbingMode.Disallowed;
    window.backgroundColor = NSColor.clearColor;
    window.isOpaque = false;
    window.acceptsMouseMovedEvents = false;
    window.ignoresMouseEvents = true;
    window.level = NSScreenSaverWindowLevel;
    window.contentViewController = this.ballViewController;

    this.ballWindow = window;
    this.updateWindowSize();
  }

  makeClickWindow() {
    const clickWindow =
      NSWindow.alloc().initWithContentRectStyleMaskBackingDefer(
        {
          origin: { x: 0, y: 0 },
          size: { width: RADIUS * 2, height: RADIUS * 2 },
        },
        0,
        NSBackingStoreType.Buffered,
        false
      );
    clickWindow.isReleasedWhenClosed = false;
    clickWindow.level = NSScreenSaverWindowLevel;
    clickWindow.backgroundColor = NSColor.clearColor;

    const catcher = MouseCatcherView.new();
    clickWindow.contentView = catcher;
    catcher.frame = {
      origin: { x: 0, y: 0 },
      size: { width: RADIUS * 2, height: RADIUS * 2 },
    };
    catcher.wantsLayer = true;
    catcher.layer.backgroundColor =
      NSColor.blackColor.colorWithAlphaComponent(0.01).CGColor;
    catcher.layer.cornerRadius = RADIUS;
    catcher.delegate = this.ballViewController;

    this.clickWindow = clickWindow;

    this.ballViewController.ballPositionChanged = () => {
      this.updateClickWindow();
    };
  }

  updateClickWindow() {
    const rect = this.ballViewController.mouseCatcherRect;
    if (!this.ballVisible || !rect) return;

    const rounding = 10;
    rect.origin.x = Math.round(CGRectGetMinX(rect) / rounding) * rounding;
    rect.origin.y = Math.round(CGRectGetMinY(rect) / rounding) * rounding;

    // HACK: Assume scene coords are same as window coords
    const screen = this.ballWindow?.screen;
    if (!screen) return;

    if (rect) {
      this.clickWindow.setFrameDisplay(
        constrainRect(rect, screen.frame),
        false
      );
    }
  }

  updateWindowSize() {
    const screen = this.ballWindow?.screen;
    if (!screen) {
      return;
    }

    this.ballWindow!.setFrameDisplay(
      {
        origin: { x: screen.frame.origin.x, y: screen.frame.origin.y },
        size: {
          width: screen.frame.size.width,
          height: screen.frame.size.height,
        },
      },
      true
    );
  }

  windowDidChangeScreen(_notification: NSNotification): void {
    this.updateWindowSize();
  }

  windowDidChangeScreenProfile(_notification: NSNotification): void {
    this.updateWindowSize();
  }

  applicationDidFinishLaunching(_notification: NSNotification): void {
    console.log("NSBall started!");

    this.makeBallWindow();
    this.makeClickWindow();
  }

  applicationWillFinishLaunching(_notification: NSNotification): void {
    NSApp.applicationIconImage = this.ballImageView.image;
  }

  applicationShouldHandleReopenHasVisibleWindows(
    _sender: NSApplication,
    _flag: boolean
  ): boolean {
    let currentScreen: NSScreen | undefined;

    const mouseLocation = NSEvent.mouseLocation;

    for (const screen of NSScreen.screens) {
      if (NSPointInRect(mouseLocation, screen.frame)) {
        currentScreen = screen;
        break;
      }
    }

    if (!currentScreen) return true;

    const dockIconRect = constrainRect(
      getInferredRectOfHoveredDockIcon(currentScreen),
      currentScreen.frame
    );

    if (this.ballVisible) {
      this.ballViewController.dock(dockIconRect, () => {
        this.ballVisible = false;
      });
    } else {
      this.ballViewController.launch(dockIconRect);
      this.ballVisible = true;
    }

    return true;
  }
}
