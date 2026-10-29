import Foundation
import Combine
import GLTFKit2
import SceneKit
import UIKit

/// Native playable preview of the shared enV scene format.
@MainActor
final class NativeGameScene: ObservableObject {
    @Published private(set) var scene = SCNScene()
    @Published private(set) var status = "Preparing game…"
    @Published private(set) var ready = false
    @Published var paused = false {
        didSet { scene.rootNode.isPaused = paused }
    }
    private(set) var player: SCNNode?
    private(set) var objectNodes: [String: SCNNode] = [:]
    private var obstacles: [SCNNode] = []
    private(set) var camera = SCNNode()
    private var speed = 3.0
    private var generation = 0
    private var pendingModels = 0
    private var failed = false
    private var completion: (() -> Void)?

    func load(_ project: NativeGameProject, completion: (() -> Void)? = nil) {
        generation += 1
        let currentGeneration = generation
        self.completion = completion
        scene = SCNScene()
        scene.background.contents = UIColor(red: 0.76, green: 0.84, blue: 0.91, alpha: 1)
        objectNodes = [:]; obstacles = []; player = nil; pendingModels = 0
        ready = false; failed = false; paused = false; status = "Preparing game…"

        let ambient = SCNNode(); ambient.light = SCNLight(); ambient.light?.type = .ambient
        ambient.light?.intensity = 700; scene.rootNode.addChildNode(ambient)
        let sun = SCNNode(); sun.light = SCNLight(); sun.light?.type = .directional
        sun.light?.intensity = 900; sun.eulerAngles = SCNVector3(-Float.pi / 4, -Float.pi / 6, 0)
        scene.rootNode.addChildNode(sun)
        camera = SCNNode(); camera.camera = SCNCamera(); camera.camera?.zFar = 1000
        camera.position = SCNVector3(0, 6, -8); scene.rootNode.addChildNode(camera)
        camera.look(at: SCNVector3Zero)

        for object in project.objects {
            if object.player && ![.box, .sphere, .cylinder].contains(object.kind) {
                fail("Only primitive shapes can be used as a player.")
                return
            }
            let node = SCNNode(); node.name = object.id
            node.position = object.position.scnVector
            node.eulerAngles = SCNVector3(Float(object.rotation.x * .pi / 180), Float(object.rotation.y * .pi / 180), Float(object.rotation.z * .pi / 180))
            node.scale = object.scale.scnVector; node.isHidden = !object.visible
            scene.rootNode.addChildNode(node); objectNodes[object.id] = node
            if object.player { player = node; speed = object.speed }
            else if object.collider && object.visible && object.kind != .ground { obstacles.append(node) }

            if object.kind == .model {
                guard let asset = project.assets.first(where: { $0.id == object.assetId }),
                      let data = decodeGameAsset(asset.dataUrl) else { fail("A model asset is missing or invalid."); return }
                pendingModels += 1
                GLTFAsset.load(with: data, options: [:]) { [weak self, weak node] _, result, asset, _, _ in
                    guard result == .complete || result == .error else { return }
                    DispatchQueue.main.async {
                        guard let self = self, self.generation == currentGeneration, !self.failed, let node = node else { return }
                        guard result == .complete, let asset = asset else {
                            self.fail("A GLB model could not be loaded.")
                            return
                        }
                        let source = GLTFSCNSceneSource(asset: asset)
                        guard let model = source.defaultScene?.rootNode else { self.fail("A GLB model has no scene."); return }
                        node.addChildNode(model)
                        if let animation = source.animations.first {
                            animation.animationPlayer.animation.repeatCount = .greatestFiniteMagnitude
                            model.addAnimationPlayer(animation.animationPlayer, forKey: "env-first-clip")
                            animation.animationPlayer.play()
                        }
                        self.pendingModels -= 1
                        self.finishLoadingIfReady()
                    }
                }
            } else {
                do { node.geometry = try geometry(for: object, assets: project.assets) }
                catch { fail(error.localizedDescription); return }
            }
        }
        finishLoadingIfReady()
    }

    private func finishLoadingIfReady() {
        guard pendingModels == 0, !failed else { return }
        ready = true
        status = player == nil ? "No player configured" : "Use the arrows to move"
        followPlayer()
        let callback = completion; completion = nil; callback?()
    }

    private func fail(_ message: String) {
        failed = true; ready = false; status = message
        let callback = completion; completion = nil; callback?()
    }

    func move(x: Double, z: Double, seconds: Double) {
        guard ready, !paused, let player = player else { return }
        let length = max(1, sqrt(x * x + z * z))
        let step = min(max(seconds, 0), 0.1) * speed / length
        for (axis, amount) in [(0, x * step), (2, z * step)] where amount != 0 {
            let before = player.position
            if axis == 0 { player.position.x += Float(amount) } else { player.position.z += Float(amount) }
            if let bounds = gameWorldBounds(player), obstacles.contains(where: { other in
                guard let otherBounds = gameWorldBounds(other) else { return false }
                return bounds.overlaps(otherBounds)
            }) { player.position = before }
        }
        followPlayer()
    }

    private func followPlayer() {
        guard let player = player else { return }
        camera.position = SCNVector3(player.position.x, player.position.y + 6, player.position.z - 8)
        camera.look(at: player.position)
    }

    private func geometry(for object: NativeGameObject, assets: [NativeGameAsset]) throws -> SCNGeometry {
        let geometry: SCNGeometry
        switch object.kind {
        case .box: geometry = SCNBox(width: 1, height: 1, length: 1, chamferRadius: 0)
        case .sphere: geometry = SCNSphere(radius: 0.5)
        case .cylinder: geometry = SCNCylinder(radius: 0.5, height: 1)
        case .ground:
            geometry = SCNBox(width: 1, height: 0.01, length: 1, chamferRadius: 0)
        case .artboard:
            guard let asset = assets.first(where: { $0.id == object.assetId }),
                  let data = decodeGameAsset(asset.dataUrl), let image = UIImage(data: data) else {
                throw NativeGameProjectError.invalid("An Artboard image could not be loaded.")
            }
            let aspect = CGFloat(asset.width ?? Int(image.size.width)) / CGFloat(max(1, asset.height ?? Int(image.size.height)))
            let plane = SCNPlane(width: aspect, height: 1)
            let material = SCNMaterial(); material.diffuse.contents = image; material.isDoubleSided = true
            material.lightingModel = .constant; plane.materials = [material]
            return plane
        case .model: throw NativeGameProjectError.invalid("The model could not be loaded.")
        }
        let material = SCNMaterial(); material.diffuse.contents = gameColor(object.color)
        material.lightingModel = .physicallyBased; geometry.materials = [material]
        return geometry
    }
}

private extension NativeGameVector {
    var scnVector: SCNVector3 { SCNVector3(Float(x), Float(y), Float(z)) }
}

private func decodeGameAsset(_ dataURL: String) -> Data? {
    guard let comma = dataURL.firstIndex(of: ",") else { return nil }
    let encoded = String(dataURL[dataURL.index(after: comma)...])
    return Data(base64Encoded: encoded + String(repeating: "=", count: (4 - encoded.utf8.count % 4) % 4))
}

private func gameColor(_ hex: String) -> UIColor {
    let value = Int(hex.dropFirst(), radix: 16) ?? 0xffffff
    return UIColor(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
}

private struct GameBounds {
    var min: SCNVector3
    var max: SCNVector3
    func overlaps(_ other: GameBounds) -> Bool {
        let epsilon: Float = 0.0001
        return min.x < other.max.x - epsilon && max.x > other.min.x + epsilon &&
            min.y < other.max.y - epsilon && max.y > other.min.y + epsilon &&
            min.z < other.max.z - epsilon && max.z > other.min.z + epsilon
    }
}

private func gameWorldBounds(_ node: SCNNode) -> GameBounds? {
    let bounds = node.boundingBox
    guard bounds.min.x <= bounds.max.x, bounds.min.y <= bounds.max.y, bounds.min.z <= bounds.max.z else { return nil }
    var low = SCNVector3(Float.greatestFiniteMagnitude, Float.greatestFiniteMagnitude, Float.greatestFiniteMagnitude)
    var high = SCNVector3(-Float.greatestFiniteMagnitude, -Float.greatestFiniteMagnitude, -Float.greatestFiniteMagnitude)
    for x in [bounds.min.x, bounds.max.x] { for y in [bounds.min.y, bounds.max.y] { for z in [bounds.min.z, bounds.max.z] {
        let point = node.convertPosition(SCNVector3(x, y, z), to: nil)
        low = SCNVector3(min(low.x, point.x), min(low.y, point.y), min(low.z, point.z))
        high = SCNVector3(max(high.x, point.x), max(high.y, point.y), max(high.z, point.z))
    } } }
    return GameBounds(min: low, max: high)
}
