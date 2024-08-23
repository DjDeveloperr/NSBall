import "@nativescript/macos-node-api";

objc.import("AppKit");

import { AppDelegate } from "./app_delegate.js";

const NSApp = NSApplication.sharedApplication;

NSApp.delegate = AppDelegate.new();
NSApp.setActivationPolicy(NSApplicationActivationPolicy.Regular);

NSApplicationMain(0, null);
