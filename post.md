# Introducing NativeScript Node-API

A rewrite of the core NativeScript runtime that allows it to run on any JavaScript VM that implements the Node-API, unlike how NativeScript was tightly coupled to V8 API before (and formerly JSC for the iOS runtime). Currently, the new runtime only supports C/Objective-C bindings so the iOS, macOS and co platforms are supported. Android support is coming soon.

It can plug directly into Node.js and Deno, and can be used with Hermes and quickjs with Node-API support as well to build with mobile applications such as on iOS.

NativeScript has already worked very well on iOS and Android, but what is new here? Desktop support - now you can leverage the power of native platform APIs - frameworks like AppKit on macOS, Metal for GPU based compute or graphics, MLCompute for accelerated machine learning applications, right in your Node.js or Deno applications.

> Note: There's some examples in the `examples` directory that demonstrate how to use NativeScript Node-API with various frameworks!

We came across this project: [ball by Nate Parrot](https://github.com/nate-parrott/ball) - which is just a ball that sits in your dock and you can click to launch the ball (or re-dock it) that overlays on your screen, and you can interact with it. There are some fun little details to it, and it uses AppKit & SpriteKit to render the ball and the physics of it, with a bit of animations using Swift Motion library - but we did that using popmotion in JS instead! It's a fun little project to tinker with, and it's a great example of what you can do with NativeScript Node-API.

The beauty of NativeScript is that native APIs are available almost 1:1 in JavaScript, so all you need are Apple docs open by the side and start building something. Even though that project is written in Swift, it's still straightforward to understand the logic and do it the exact same way in JavaScript.

## Understanding the project

When we look at the source, the main entrypoint is `AppDelegate` class (part of AppDelegate.swift). The ball launches from the dock and also goes back there so the dock events are handled in the app delegate, then there is app controller that abstracts the main logic of the app such as launching and docking the ball in `dockIconClicked` and also handles the two windows used here. One is the window with the ball rendered using SpriteKit that covers the whole screen, and the other is a small transparent window that sits on top and is the exact same size as the ball to capture mouse events for interactivity. That is all for the basic logic of how this project works.

## Initialize the project

Let's start by creating a simple config file to import NativeScript Node-API and `src/main.ts`.

```json
{
  "tasks": {
    "run": "deno run -A src/main.ts"
  },

  "imports": {
    "@nativescript/macos-node-api": "npm:@nativescript/macos-node-api@^0.1.0",
  }
}
```

Now let's create `src/main.ts` and test NativeScript Node-API.

```ts
import "@nativescript/macos-node-api";

console.log(NSProcessInfo.processInfo.operatingSystemVersionString);
```

And running `deno task run` should print out your OS version!

This allows us to run on Deno. To run on Node.js, initialize the project as you would with `npm init`, install `npm install @nativescript/macos-node-api`. Make sure to setup `tsconfig.json` too, run the TypeScript compiler and then run the project with `node`. Boom, you get the same output but in Node.js! Node-API allows NativeScript to run seamlessly on both Node.js and Deno.

Here's the `tsconfig.json` I used:

```json
{
  "compilerOptions": {
    "lib": ["ES2023"],
    "target": "ES2023",
    "module": "ES2022",
    "moduleResolution": "Node",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  }
}
```

The module systems in Node.js and Deno are a bit different. To make it work in both, we set the module system to ES2022. The output code will use ESM which will work in both Node.js and Deno. The only difference now is that Deno requires you to use fully qualified specifies with `.ts` at end, but this will emit the specifiers as-is. That's why we will use `.js` specifiers in the code so the emitted code works in Node.js, and to run the TypeScript itself in Deno, we'll have to use `--unstable-sloppy-imports` flag.

## Implementation

### Basic AppKit application

Let's start by making the AppDelegate class.

`src/app_delegate.ts`:

```ts
import "@nativescript/macos-node-api";

export class AppDelegate extends NSObject implements NSApplicationDelegate {
  static ObjCProtocols = [NSApplicationDelegate];

  static {
    NativeClass(this);
  }

  applicationDidFinishLaunching(_notification: NSNotification): void {
    console.log("NSBall started!");
  }
}
```

Note how we used `NativeClass` to make the class available to Objective-C runtime. That and `ObjCProtocols` static, we need that information at runtime to find the definitions for the protocol in order to expose the methods in native land. Other than those, you just naturally extend native classes like `NSObject` and can even use TypeScript `implements` keyword to implement protocols and get type checking plus autocompletion in your editor.

But how exactly do we use this? In an Xcode project it would be implicitly used (the class name is mentioned in Info.plist) but we have to add a bit of boilerplate to make it work as if we were writing AppKit application in an Objective-C project manually. So we got to change `main.ts` like this:

```ts
import "@nativescript/macos-node-api";

objc.import("AppKit");

import { AppDelegate } from "./app_delegate.js";

const NSApp = NSApplication.sharedApplication;

NSApp.delegate = AppDelegate.new();
NSApp.setActivationPolicy(NSApplicationActivationPolicy.Regular);

NSApplicationMain(0, null);
```

On running this we see the message as expected in console, and a terminal icon appears in the Dock. This is the basic setup for a NativeScript macOS application. Rest is same as writing a macOS application in Objective-C or Swift, but in JavaScript.

### Handling dock icon click

Let's add more to this in order to handle dock icon clicks.

```ts
export class AppDelegate extends NSObject implements NSApplicationDelegate {
  ...

  applicationWillFinishLaunching(_notification: NSNotification): void {
    NSApp.applicationIconImage = NSImage.alloc().initWithContentsOfFile(
      new URL("../assets/Ball.png", import.meta.url).pathname,
    );
  }

  applicationShouldHandleReopenHasVisibleWindows(_sender: NSApplication, _flag: boolean): boolean {
    console.log("Dock icon clicked");
    return true;
  }
}
```

- `applicationWillFinishLaunching`: Set the dock icon image. Ideally we would set it in the app bundle, but for now, let's just set it before the app finishes launching.
- `applicationShouldHandleReopenHasVisibleWindows`: This method is called when the dock icon is clicked. We log a message to the console for now.

### Creating a window for SpriteKit scene

Now, when the application finishes launching, what we'll do is make a window on screen saver level that covers the whole screen and renders the ball using SpriteKit. Let's make that first.

```ts
export class AppDelegate extends NSObject implements NSApplicationDelegate {
  ...

  ballWindow!: NSWindow;

  makeBallWindow() {
    const window = NSWindow.alloc().initWithContentRectStyleMaskBackingDefer(
      { origin: { x: 196, y: 240 }, size: { width: 480, height: 270 } },
      NSWindowStyleMask.FullSizeContentView,
      NSBackingStoreType.Buffered,
      false,
    );

    window.title = "NSBall";
    window.isRestorable = false;
    window.isReleasedWhenClosed = false;

    window.collectionBehavior = NSWindowCollectionBehavior.Transient |
      NSWindowCollectionBehavior.IgnoresCycle |
      NSWindowCollectionBehavior.FullScreenNone | NSWindowCollectionBehavior.CanJoinAllApplications;
    window.hasShadow = false;
    window.animationBehavior = NSWindowAnimationBehavior.None;
    window.tabbingMode = NSWindowTabbingMode.Disallowed;
    window.backgroundColor = NSColor.clearColor;
    window.isOpaque = false;
    window.acceptsMouseMovedEvents = false;
    window.ignoresMouseEvents = true;
    window.level = NSScreenSaverWindowLevel;

    this.ballWindow = window;
    this.updateWindowSize();
  }

  updateWindowSize() {
    const screen = this.ballWindow.screen;
    if (!screen) {
      return;
    }

    this.ballWindow.setFrameDisplay({
      origin: { x: screen.frame.origin.x, y: screen.frame.origin.y },
      size: {
        width: screen.frame.size.width,
        height: screen.frame.size.height,
      },
    }, true);
  }

  applicationDidFinishLaunching(_notification: NSNotification): void {
    console.log("NSBall started!");

    this.makeBallWindow();
  }

  ...
}
```

There are some cases in which we need to update the window size, such as when the screen changes, or the screen profile changes. We can implement window delegate methods in this class itself.

```ts
export class AppDelegate extends NSObject implements NSApplicationDelegate, NSWindowDelegate {
  static ObjCProtocols = [NSApplicationDelegate, NSWindowDelegate];

  ...

  makeBallWindow() {
    ...

    window.delegate = this;
    
    ...
  }

  windowDidChangeScreen(_notification: NSNotification): void {
    this.updateWindowSize();
  }

  windowDidChangeScreenProfile(_notification: NSNotification): void {
    this.updateWindowSize();
  }

  ...
}
```

### Adding ball object to the scene

You won't notice much when you run this, but let's change that by adding an actual ball to this window.

Start by making a Ball SpriteKit Node.

`ball.ts`:

```ts
import "@nativescript/macos-node-api";

objc.import("AppKit");
objc.import("SpriteKit");

export class Ball extends SKNode {
  static {
    NativeClass(this);
  }

  imgContainer = SKNode.new();
  
  imgNode = SKSpriteNode.spriteNodeWithTexture(
    SKTexture.textureWithImage(
      NSImage.alloc().initWithContentsOfFile(
        new URL("../assets/Ball.png", import.meta.url).pathname,
      ),
    ),
  );

  radius = 0;

  static create(radius: number, pos: CGPoint) {
    const ball = Ball.new();
    
    ball.radius = radius;
    ball.position = pos;
    ball.imgNode.size = { width: radius * 2, height: radius * 2 };

    const body = SKPhysicsBody.bodyWithCircleOfRadius(radius);
    
    body.isDynamic = true;
    body.restitution = 0.6;
    body.allowsRotation = false;
    body.usesPreciseCollisionDetection = true;
    body.contactTestBitMask = 1;

    ball.physicsBody = body;

    ball.addChild(ball.imgContainer);
    ball.imgContainer.addChild(ball.imgNode);

    return ball;
  }

  update() {
    const yDelta = -(1 - this.imgContainer.xScale) * this.radius / 2;
    this.imgContainer.position = { x: 0, y: yDelta };
  }
}
```

Here, we create a ball with a circular physics body so that it can handle collisions on screen boundaries, and also set up its heirarchy in a way that we first have a image container within the ball node, and image node inside that container. This is so that we can change the offset and x-scale for squishing effect when the ball hits the screen boundaries later.

Now let's make a view controller that actually setups up the scene and allows launching and docking the ball. We will set this VC as the root view controller of the window.

`view_controller.ts`:

```ts
import "@nativescript/macos-node-api";

export class ViewController extends NSViewController {
  static {
    NativeClass(this);
  }

  scene = SKScene.sceneWithSize({ width: 200, height: 200 });
  sceneView = SKView.new();

  viewDidLoad() {
    super.viewDidLoad();

    this.view.addSubview(this.sceneView);
    this.sceneView.presentScene(this.scene);
    this.scene.backgroundColor = NSColor.clearColor;
    this.sceneView.allowsTransparency = true;

    this.sceneView.preferredFramesPerSecond = 120;
  }

  viewDidLayout() {
    super.viewDidLayout();
    this.scene.size = this.view.bounds.size;
    this.sceneView.frame = this.view.bounds;
    this.scene.physicsBody = SKPhysicsBody.bodyWithEdgeLoopFromRect(
      this.view.bounds
    );
    this.scene.physicsBody.contactTestBitMask = 1;
  }
}
```

This view controller sets up the SpriteKit scene environment, the corresponding scene view, and also the physics body to allow the ball to collide on the edges. Automatically updates the scene size when the view size changes in `viewDidLayout`.

Let's also use this view controller in the app delegate to set it as the root view controller of the window.

```diff
    ballWindow?: NSWindow;
+   ballViewController = ViewController.new();

    ...

      window.level = NSScreenSaverWindowLevel;
+     window.contentViewController = this.ballViewController;
```

To launch the ball and redock it, let's define two methods in here: `launch` and `dock`. Both of them will accept a `CGRect` that defines the dock tile position in screen coordinates taking into consideration the mouse position where the dock icon was clicked.

```ts
export class ViewController extends NSViewController {
  ...
  physicsQueue: CallableFunction[] = [];

  _ball?: Ball;

  get ball() {
    return this._ball;
  }

  set ball(value) {
    this.ball?.destroy();

    this._ball = value;

    if (value) this.scene.addChild(value);
  }

  ...

  launch(rect: CGRect) {
    const screen = this.view.window?.screen;
    if (!screen) return;

    const ball = Ball.create(RADIUS, {
      x: CGRectGetMidX(rect),
      y: CGRectGetMidY(rect),
    });

    this.ball = ball;

    const strength = 2000;
    const impulse: CGVector = { dx: 0, dy: 0 };

    const distFromLeft = CGRectGetMidX(rect) - CGRectGetMinX(screen.frame);
    const distFromRight = CGRectGetMaxX(screen.frame) - CGRectGetMidX(rect);
    const distFromBottom = CGRectGetMidY(rect) - CGRectGetMinY(screen.frame);

    if (distFromBottom < 200) {
      impulse.dy = strength;
    }

    if (distFromLeft < 200) {
      impulse.dx = strength;
    } else if (distFromRight < 200) {
      impulse.dx = -strength;
    }

    ball.setScale(rect.size.width / (ball.radius * 2));
    const scaleUp = SKAction.scaleToDuration(1, 0.5);
    ball.runAction(scaleUp);

    this.physicsQueue.push(() => {
      ball.physicsBody.applyImpulse(impulse);
    });
  }

  dock(rect: CGRect, onComplete: () => void) {
    const ball = this.ball;

    if (!ball) {
      return onComplete();
    }

    if (ball.physicsBody) {
      ball.physicsBody.isDynamic = false;
      ball.physicsBody.affectedByGravity = false;
      ball.physicsBody.velocity = { dx: 0, dy: 0 };
    }

    ball.runAction(
      SKAction.scaleToDuration(rect.size.width / (ball.radius * 2), 0.25)
    );

    ball.runActionCompletion(
      SKAction.moveToDuration(
        {
          x: CGRectGetMidX(rect),
          y: CGRectGetMidY(rect),
        },
        0.25
      ),
      () => {
        this.ball = undefined;
        onComplete();
      }
    );
  }
}
```

Notice how we added a physics queue here, it consists of callbacks that must be run on next physics simulation only. We can do that using `SKSceneDelegate` protocol. And also, when the scene update finishes, we must call `ball.update` too.

```ts
export class ViewController extends NSViewController implements SKSceneDelegate {
  static ObjCProtocols = [SKSceneDelegate];

  ...

  didSimulatePhysicsForScene(_scene: SKScene): void {
    const queue = this.physicsQueue;
    this.physicsQueue = [];
    for (const cb of queue) cb();
  }

  didFinishUpdateForScene(_scene: SKScene): void {
    this.ball?.update();
  }
}
```

Now we need to figure out the dock icon position when it's clicked.

`util.ts`:

```ts
import "@nativescript/macos-node-api";

export const RADIUS = 100;

// From https://gist.github.com/wonderbit/c8896ff429a858021a7623f312dcdbf9

export const WBDockPosition = {
  BOTTOM: 0,
  LEFT: 1,
  RIGHT: 2,
} as const;

export function getDockPosition(screen: NSScreen) {
  if (screen.visibleFrame.origin.y == 0) {
    if (screen.visibleFrame.origin.x == 0) {
      return WBDockPosition.RIGHT;
    } else {
      return WBDockPosition.LEFT;
    }
  } else {
    return WBDockPosition.BOTTOM;
  }
}

export function getDockSize(screen: NSScreen, position: number) {
  let size;
  switch (position) {
    case WBDockPosition.RIGHT:
      size =
        screen.frame.size.width -
        screen.visibleFrame.size.width;
      return size;
    case WBDockPosition.LEFT:
      size = screen.visibleFrame.origin.x;
      return size;
    case WBDockPosition.BOTTOM:
      size = screen.visibleFrame.origin.y;
      return size;
    default:
      throw new Error("unreachable");
  }
}

export function getInferredRectOfHoveredDockIcon(screen: NSScreen): CGRect {
  // Keep in mind coords are inverted (y=0 at BOTTOM)
  const dockPos = getDockPosition(screen);
  const dockSize = getDockSize(screen, dockPos);
  const tileSize = dockSize * (64.0 / 79.0);
  // First, set center to the mouse pos
  const center = NSEvent.mouseLocation;
  if (dockPos == WBDockPosition.BOTTOM) {
    center.y = CGRectGetMinY(screen.frame) + tileSize / 2;
    // Dock icons are a little above the center of the dock rect
    center.y += (2.5 / 79) * dockSize;
  }
  return {
    origin: { x: center.x - tileSize / 2, y: center.y - tileSize / 2 },
    size: { width: tileSize, height: tileSize },
  };
}

export function constrainRect(r: CGRect, bounds: CGRect): CGRect {
  const boundsMinX = CGRectGetMinX(bounds);
  const boundsMaxX = CGRectGetMaxX(bounds);
  const boundsMinY = CGRectGetMinY(bounds);
  const boundsMaxY = CGRectGetMaxY(bounds);

  if (CGRectGetMinX(r) < boundsMinX) r.origin.x = boundsMinX;
  if (CGRectGetMaxX(r) > boundsMaxX) r.origin.x = boundsMaxX - r.size.width;
  if (CGRectGetMinY(r) < boundsMinY) r.origin.y = boundsMinY;
  if (CGRectGetMaxY(r) > boundsMaxY) r.origin.y = boundsMaxY - r.size.height;

  return r;
}

export function remap(
  x: number,
  domainStart: number,
  domainEnd: number,
  rangeStart: number,
  rangeEnd: number,
  clamp = true
) {
  const domain = domainEnd - domainStart;
  const range = rangeEnd - rangeStart;
  const value = (x - domainStart) / domain;
  const result = rangeStart + value * range;
  if (clamp) {
    if (rangeStart < rangeEnd) {
      return Math.min(Math.max(result, rangeStart), rangeEnd);
    } else {
      return Math.min(Math.max(result, rangeEnd), rangeStart);
    }
  } else {
    return result;
  }
}
```

Also added a utility function in there to constrain one `CGRect` within another `CGRect` (bounds).

Next, let's change the implementation of dock click event to launch/dock the ball.

```ts
export class AppDelegate
  extends NSObject
  implements NSApplicationDelegate, NSWindowDelegate
{
  ...

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
  }

  ...

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
```

Now we can run the project and see the ball launch and dock when the dock icon is clicked!

### Shadow

Let's also add a shadow to the ball that fades in when the ball is near the bottom of the screen.

`ball.ts`:

```ts
export class Ball extends SKNode {
  ...

  shadowSprite = SKSpriteNode.spriteNodeWithTexture(
    SKTexture.textureWithImage(
      NSImage.alloc().initWithContentsOfFile(
        new URL("../assets/ContactShadow.png", import.meta.url).pathname
      )
    )
  );
  shadowContainer = SKNode.new();

  ...

  static create(radius: number, pos: CGPoint) {
    ...

    ball.addChild(ball.shadowContainer);
    ball.shadowContainer.addChild(ball.shadowSprite);
    const shadowWidth = radius * 4;
    ball.shadowSprite.size = {
      width: shadowWidth,
      height: 0.564 * shadowWidth,
    };
    ball.shadowSprite.alpha = 0;
    ball.shadowContainer.alpha = 0;

    ball.addChild(ball.imgContainer);
    ball.imgContainer.addChild(ball.imgNode);

    return ball;
  }

  update() {
    this.shadowSprite.position = {
      x: 0,
      y: this.radius * 0.3 - this.position.y,
    };

    const distFromBottom = this.position.y - this.radius;
    this.shadowSprite.alpha = remap(distFromBottom, 0, 200, 1, 0);

    const yDelta = (-(1 - this.imgContainer.xScale) * this.radius) / 2;
    this.imgContainer.position = { x: 0, y: yDelta };
  }

  ...

  animateShadow(visible: boolean, duration: number) {
    if (visible) {
      this.shadowContainer.runAction(SKAction.fadeInWithDuration(duration));
    } else {
      this.shadowContainer.runAction(SKAction.fadeOutWithDuration(duration));
    }
  }

}
```

This makes the shadow more or less prominent based on the distance from bottom. We also need to call `animateShadow` in `launch` and `dock` methods in the view controller.

```ts
// in launch
ball.animateShadow(true, 0.5);

// in dock
ball.animateShadow(false, 0.25);
```

### Interactions

Next, let's add click handling. For that we need a window on same level but this time it accepts mouse events and only covers the part of the scene which is visible, i.e. the ball itself.

We start by defining the view which captures the click events by overriding `NSView` methods. It will redirect the click events to the ball view controller.

`mouse_catcher.ts`:

```ts
import "@nativescript/macos-node-api";

export interface MouseCatcherDelegate {
  onMouseDown(): void;
  onMouseDrag(): void;
  onMouseUp(): void;
  onScroll(event: NSEvent): void;
}

export class MouseCatcherView extends NSView {
  static {
    NativeClass(this);
  }

  delegate!: MouseCatcherDelegate;

  mouseDown(_event: NSEvent) {
    this.delegate.onMouseDown();
  }

  mouseDragged(_event: NSEvent) {
    this.delegate.onMouseDrag();
  }

  mouseUp(_event: NSEvent) {
    this.delegate.onMouseUp();
  }

  scrollWheel(event: NSEvent) {
    if (!(event.hasPreciseScrollingDeltas && event.momentumPhase == 0)) {
      return;
    }

    this.delegate.onScroll(event);
  }
}
```

and in `app_delegate.ts`, we need to setup click window along with the ball / SpriteKit scene window. And its position needs to be updated along with the ball itself, so we added a callback to the ball view controller to update the click window position whenever the ball position changes. For convenience, we also add a getter to get the mouse catcher rect from the ball view controller.

```ts
export class AppDelegate
  extends NSObject
  implements NSApplicationDelegate, NSWindowDelegate
{
  ...

  clickWindow!: NSWindow;

  ...

  set ballVisible(value) {
    ...

    this.clickWindow.setIsVisible(value);
    if (value) {
      this.updateClickWindow();
    }
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

  ...

  applicationDidFinishLaunching(_notification: NSNotification): void {
    ...
    this.makeClickWindow();
  }
}
```

Here's how the `mouseCatcherRect` getter is implemented in `view_controller.ts`:

```ts
export class ViewController
  extends NSViewController
  implements SKSceneDelegate
{
  ...

  tempMouseCatcherRect?: CGRect;

  get mouseCatcherRect(): CGRect | undefined {
    const rect = this.tempMouseCatcherRect ?? this.ball?.rect;
    const window = this.view.window;

    if (rect && window) {
      return window.convertRectToScreen(rect);
    }
  }
  
  ...
}
```

And add the `rect` getter to ball class:

```ts
export class Ball extends SKNode {
  ...

  get rect() {
    return {
      origin: {
        x: this.position.x - this.radius,
        y: this.position.y - this.radius,
      },
      size: { width: this.radius * 2, height: this.radius * 2 },
    };
  }

  ...
}
```

Note, the temp mouse catcher rect is there for overriding the ball rect when the ball is being dragged using scroll event, in which case we want the mouse catcher rect to stay in the initial position mouse was, not the ball's position which will change as its being dragged via scroll event.

We need to handle the events next. But before doing that, let's implement how the ball should move when dragged. It's going to follow the mouse as expected and in case of scroll it moves in the direction of scroll, but when its released from that state of drag there must be a certain impulse applied to it. To implement that, we must keep track of the velocity during drag and then calculate the impulse at the end of drag state.

`view_controller.ts`:

```ts
export interface Sample {
  time: number;
  pos: CGPoint;
}

export class VelocityTracker {
  samples: Sample[] = [];

  add(pos: CGPoint) {
    const time = CACurrentMediaTime();
    const sample = { time, pos };
    this.samples.push(sample);
    this.samples = this.filteredSamples;
  }

  get filteredSamples() {
    const time = CACurrentMediaTime();
    const filtered = this.samples.filter((sample) => time - sample.time < 0.1);
    return filtered;
  }

  get velocity(): CGPoint {
    const samples = this.filteredSamples;
    if (samples.length < 2) {
      return CGPointZero;
    }
    const first = samples[0];
    const last = samples[samples.length - 1];
    const delta = {
      x: last.pos.x - first.pos.x,
      y: last.pos.y - first.pos.y,
    };
    const time = last.time - first.time;
    return {
      x: delta.x / time,
      y: delta.y / time,
    };
  }
}

export class DragState {
  velocityTracker = new VelocityTracker();

  constructor(
    public ballStart: CGPoint,
    public mouseStart: CGPoint,
    public currentMousePos: CGPoint
  ) {}

  get currentBallPos() {
    const delta = {
      x: this.currentMousePos.x - this.mouseStart.x,
      y: this.currentMousePos.y - this.mouseStart.y,
    };
    return {
      x: this.ballStart.x + delta.x,
      y: this.ballStart.y + delta.y,
    };
  }
}

export class ViewController
  extends NSViewController
  implements SKSceneDelegate, MouseCatcherDelegate
{
  ...

  _dragState?: DragState;

  get dragState() {
    return this._dragState;
  }

  set dragState(value) {
    this._dragState = value;

    if (value && this.ball) {
      this.ball.physicsBody.isDynamic = false;

      const pos = value.currentBallPos;

      const constrainedRect = constrainRect(
        {
          origin: { x: pos.x - this.ball.radius, y: pos.y - this.ball.radius },
          size: { width: this.ball.radius * 2, height: this.ball.radius * 2 },
        },
        this.view.bounds
      );

      this.ball.position = {
        x: CGRectGetMidX(constrainedRect),
        y: CGRectGetMidY(constrainedRect),
      };
    } else if (this.ball) {
      this.ball.physicsBody.isDynamic = true;
    }
  }

  ballPositionChanged?: () => void;

  ...

  get mouseScenePos() {
    const viewPos = this.sceneView.convertPointFromView(
      this.view.window.mouseLocationOutsideOfEventStream,
      null
    );
    const scenePos = this.scene.convertPointFromView(viewPos);
    return scenePos;
  }

  onMouseDown() {
    const scenePos = this.mouseScenePos;
    if (this.ball && this.ball.containsPoint(scenePos)) {
      this.dragState = new DragState(this.ball.position, scenePos, scenePos);
    } else {
      this.dragState = undefined;
    }
  }

  onMouseDrag() {
    if (this.dragState) {
      this.dragState.currentMousePos = this.mouseScenePos;
      this.dragState.velocityTracker.add(this.dragState.currentMousePos);
      this.dragState = this.dragState;
    }
  }

  onMouseUp() {
    const velocity = this.dragState?.velocityTracker.velocity ?? CGPointZero;
    this.dragState = undefined;

    if (CGPointGetLength(velocity) > 0) {
      this.ball?.physicsBody?.applyImpulse({ dx: velocity.x, dy: velocity.y });
    }
  }

  onScroll(event: NSEvent) {
    switch (event.phase) {
      case NSEventPhase.Began:
        if (this.ball) {
          this.dragState = new DragState(
            this.ball.position,
            CGPointZero,
            CGPointZero
          );
          this.tempMouseCatcherRect = this.mouseCatcherRect;
        }
        break;
      case NSEventPhase.Changed:
        if (this.dragState) {
          this.dragState.currentMousePos.x += event.scrollingDeltaX;
          this.dragState.currentMousePos.y -= event.scrollingDeltaY;
          this.dragState.velocityTracker.add({
            x: this.dragState.currentMousePos.x,
            y: this.dragState.currentMousePos.y,
          });
          this.dragState = this.dragState;
        }
        break;
      case NSEventPhase.Ended:
      case NSEventPhase.Cancelled: {
        const velocity =
          this.dragState?.velocityTracker.velocity ?? CGPointZero;
        this.dragState = undefined;

        if (CGPointGetLength(velocity) > 0) {
          this.ball?.physicsBody?.applyImpulse({
            dx: velocity.x,
            dy: velocity.y,
          });
        }

        this.tempMouseCatcherRect = undefined;
        break;
      }
      default:
        break;
    }
  }

  updateForScene(_currentTime: number, _scene: SKScene): void {
    this.ballPositionChanged?.();
  }
}
```

Also add this utility function to `util.ts`:

```ts
export function CGPointGetLength(p: CGPoint) {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}
```

Aaand that's it! Now you can run the project and have the ball draggable using mouse events!

There's still two things left to do: sounds and animations. Sounds will be easy, and adding animations will be quite fun!

### Sounds

Here's what we'll do: load the sounds in view controller, initialize them to make sure they're ready to play, and then play them when the ball hits the screen boundaries - which we detect using `SKPhysicsContactDelegate` protocol.

```ts
export class ViewController
  extends NSViewController
  implements SKSceneDelegate, MouseCatcherDelegate, SKPhysicsContactDelegate
{
  static ObjCProtocols = [SKSceneDelegate, SKPhysicsContactDelegate];

  ...

  sounds = ["pop_01", "pop_02", "pop_03"].map((id) =>
    NSSound.alloc().initWithContentsOfFileByReference(
      new URL(`../assets/${id}.caf`, import.meta.url).pathname,
      true
    )
  );

  viewDidLoad() {
    super.viewDidLoad();

    this.view.addSubview(this.sceneView);
    this.sceneView.presentScene(this.scene);
    this.scene.backgroundColor = NSColor.clearColor;
    this.scene.delegate = this;
    this.scene.physicsWorld.contactDelegate = this;
    this.sceneView.allowsTransparency = true;

    this.sceneView.preferredFramesPerSecond = 120;

    for (const sound of this.sounds) {
      sound.volume = 0;
      sound.play();
    }
  }

  ...

  didBeginContact(contact: SKPhysicsContact) {
    const minImpulse = 1000;
    const maxImpulse = 2000;

    const collisionStrength = remap(
      contact.collisionImpulse,
      minImpulse,
      maxImpulse,
      0,
      0.5
    );

    if (collisionStrength <= 0) return;

    NSOperationQueue.mainQueue.addOperationWithBlock(() => {
      const sounds = this.sounds;
      const soundsUsable = sounds.filter((sound) => !sound.isPlaying);
      if (soundsUsable.length === 0) return;
      const randomSound =
        soundsUsable[Math.floor(Math.random() * soundsUsable.length)];
      randomSound.volume = collisionStrength;
      randomSound.play();
    });
  }
}
```

That's all! Now when you run it, you will be able to hear fun sound effects as the ball collides with the screen boundaries.

### Animations

This part is not as trivial to implement because we'll do it a bit differently. We'll use `popmotion` from npm to implement the spring animations we'll use in two places: one when the ball is being dragged that it scales up a bit, and other when the ball hits the screen boundaries that it squishes.

The only animation we need is a spring animation. On the web, `popmotion` will use `requestAnimationFrame` to animate the values, but here we don't have that. Instead, we'll implement our own animation loop using `CADisplayLink`. You can read more about drivers [here in popmotion documentation](https://popmotion.io/#quick-start-animation-animate-options-driver).

So essentially driver is a function that accepts a callback which is called on every frame/tick, and it returns a function that stops the animation. First, let's implement the driver and then the animation function.

`motion.ts`:

```ts
import "@nativescript/macos-node-api";
import { Driver } from "popmotion";

export class CALayerDriver extends NSObject {
  static ObjCExposedMethods = {
    tick: { returns: interop.types.void, params: [] },
  };

  static {
    NativeClass(this);
  }

  displayLink?: CADisplayLink;
  tickers = new Set<(timestamp: number) => void>();
  prevTick?: number;

  tick() {
    if (!this.displayLink) {
      throw new Error("Display link is not initialized and tick was called");
    }

    const timestamp = performance.now();
    const delta = this.prevTick ? timestamp - this.prevTick : 0;
    this.prevTick = timestamp;

    for (const ticker of this.tickers) {
      ticker(delta);
    }
  }

  static instance = CALayerDriver.new();

  static driver: Driver = (update) => {
    return {
      start: () => {
        this.instance.tickers.add(update);

        if (this.instance.tickers.size === 1) {
          this.start();
        }
      },

      stop: () => {
        if (!this.instance.tickers.delete(update)) {
          return;
        }

        if (this.instance.tickers.size === 0) {
          this.stop();
        }
      },
    };
  };

  static start() {
    if (this.instance.displayLink) {
      return;
    }

    this.instance.displayLink =
      NSScreen.mainScreen.displayLinkWithTargetSelector(this.instance, "tick");

    this.instance.displayLink.addToRunLoopForMode(
      NSRunLoop.currentRunLoop,
      NSDefaultRunLoopMode
    );

    this.instance.displayLink.preferredFrameRateRange = {
      minimum: 90,
      maximum: 120,
      preferred: 120,
    };

    this.instance.prevTick = performance.now();
  }

  static stop() {
    if (!this.instance.displayLink) {
      return;
    }

    this.instance.displayLink.invalidate();
    this.instance.displayLink = undefined;
  }
}
```

Now let's implement the spring animation.

`motion.ts`:

```ts
export class SpringParams {
  static passiveEase = new SpringParams(0.35, 0.85);

  constructor(
    public response: number,
    public dampingRatio: number,
    public epsilon = 0.01
  ) {}
}

export interface Sample {
  time: number;
  value: number;
}

export class VelocityTracker {
  samples: Sample[] = [];

  addSample(val: number) {
    this.samples.push({ time: CACurrentMediaTime(), value: val });
    this.trim();
  }

  get velocity() {
    this.trim();
    if (this.samples[0] && this.samples[this.samples.length - 1]) {
      const timeDelta = CACurrentMediaTime() - this.samples[0].time;
      const distDelta =
        this.samples[this.samples.length - 1].value - this.samples[0].value;
      if (timeDelta > 0) {
        return distDelta / timeDelta;
      }
    }
    return 0;
  }

  lookBack = 1.0 / 15;

  trim() {
    const now = CACurrentMediaTime();
    while (
      this.samples.length > 0 &&
      now - this.samples[0].time > this.lookBack
    ) {
      this.samples.shift();
    }
  }
}

export class SpringAnimation {
  animating = false;

  externallySetVelocityTracker = new VelocityTracker();

  onChange?: (value: number) => void;

  _value = 0;

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = value;
    this.stop();
    this.externallySetVelocityTracker.addSample(value);
  }

  targetValue?: number;
  _velocity?: number;

  stopFunction?: () => void;

  get velocity() {
    return this.animating
      ? this._velocity ?? 0
      : this.externallySetVelocityTracker.velocity;
  }

  constructor(
    initialValue: number,
    public scale: number,
    public params: SpringParams = SpringParams.passiveEase
  ) {
    this.value = initialValue;
  }

  start(targetValue: number, velocity: number) {
    this.stop();
    this.animating = true;
    this.targetValue = targetValue;
    this._velocity = velocity;

    this.stopFunction = animate({
      type: "spring",

      from: this.value * this.scale,
      to: this.targetValue * this.scale,

      velocity: this.velocity * this.scale,
      stiffness: Math.pow((2 * Math.PI) / this.params.response, 2),
      damping: (4 * Math.PI * this.params.dampingRatio) / this.params.response,
      restDelta: this.params.epsilon,

      driver: CALayerDriver.driver,

      onUpdate: (value) => {
        this._value = value / this.scale;
        this.onChange?.(this.value);
      },

      onComplete: () => {
        this.stopFunction = undefined;
        this.stop();
      },
    }).stop;
  }

  stop() {
    this.targetValue = undefined;
    this.animating = false;
    this.stopFunction?.();
  }
}
```

To use this animation class, let's add it to the ball class.

`ball.ts`:

```ts
export class Ball extends SKNode {
  ...

  dragScale = new SpringAnimation(1, 1000, new SpringParams(0.2, 0.8));
  squish = new SpringAnimation(1, 1000, new SpringParams(0.3, 0.5));

  ...

  _beingDragged = false;

  animateDrag(beingDragged: boolean) {
    const old = this._beingDragged;
    this._beingDragged = beingDragged;

    if (old === beingDragged) {
      return;
    }

    this.dragScale.start(beingDragged ? 1.05 : 1, this.dragScale.velocity);
  }

  ...

  update() {
    this.shadowSprite.position = {
      x: 0,
      y: this.radius * 0.3 - this.position.y,
    };

    const distFromBottom = this.position.y - this.radius;
    this.shadowSprite.alpha = remap(distFromBottom, 0, 200, 1, 0);

    const yDelta = (-(1 - this.imgContainer.xScale) * this.radius) / 2;
    this.imgContainer.position = { x: 0, y: yDelta };

    this.imgContainer.xScale = this.squish.value;
    this.imgNode.setScale(this.dragScale.value);
  }

  ...

  didCollide(strength: number, normal: CGVector) {
    const angle = Math.atan2(normal.dy, normal.dx);
    this.imgContainer.zRotation = angle;
    this.imgNode.zRotation = -angle;

    const targetScale = remap(strength, 0, 1, 1, 0.8);
    const velocity = remap(strength, 0, 1, -5, -10);
    this.squish.start(targetScale, velocity);

    NSTimer.scheduledTimerWithTimeIntervalRepeatsBlock(0.01, false, () => {
      this.squish.start(1, velocity);
    });
  }
}
```

The functions to animate squish and drag are complete but we need to call them from the view controller.

`view_controller.ts`:

```ts

export class ViewController
  extends NSViewController
  implements SKSceneDelegate, MouseCatcherDelegate, SKPhysicsContactDelegate
{
  ...

  set dragState(value) {
    ...

    this.ball?.animateDrag(!!value);
  }

  ...

  didBeginContact(contact: SKPhysicsContact) {
    ...

    this.ball?.didCollide(collisionStrength, contact.contactNormal);

    ...
  }
}
```

That's all for the animations: run the project now, and you will see how the ball scales up/down when being dragged, and squishes when it collides! At this point, this project is feature complete with the original project by Nate Parrott mentioned at the beginning of this post.
