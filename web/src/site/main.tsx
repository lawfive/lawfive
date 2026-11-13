// lawfive.app's playable parts (SITE-1): the quiz, the match screen setup, Try a match and the match
// replay, from the website's own components. A page marks where each goes (<div data-lawfive="quiz">)
// with its picture inside; that part's code loads as it nears the screen and takes the picture's
// place. Without JavaScript, or opened without this build, the picture stays.

const parts: Record<string, () => Promise<{ mount: (el: HTMLElement) => void }>> = {
    quiz: () => import("./quiz.tsx"),
    setup: () => import("./setup.tsx"),
    try: () => import("./try.tsx"),
    replay: () => import("./replay.tsx"),
};

const near = new IntersectionObserver((entries) => {
    for (const entry of entries) {
        if (!entry.isIntersecting) {
            continue;
        }
        const el = entry.target as HTMLElement;
        near.unobserve(el);
        parts[el.dataset.lawfive ?? ""]?.()
            .then((part) => part.mount(el))
            .catch(() => {
                // The picture stays.
            });
    }
}, { rootMargin: "600px 0px" });

for (const el of document.querySelectorAll<HTMLElement>("[data-lawfive]")) {
    near.observe(el);
}
