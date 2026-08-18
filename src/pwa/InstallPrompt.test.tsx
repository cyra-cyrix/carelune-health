// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

afterEach(cleanup);
beforeEach(() => localStorage.clear());

/** The event Chromium fires when the app is genuinely installable. */
function fireInstallable() {
  const event = new Event("beforeinstallprompt") as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  event.prompt = vi.fn(async () => undefined);
  event.userChoice = Promise.resolve({ outcome: "accepted" as const });
  act(() => { window.dispatchEvent(event); });
  return event;
}

describe("InstallPrompt", () => {
  it("stays hidden until the browser says the app is installable", () => {
    render(<InstallPrompt />);
    expect(screen.queryByRole("dialog", { name: "Install the Carelune app" })).toBeNull();
  });

  it("offers the native prompt once the browser signals installability", async () => {
    render(<InstallPrompt />);
    const event = fireInstallable();

    expect(screen.getByRole("dialog", { name: "Install the Carelune app" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Install" }));
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("disappears when dismissed and does not come back on the next visit", () => {
    const first = render(<InstallPrompt />);
    fireInstallable();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("dialog", { name: "Install the Carelune app" })).toBeNull();
    expect(localStorage.getItem("carelune.pwa.install.dismissed")).toBe("1");

    first.unmount();
    render(<InstallPrompt />);
    fireInstallable();
    expect(screen.queryByRole("dialog", { name: "Install the Carelune app" })).toBeNull();
  });

  it("writes out the Safari steps when there is no installable event to use", () => {
    const ua = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", { value: "iPhone Safari", configurable: true });
    try {
      render(<InstallPrompt />);
      fireEvent.click(screen.getByRole("button", { name: "How" }));
      expect(screen.getByText("Tap the Share button in Safari")).toBeTruthy();
      expect(screen.getByText("Choose “Add to Home Screen”")).toBeTruthy();
      expect(screen.getByText("Tap “Add”")).toBeTruthy();
    } finally {
      Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
    }
  });
});
