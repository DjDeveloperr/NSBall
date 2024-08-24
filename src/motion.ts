import "@nativescript/macos-node-api";
import { animate, Driver } from "popmotion";

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
