import "@nativescript/macos-node-api";
import { Ball } from "./ball.js";
import { CGPointGetLength, constrainRect, RADIUS, remap } from "./util.js";
import { MouseCatcherDelegate } from "./mouse_catcher.js";

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
  implements SKSceneDelegate, MouseCatcherDelegate, SKPhysicsContactDelegate
{
  static ObjCProtocols = [SKSceneDelegate, SKPhysicsContactDelegate];

  static {
    NativeClass(this);
  }

  scene = SKScene.sceneWithSize({ width: 200, height: 200 });
  sceneView = SKView.new();

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

  tempMouseCatcherRect?: CGRect;

  get mouseCatcherRect(): CGRect | undefined {
    const rect = this.tempMouseCatcherRect ?? this.ball?.rect;
    const window = this.view.window;

    if (rect && window) {
      return window.convertRectToScreen(rect);
    }
  }

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

  viewDidLayout() {
    super.viewDidLayout();
    this.scene.size = this.view.bounds.size;
    this.sceneView.frame = this.view.bounds;
    this.scene.physicsBody = SKPhysicsBody.bodyWithEdgeLoopFromRect(
      this.view.bounds
    );
    this.scene.physicsBody.contactTestBitMask = 1;
  }

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

  didSimulatePhysicsForScene(_scene: SKScene): void {
    const queue = this.physicsQueue;
    this.physicsQueue = [];
    for (const cb of queue) cb();
  }

  didFinishUpdateForScene(_scene: SKScene): void {
    this.ball?.update();
  }

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
