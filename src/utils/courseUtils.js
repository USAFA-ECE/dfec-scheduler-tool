/**
 * Compute the number of sections needed based on enrollment and class cap.
 * Returns Math.ceil(enrollment / classCap), or 0 when cap is 0 or enrollment is 0.
 */
export function computeSectionsNeeded(enrollment, classCap) {
    if (!classCap || classCap <= 0 || !enrollment || enrollment <= 0) return 0;
    return Math.ceil(enrollment / classCap);
}
