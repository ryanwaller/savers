// MainViewController.swift
//
// Custom Capacitor bridge view controller that registers our in-app
// plugins. Capacitor 7 doesn't auto-discover Swift plugins that aren't
// shipped as npm packages, so we register them explicitly here.
//
// Setup (one time, in Xcode):
//   1. Drag this file into the App target alongside AuthSessionPlugin.swift.
//   2. Open Main.storyboard. Click the bridge view controller (the only
//      view controller in the storyboard). In the right inspector under
//      "Custom Class", change Class from `CAPBridgeViewController` to
//      `MainViewController`.
//   3. Build & run.

import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(AuthSessionPlugin())
    }
}
