(() => {
  if (document.querySelector("[data-bureau-bar]")) return;

  const NAV_ITEMS = [
    { href: "/", label: "Station PO1", code: "HUB" },
    { href: "/bottles", label: "The Shore", code: "DRIFT" },
    { href: "/transmission", label: "Frequency 74", code: "CO-OP" },
  ];

  const TICKER_SEGMENTS = [
    { label: "STATION PO1", value: "(PORTSMOUTH)", tone: "strong" },
    { label: "SOLENT TIDE:", value: "RISING", tone: "em" },
    { label: "ECHO INTERFERENCE:", value: "ACTIVE", tone: "strong" },
    { label: "SOUTHAMPTON:", value: "STILL THERE (UNFORTUNATELY)", tone: "plain" },
  ];

  function normalizePath(pathname) {
    if (!pathname || pathname === "/") return "/";
    return pathname.replace(/\/+$/, "");
  }

  function buildTickerSpan(hidden) {
    const span = document.createElement("span");
    span.className = "bureau-bar__ticker-item";
    if (hidden) span.setAttribute("aria-hidden", "true");

    TICKER_SEGMENTS.forEach((segment, index) => {
      if (index > 0) span.append("  |  ");
      span.append(segment.label, " ");
      if (segment.tone === "strong") {
        const el = document.createElement("strong");
        el.textContent = segment.value;
        span.append(el);
      } else if (segment.tone === "em") {
        const el = document.createElement("em");
        el.textContent = segment.value;
        span.append(el);
      } else {
        span.append(segment.value);
      }
    });
    return span;
  }

  function mountHeader() {
    if (!document.body || document.querySelector("[data-bureau-bar]")) return;

    const current = normalizePath(window.location.pathname);

    const header = document.createElement("header");
    header.className = "bureau-bar";
    header.dataset.bureauBar = "true";

    const navRow = document.createElement("div");
    navRow.className = "bureau-bar__nav-row";

    const brand = document.createElement("a");
    brand.className = "bureau-bar__brand";
    brand.href = "/";
    const lamp = document.createElement("span");
    lamp.className = "bureau-bar__lamp";
    lamp.setAttribute("aria-hidden", "true");
    brand.append(lamp, "SOLENT SIGNAL BUREAU · PO1");

    const nav = document.createElement("nav");
    nav.className = "bureau-bar__links";
    nav.setAttribute("aria-label", "Station PO1 navigation");

    for (const item of NAV_ITEMS) {
      const link = document.createElement("a");
      link.className = "bureau-bar__link";
      link.href = item.href;
      if (current === item.href) link.setAttribute("aria-current", "page");

      const text = document.createElement("span");
      text.textContent = item.label;
      const code = document.createElement("span");
      code.className = "bureau-bar__code";
      code.textContent = `[${item.code}]`;

      link.append(text, code);
      nav.append(link);
    }

    navRow.append(brand, nav);

    const tickerWrap = document.createElement("div");
    tickerWrap.className = "bureau-bar__ticker-wrap";
    tickerWrap.setAttribute("role", "status");
    tickerWrap.setAttribute("aria-label", "Solent coastal status ticker");

    const ticker = document.createElement("div");
    ticker.className = "bureau-bar__ticker";
    ticker.append(buildTickerSpan(false), buildTickerSpan(true));
    tickerWrap.append(ticker);

    header.append(navRow, tickerWrap);
    document.body.prepend(header);

    const syncHeight = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--bureau-bar-height", `${height}px`);
    };

    syncHeight();
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(syncHeight).observe(header);
    } else {
      window.addEventListener("resize", syncHeight);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountHeader, { once: true });
  } else {
    mountHeader();
  }
})();
