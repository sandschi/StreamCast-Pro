// document.documentElement.style.zoom (used for the dashboard's UI Scale
// setting) reports its OWN CSS value via getComputedStyle, but MouseEvent
// clientX/clientY are reported in the zoomed/rendered pixel space while an
// element's own width/height CSS values (and offsetWidth/offsetHeight) stay
// in unzoomed logical pixels. Drag handlers need to divide a raw clientX/Y
// delta by this factor before applying it to a width/height value, or the
// dragged edge visually outruns the cursor by exactly the zoom ratio.
export function getZoomFactor() {
    if (typeof document === 'undefined') return 1;
    const z = parseFloat(getComputedStyle(document.documentElement).zoom);
    return Number.isFinite(z) && z > 0 ? z : 1;
}
