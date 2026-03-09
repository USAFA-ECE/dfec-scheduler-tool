/**
 * Extract numeric portion from a course number for sorting.
 * e.g. "ECE 215S" -> 215, "ECE 463" -> 463
 */
export function courseNumberSort(a, b) {
    const numA = parseInt((a.number || '').replace(/\D+/g, '')) || 0;
    const numB = parseInt((b.number || '').replace(/\D+/g, '')) || 0;
    if (numA !== numB) return numA - numB;
    // Same number, sort by suffix (e.g. "ECE 215" before "ECE 215S")
    return (a.number || '').localeCompare(b.number || '');
}

/**
 * Sort courses by number, with not-offered courses at the bottom.
 */
export function courseNumberSortWithOffered(a, b) {
    const aOff = a.isOffered === false;
    const bOff = b.isOffered === false;
    if (aOff !== bOff) return aOff ? 1 : -1;
    return courseNumberSort(a, b);
}
