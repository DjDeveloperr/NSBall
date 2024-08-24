import "@nativescript/macos-node-api";
import { SpringAnimation, SpringParams } from "./motion.js";
import { remap } from "./util.js";

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
        new URL("../assets/Ball.png", import.meta.url).pathname
      )
    )
  );

  shadowSprite = SKSpriteNode.spriteNodeWithTexture(
    SKTexture.textureWithImage(
      NSImage.alloc().initWithContentsOfFile(
        new URL("../assets/ContactShadow.png", import.meta.url).pathname
      )
    )
  );
  shadowContainer = SKNode.new();

  radius = 0;

  dragScale = new SpringAnimation(1, 1000, new SpringParams(0.2, 0.8));
  squish = new SpringAnimation(1, 1000, new SpringParams(0.3, 0.5));

  get rect() {
    return {
      origin: {
        x: this.position.x - this.radius,
        y: this.position.y - this.radius,
      },
      size: { width: this.radius * 2, height: this.radius * 2 },
    };
  }

  _beingDragged = false;

  animateDrag(beingDragged: boolean) {
    const old = this._beingDragged;
    this._beingDragged = beingDragged;

    if (old === beingDragged) {
      return;
    }

    this.dragScale.start(beingDragged ? 1.05 : 1, this.dragScale.velocity);
  }

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

    this.imgContainer.xScale = this.squish.value;
    this.imgNode.setScale(this.dragScale.value);
  }

  destroy() {
    this.removeFromParent();
    // @ts-expect-error it can be null, but headers do not make it nullable
    this.physicsBody = null;
  }

  animateShadow(visible: boolean, duration: number) {
    if (visible) {
      this.shadowContainer.runAction(SKAction.fadeInWithDuration(duration));
    } else {
      this.shadowContainer.runAction(SKAction.fadeOutWithDuration(duration));
    }
  }

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
