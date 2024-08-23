# Introducing NativeScript Node-API

A rewrite of the core NativeScript runtime that allows it to run on any JavaScript VM that implements the Node-API, unlike how NativeScript was tightly coupled to V8 API before (and formerly JSC for the iOS runtime). Currently, the new runtime only supports C/Objective-C bindings so the iOS, macOS and co platforms are supported. Android support is coming soon.

It can plug directly into Node.js and Deno, and can be used with Hermes and quickjs with Node-API support as well to build with mobile applications such as on iOS.

NativeScript has already worked very well on iOS and Android, but what is new here? Desktop support - now you can leverage the power of native platform APIs - frameworks like AppKit on macOS, Metal for GPU based compute or graphics, MLCompute for accelerated machine learning applications, right in your Node.js or Deno applications.

> Note: There's some examples in the `examples` directory that demonstrate how to use NativeScript Node-API with various frameworks!

We came across this project: [Ball by Nate Parrot](https://github.com/nate-parrott/ball) - which is like a ball that sits in your dock and you can click to launch the ball (or re-dock it) that overlays on your screen, and you can interact with it. There are some fun little details to it, and it uses AppKit & SpriteKit to render the ball and the physics of it, with a bit of animations using Swift Motion library - but we did that using popmotion in JS instead! It's a fun little project to tinker with, and it's a great example of what you can do with NativeScript Node-API.

The beauty of NativeScript is that native APIs are available almost 1:1 in JavaScript, so all you need are Apple docs open by the side and start building something. Even though that project is written in Swift, it's still straightforward to understand the logic and do it the exact same way in JavaScript.

## Understanding the project

When we look at the source, the main entrypoint is `AppDelegate` class (part of AppDelegate.swift) which makes use of `AppController`. The ball launches from the dock and also goes back there so the dock events are handled in the app delegate, then there is app controller which is the main controller for the app that abstracts the main logic of the app such as launching and docking the ball in `dockIconClicked` and also handles the two windows used here. One is the window with the ball rendered using SpriteKit that covers the whole screen, and the other is a small transparent window that sits on top and is the exact same size as the ball just to capture mouse events (dragging the ball around). That is all for the basic logic of how this project works.

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

## Making the Ball bounce on screen

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

Now, when the application finishes launching, what we'll do is make a window on screen saver level that covers the whole screen and renders the ball using SpriteKit. Let's make that first.

```ts
export class AppDelegate extends NSObject implements NSApplicationDelegate {
  ...

  ballWindow?: NSWindow;

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
    const screen = this.ballWindow?.screen;
    if (!screen) {
      return;
    }

    this.ballWindow!.setFrameDisplay({
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

To actually launch the ball and redock it, let's define two methods in here: `launch` and `dock`. Both of them will accept a `CGRect` that defines the dock tile position in screen coordinates taking into consideration the mouse position where the dock icon was clicked.

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

Next, let's add click handling. For that we need a window on same level but this time it accepts mouse events and only covers the part of the scene which is visible, i.e. the ball itself.
