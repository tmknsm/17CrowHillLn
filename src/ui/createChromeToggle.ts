/**
 * Toggle the entire UI "chrome" (header, panels, HUD) on/off so the user can
 * see the map alone. The toggle button itself stays visible so chrome can be
 * brought back. Driven by toggling the `chrome-hidden` class on <body>.
 */
export function bindChromeToggle(): void {
  const button = document.getElementById("chrome-toggle");
  if (!button) return;

  let hidden = false;

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
