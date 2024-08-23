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
