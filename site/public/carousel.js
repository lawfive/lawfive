// SITE-7: on a phone, the long grids become rows to swipe, which the styles do by themselves. This adds
// the dots under each. Without this file they still swipe.
(function () {
    var smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.querySelectorAll("[data-carousel]").forEach(function (track) {
        var slides = Array.prototype.slice.call(track.children);
        var pager = document.createElement("div");
        pager.className = "pager";
        var name = track.getAttribute("aria-label") || "Slides";
        var dots = slides.map(function (slide, i) {
            var dot = document.createElement("button");
            dot.type = "button";
            dot.setAttribute("aria-label", name + ": show " + (i + 1) + " of " + slides.length);
            dot.addEventListener("click", function () {
                var inset = parseFloat(getComputedStyle(track).paddingLeft) || 0;
                track.scrollTo({ left: slide.offsetLeft - track.offsetLeft - inset, behavior: smooth ? "smooth" : "auto" });
            });
            pager.appendChild(dot);
            return dot;
        });
        track.parentNode.insertBefore(pager, track.nextSibling);
        function mark() {
            var inset = parseFloat(getComputedStyle(track).paddingLeft) || 0;
            var left = track.scrollLeft, best = 0, gap = Infinity;
            slides.forEach(function (s, i) {
                var d = Math.abs(s.offsetLeft - track.offsetLeft - inset - left);
                if (d < gap) { gap = d; best = i; }
            });
            // The last slide can't always reach the start, so the end of the row counts as it.
            if (left > 0 && left + track.clientWidth >= track.scrollWidth - 2) { best = slides.length - 1; }
            dots.forEach(function (d, i) { d.setAttribute("aria-current", i === best ? "true" : "false"); });
        }
        track.addEventListener("scroll", mark, { passive: true });
        window.addEventListener("resize", mark);
        mark();
    });
}());
