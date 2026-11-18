(() => {
  "use strict";
  const figure = document.getElementById("mieterstrom-animation");
  if (!figure) return;
  const svg = figure.querySelector("svg");
  const meters = [...svg.querySelectorAll(".meter")];
  const devices = [...svg.querySelectorAll(".device")];
  const hub = svg.querySelector(".hub");
  const finish = svg.querySelector(".finish");
  const wires = [...svg.querySelectorAll(".wire")];
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timers = [];
  let observer;
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const after = (ms, fn) => timers.push(setTimeout(fn, ms));
  const show = (element) => element.classList.add("show");
  function complete() {
    clear();
    [...meters, ...devices, hub, finish].forEach(show);
    wires.forEach(wire => { wire.style.strokeDashoffset = "0"; });
  }
  function play() {
    clear();
    if (motion.matches) { complete(); return; }
    figure.classList.add("is-playing");
    [...meters, ...devices, hub, finish].forEach(element => element.classList.remove("show"));
    wires.forEach(wire => {
      const length = wire.getTotalLength();
      wire.style.transition = "none";
      wire.style.strokeDasharray = String(length);
      wire.style.strokeDashoffset = String(length);
      wire.getBoundingClientRect();
      wire.style.transition = "";
    });
    meters.slice(0, 4).forEach((meter, i) => after(300 + i * 550, () => show(meter)));
    devices.forEach((device, i) => after(2700 + i * 160, () => show(device)));
    meters.slice(4).forEach((meter, i) => after(3000 + i * 400, () => show(meter)));
    after(4500, () => show(hub));
    wires.forEach((wire, i) => after(5100 + i * 140, () => { wire.style.strokeDashoffset = "0"; }));
    after(8500, () => show(finish));
  }
  motion.addEventListener("change", () => { if (motion.matches) complete(); });
  if (!motion.matches && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); play(); }
    }, { threshold: 0.2 });
    observer.observe(figure);
  }
  window.addEventListener("pagehide", clear);
})();
