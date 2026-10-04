/// Boundary for the catalog's URL Media Inspector.
///
/// The web implementation obtains title, uploader, duration, thumbnail, codecs,
/// resolution, and formats from a remote media service. A URL alone does not
/// contain those values, so this family intentionally exposes no offline
/// operation rather than pretending to inspect a remote resource locally.
public enum NativeUrlMediaInfoError: LocalizedError, Equatable {
    case unavailableOffline

    public var errorDescription: String? {
        "URL media inspection is not available offline; the URL Media Inspector requires its remote metadata service."
    }
}

public enum NativeUrlMediaInfoEngine {
    /// The active catalog entry, recorded for tests and documentation only.
    public static let canonicalToolIDs: Set<String> = ["url-media-inspector"]

    /// No catalog ID has complete local semantics for this backend-dependent family.
    public static let supportedToolIDs: Set<String> = []

    public static func operation(forToolID toolID: String) -> String? { nil }

    /// Refuse execution instead of making a network request or returning guessed metadata.
    public static func run(
        toolID: String,
        input: String = "",
        options: [String: String] = [:]
    ) throws {
        throw NativeUrlMediaInfoError.unavailableOffline
    }
}
