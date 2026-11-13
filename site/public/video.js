// SITE-6: the clips play only while they're on screen, and not at all for anyone who has asked for
// less motion, who can start one themselves. Without this file, each shows its first picture.
(function () {
    var videos = Array.prototype.slice.call(document.querySelectorAll("video[data-clip]"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
        videos.forEach(function (v) { v.controls = true; });
        return;
    }
    var seen = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                var playing = entry.target.play();
                // Refused, as on a phone saving power: it stays on its picture, with a way to start it.
                if (playing) { playing.catch(function (e) { if (e.name === "NotAllowedError") { entry.target.controls = true; } }); }
            } else {
                entry.target.pause();
            }
        });
    }, { threshold: 0.4 });
    videos.forEach(function (v) { seen.observe(v); });
}());
