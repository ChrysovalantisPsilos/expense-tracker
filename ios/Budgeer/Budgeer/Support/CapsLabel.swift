// A small-caps section label ("NEXT CHARGES", "ΕΠΟΜΕΝΕΣ ΧΡΕΩΣΕΙΣ"), as the
// web's CSS text-transform writes it: capitals, and in Greek without the
// tonos, which capitals don't carry (browsers drop it; Swift's uppercased()
// keeps it). The diaeresis stays. Styling only, no wording.
import Foundation

extension String {
    var capsLabel: String {
        let acute: Unicode.Scalar = "\u{0301}"
        let scalars = decomposedStringWithCanonicalMapping.unicodeScalars.filter { $0 != acute }
        return String(String.UnicodeScalarView(scalars)).uppercased().precomposedStringWithCanonicalMapping
    }
}
