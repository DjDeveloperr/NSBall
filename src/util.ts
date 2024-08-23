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
      size = screen.frame.size.width - screen.visibleFrame.size.width;
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

export function CGPointGetLength(point: CGPoint) {
  return Math.sqrt(point.x * point.x + point.y * point.y);
}
