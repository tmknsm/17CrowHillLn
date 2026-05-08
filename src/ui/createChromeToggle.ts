/**
 * Toggle the entire UI "chrome" (header, panels, HUD) on/off so the user can
 * see the map alone. The toggle button itself stays visible so chrome can be
 * brought back. Driven by toggling the `chrome-hidden` class on <body>.
 *
 * On phones / small tablets the chrome starts hidden so the limited screen
 * real estate goes to the map first; the user can tap the eye to reveal it.
 */
export function bindChromeToggle(): void {
  const button = document.getElementById("chrome-toggle");
  if (!button) return;

  const isMobile =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 768px)").matches;
  let hidden = isMobile;

  const update = (): void => {
    document.body.classList.toggle("chrome-hidden", hidden);
    button.dataset.state = hidden ? "hidden" : "visible";
    const label = hidden ? "Show interface" : "Hide interface";
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.setAttribute("aria-pressed", hidden ? "true" : "false");
  };

  button.addEventListener("click", () => {
    hidden = !hidden;
    update();
  });

  update();
}
