import Foundation

/// The portable enV 3D project contract. Rendering and gameplay are separate from decoding.
struct NativeGameProject: Codable, Equatable {
    let format: String
    let version: Int
    var id: String
    var name: String
    var objects: [NativeGameObject]
    var assets: [NativeGameAsset]

    static let maxAssetBytes = 15 * 1024 * 1024
    static let maxProjectBytes = 100 * 1024 * 1024

    static func decode(_ data: Data) throws -> NativeGameProject {
        guard data.count <= maxProjectBytes else { throw NativeGameProjectError.invalid("Project files must be 100 MB or smaller.") }
        let project: NativeGameProject
        do { project = try JSONDecoder().decode(NativeGameProject.self, from: data) }
        catch { throw NativeGameProjectError.invalid("The project data is malformed.") }
        try project.validate()
        return project
    }

    func encoded() throws -> Data {
        try validate()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(self)
    }

    func validate() throws {
        guard format == "env-3d-game", version == 1 else { throw NativeGameProjectError.invalid("The project version is unsupported.") }
        guard validText(id, max: 120), validText(name, max: 100), objects.count <= 500, assets.count <= 100 else { throw NativeGameProjectError.invalid("Project metadata or size is invalid.") }
        guard Set(objects.map(\.id)).count == objects.count, Set(assets.map(\.id)).count == assets.count else { throw NativeGameProjectError.invalid("The project contains duplicate IDs.") }
        guard objects.filter(\.player).count <= 1 else { throw NativeGameProjectError.invalid("A project can have only one player.") }
        for asset in assets { try asset.validate() }
        for object in objects {
            try object.validate()
            if object.kind == .model || object.kind == .artboard {
                let expected: NativeGameAsset.Kind = object.kind == .model ? .glb : .artboard
                guard let asset = assets.first(where: { $0.id == object.assetId }), asset.kind == expected else { throw NativeGameProjectError.invalid("An object references a missing or incompatible asset.") }
            }
        }
    }
}

enum NativeGameProjectError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case .invalid(let message) = self { return message }; return nil }
}

private func validText(_ text: String, max: Int) -> Bool { !text.isEmpty && text.utf16.count <= max }

struct NativeGameVector: Codable, Equatable {
    var x: Double
    var y: Double
    var z: Double
    func valid(positive: Bool = false) -> Bool {
        [x, y, z].allSatisfy { $0.isFinite && $0 >= -10000 && $0 <= 10000 && (!positive || $0 > 0) }
    }
}

struct NativeGameObject: Codable, Equatable {
    enum Kind: String, Codable { case box, sphere, cylinder, ground, artboard, model }
    var id: String
    var name: String
    var kind: Kind
    var assetId: String?
    var position: NativeGameVector
    var rotation: NativeGameVector
    var scale: NativeGameVector
    var color: String
    var visible: Bool
    var locked: Bool
    var collider: Bool
    var player: Bool
    var speed: Double

    private enum CodingKeys: String, CodingKey { case id, name, kind, assetId, position, rotation, scale, color, visible, locked, collider, player, speed }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if container.contains(.assetId), try container.decodeNil(forKey: .assetId) { throw NativeGameProjectError.invalid("An asset reference cannot be null.") }
        id = try container.decode(String.self, forKey: .id); name = try container.decode(String.self, forKey: .name)
        kind = try container.decode(Kind.self, forKey: .kind); assetId = try container.decodeIfPresent(String.self, forKey: .assetId)
        position = try container.decode(NativeGameVector.self, forKey: .position); rotation = try container.decode(NativeGameVector.self, forKey: .rotation); scale = try container.decode(NativeGameVector.self, forKey: .scale)
        color = try container.decode(String.self, forKey: .color); visible = try container.decode(Bool.self, forKey: .visible); locked = try container.decode(Bool.self, forKey: .locked)
        collider = try container.decode(Bool.self, forKey: .collider); player = try container.decode(Bool.self, forKey: .player); speed = try container.decode(Double.self, forKey: .speed)
    }

    func validate() throws {
        let validColor = color.utf8.count == 7 && color.first == "#" && color.utf8.dropFirst().allSatisfy { (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }
        guard validText(id, max: 120), validText(name, max: 160), assetId.map({ $0.utf16.count <= 120 }) ?? true,
              position.valid(), rotation.valid(), scale.valid(positive: true), validColor,
              speed.isFinite, speed >= 0.1, speed <= 20 else { throw NativeGameProjectError.invalid("An object's properties are invalid.") }
    }
}

struct NativeGameAsset: Codable, Equatable {
    enum Kind: String, Codable { case glb, artboard }
    struct Source: Codable, Equatable { var projectId: String; var screenId: String; var updatedAt: String }
    var id: String
    var name: String
    var kind: Kind
    var dataUrl: String
    var source: Source?
    var width: Int?
    var height: Int?

    private enum CodingKeys: String, CodingKey { case id, name, kind, dataUrl, source, width, height }
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        for key in [CodingKeys.source, .width, .height] where container.contains(key) {
            if try container.decodeNil(forKey: key) { throw NativeGameProjectError.invalid("Optional asset properties cannot be null.") }
        }
        id = try container.decode(String.self, forKey: .id); name = try container.decode(String.self, forKey: .name)
        kind = try container.decode(Kind.self, forKey: .kind); dataUrl = try container.decode(String.self, forKey: .dataUrl)
        source = try container.decodeIfPresent(Source.self, forKey: .source); width = try container.decodeIfPresent(Int.self, forKey: .width); height = try container.decodeIfPresent(Int.self, forKey: .height)
    }

    func validate() throws {
        guard validText(id, max: 120), validText(name, max: 160),
              width.map({ (1...4096).contains($0) }) ?? true, height.map({ (1...4096).contains($0) }) ?? true else { throw NativeGameProjectError.invalid("Asset metadata is invalid.") }
        if let source = source {
            guard source.projectId.utf16.count <= 120, source.screenId.utf16.count <= 120, source.updatedAt.utf16.count <= 80 else { throw NativeGameProjectError.invalid("Artboard source metadata is invalid.") }
        }
        let prefix = kind == .glb ? "data:model/gltf-binary;base64," : "data:image/png;base64,"
        guard dataUrl.hasPrefix(prefix), dataUrl.utf16.count <= ((NativeGameProject.maxAssetBytes * 4 + 2) / 3 + 128) else { throw NativeGameProjectError.invalid("Asset data is invalid or too large.") }
        let encoded = String(dataUrl.dropFirst(prefix.count))
        guard encoded.range(of: "^[A-Za-z0-9+/]*={0,2}$", options: .regularExpression) != nil else { throw NativeGameProjectError.invalid("Asset data is not valid base64.") }
        let padded = encoded + String(repeating: "=", count: (4 - encoded.utf8.count % 4) % 4)
        guard let bytes = Data(base64Encoded: padded), bytes.count <= NativeGameProject.maxAssetBytes else { throw NativeGameProjectError.invalid("Asset data is invalid or too large.") }
        if kind == .glb { try validateNativeGLB(bytes) }
        else {
            let dimensions = try validateNativePNG(bytes)
            if let width = width, width != dimensions.width { throw NativeGameProjectError.invalid("Artboard dimensions are inconsistent.") }
            if let height = height, height != dimensions.height { throw NativeGameProjectError.invalid("Artboard dimensions are inconsistent.") }
        }
    }
}

private let nativePngCrcTable: [UInt32] = (0..<256).map { index in
    var value = UInt32(index)
    for _ in 0..<8 { value = value & 1 == 1 ? 0xedb88320 ^ (value >> 1) : value >> 1 }
    return value
}

private func validateNativePNG(_ data: Data) throws -> (width: Int, height: Int) {
    let bytes = [UInt8](data)
    func invalid() -> NativeGameProjectError { .invalid("The Artboard image is not a valid PNG.") }
    guard bytes.count >= 45, Array(bytes.prefix(8)) == [137, 80, 78, 71, 13, 10, 26, 10] else { throw invalid() }
    func uint32(_ offset: Int) -> UInt32 { UInt32(bytes[offset]) << 24 | UInt32(bytes[offset + 1]) << 16 | UInt32(bytes[offset + 2]) << 8 | UInt32(bytes[offset + 3]) }
    var offset = 8, width = 0, height = 0
    var hasPixels = false, ended = false
    while offset + 12 <= bytes.count {
        let length = Int(uint32(offset))
        guard length <= bytes.count - offset - 12 else { throw invalid() }
        let type = String(bytes: bytes[(offset + 4)..<(offset + 8)], encoding: .ascii) ?? ""
        var crc: UInt32 = 0xffffffff
        for index in (offset + 4)..<(offset + 8 + length) { crc = nativePngCrcTable[Int((crc ^ UInt32(bytes[index])) & 255)] ^ (crc >> 8) }
        guard (crc ^ 0xffffffff) == uint32(offset + 8 + length) else { throw invalid() }
        if offset == 8 {
            guard type == "IHDR", length == 13 else { throw invalid() }
            width = Int(uint32(offset + 8)); height = Int(uint32(offset + 12))
            guard (1...4096).contains(width), (1...4096).contains(height) else { throw invalid() }
        } else if type == "IHDR" { throw invalid() }
        if type == "IDAT" { hasPixels = true }
        offset += length + 12
        if type == "IEND" { guard length == 0, offset == bytes.count else { throw invalid() }; ended = true; break }
    }
    guard ended, hasPixels else { throw invalid() }
    return (width, height)
}

private func validateNativeGLB(_ bytes: Data) throws {
    guard bytes.count >= 20, bytes.count <= NativeGameProject.maxAssetBytes else { throw NativeGameProjectError.invalid("The model is not a valid GLB.") }
    func uint32(_ offset: Int) -> UInt32 {
        let values = Array(bytes[offset..<(offset + 4)])
        return UInt32(values[0]) | UInt32(values[1]) << 8 | UInt32(values[2]) << 16 | UInt32(values[3]) << 24
    }
    guard uint32(0) == 0x46546c67, uint32(4) == 2, Int(uint32(8)) == bytes.count, uint32(16) == 0x4e4f534a else { throw NativeGameProjectError.invalid("Only valid glTF 2.0 GLB models are supported.") }
    let jsonLength = Int(uint32(12))
    guard jsonLength >= 2, jsonLength <= bytes.count - 20,
          let json = try? JSONSerialization.jsonObject(with: bytes.subdata(in: 20..<(20 + jsonLength))) as? [String: Any],
          let info = json["asset"] as? [String: Any], info["version"] as? String == "2.0" else { throw NativeGameProjectError.invalid("The GLB model data is invalid.") }
    func hasExternalURI(_ value: Any) -> Bool {
        if let list = value as? [Any] { return list.contains(where: hasExternalURI) }
        guard let dictionary = value as? [String: Any] else { return false }
        return dictionary.contains { key, item in
            (key == "uri" && (item as? String).map { !$0.hasPrefix("data:") } == true) || hasExternalURI(item)
        }
    }
    guard !hasExternalURI(json) else { throw NativeGameProjectError.invalid("The GLB refers to external files.") }
    let unsupported = Set(["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"])
    if let extensions = json["extensionsUsed"] as? [String], !unsupported.isDisjoint(with: extensions) { throw NativeGameProjectError.invalid("This GLB requires an external decoder.") }
}
