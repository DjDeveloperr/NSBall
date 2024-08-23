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
        new URL("../assets/Ball.png", import.meta.url).pathname
      )
    )
  );

  radius = 0;

  get rect() {
    return {
      origin: {
        x: this.position.x - this.radius,
        y: this.position.y - this.radius,
      },
      size: { width: this.radius * 2, height: this.radius * 2 },
    };
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

    ball.addChild(ball.imgContainer);
    ball.imgContainer.addChild(ball.imgNode);

    return ball;
  }

  update() {
    const yDelta = (-(1 - this.imgContainer.xScale) * this.radius) / 2;
    this.imgContainer.position = { x: 0, y: yDelta };
  }

  destroy() {
    this.removeFromParent();
    // @ts-expect-error it can be null, but headers do not make it nullable
    this.physicsBody = null;
  }
}
