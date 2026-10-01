// Reading a receipt's photo on the phone, as the web reads it in the browser
// (Tesseract there): Apple's Vision recognises the words, and their boxes go
// to the core (receiptRead.receiptText) to become the receipt's lines. The
// photo never leaves the device and isn't kept. CameraPicker is the system
// camera for "Take a photo" (NSCameraUsageDescription).
import SwiftUI
import UIKit
import Vision
import BudgeerCore

enum ReceiptReader {
    struct Unreadable: Error {}

    /// The languages a receipt may be in (the web reads English and Greek;
    /// its parser knows French and Dutch too), those this phone can read.
    private static let languages = ["en-US", "el-GR", "fr-FR", "nl-NL"]

    /// The words on the photo as Vision's boxes: [{ text, x, y, w, h }]
    /// (fractions of the image, the origin bottom-left).
    @MainActor
    static func boxes(in photo: UIImage) async throws -> JSONValue {
        guard let image = upright(photo).cgImage else { throw Unreadable() }
        return try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            // Amounts and codes, not prose: no dictionary "corrections".
            request.usesLanguageCorrection = false
            if let supported = try? request.supportedRecognitionLanguages() {
                let wanted = ReceiptReader.languages.filter(supported.contains)
                if !wanted.isEmpty { request.recognitionLanguages = wanted }
            }
            try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
            let found: [JSONValue] = (request.results ?? []).compactMap { seen in
                guard let text = seen.topCandidates(1).first?.string else { return nil }
                let box = seen.boundingBox
                return ["text": .string(text), "x": .double(Double(box.minX)), "y": .double(Double(box.minY)),
                        "w": .double(Double(box.width)), "h": .double(Double(box.height))]
            }
            return JSONValue.array(found)
        }.value
    }

    /// The photo drawn upright and at most 2400 px across (Vision reads a
    /// receipt's print well at that size, and a 48 MP photo would only cost memory).
    private static func upright(_ photo: UIImage) -> UIImage {
        let side = max(photo.size.width, photo.size.height)
        let scale = min(1, 2400 / max(side, 1))
        let size = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            photo.draw(in: CGRect(origin: .zero, size: size))
        }
    }
}

/// The system camera, for one photo.
@MainActor
struct CameraPicker: UIViewControllerRepresentable {
    let onPhoto: (UIImage?) -> Void

    static var available: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onPhoto: onPhoto) }

    @MainActor
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onPhoto: (UIImage?) -> Void

        init(onPhoto: @escaping (UIImage?) -> Void) {
            self.onPhoto = onPhoto
        }

        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onPhoto(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onPhoto(nil)
        }
    }
}
