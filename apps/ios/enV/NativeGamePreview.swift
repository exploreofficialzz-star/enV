import SceneKit
import SwiftUI
import UniformTypeIdentifiers

/// Full-screen native player for exported enV projects and the shared starter scenes.
struct NativeGamePreview: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var game = NativeGameScene()
    @State private var importing = false
    @State private var notice = ""
    @State private var pressed: Set<GameDirection> = []
    @State private var lastTick = Date()
    private let timer = Timer.publish(every: 1.0 / 30.0, on: .main, in: .common).autoconnect()

    var body: some View {
        GeometryReader { bounds in
            ZStack {
                NativeSceneView(scene: game.scene, camera: game.camera)
                    .ignoresSafeArea()
                    .accessibilityLabel("3D game view")
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Button("Close") { dismiss() }
                        Spacer(minLength: 4)
                        Text("enV  /  3D preview").font(.headline).lineLimit(1)
                            .padding(7).background(Color.black.opacity(0.68), in: RoundedRectangle(cornerRadius: 8))
                        Spacer(minLength: 4)
                        Button(game.paused ? "Resume" : "Pause") { game.paused.toggle(); pressed.removeAll() }
                            .disabled(!game.ready)
                    }
                    HStack(spacing: 8) {
                        Menu {
                            Button("Starter world") { loadPreset("starter") }
                            Button("Courtyard explorer") { loadPreset("courtyard") }
                            Button("Gallery room") { loadPreset("gallery") }
                        } label: { Label("Presets", systemImage: "cube.transparent") }
                        Button { importing = true } label: { Label("Open project", systemImage: "folder") }
                        Spacer(minLength: 0)
                    }
                    Text(notice.isEmpty ? (game.paused ? "Paused" : game.status) : notice)
                        .font(.caption).lineLimit(2).padding(7)
                        .background(Color.black.opacity(0.68), in: RoundedRectangle(cornerRadius: 8))
                        .accessibilityIdentifier("game-preview-status")
                    Spacer(minLength: 0)
                    if game.ready && game.player != nil {
                        HStack(spacing: 6) {
                            direction(.left, symbol: "arrow.left", label: "Move left")
                            direction(.forward, symbol: "arrow.up", label: "Move forward")
                            direction(.backward, symbol: "arrow.down", label: "Move backward")
                            direction(.right, symbol: "arrow.right", label: "Move right")
                        }
                    }
                }
                .padding(bounds.size.height < 420 ? 8 : 14)
                .foregroundStyle(.white)
                .buttonStyle(GameOverlayButtonStyle())
            }
        }
        .statusBarHidden(true)
        .onAppear { loadPreset("starter"); lastTick = Date() }
        .onDisappear { pressed.removeAll() }
        .onReceive(timer) { now in
            let delta = min(now.timeIntervalSince(lastTick), 0.1); lastTick = now
            let x = (pressed.contains(.right) ? 1.0 : 0.0) - (pressed.contains(.left) ? 1.0 : 0.0)
            let z = (pressed.contains(.forward) ? 1.0 : 0.0) - (pressed.contains(.backward) ? 1.0 : 0.0)
            if x != 0 || z != 0 { game.move(x: x, z: z, seconds: delta) }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            switch result {
            case .failure: notice = "Could not open the selected project."
            case .success(let url): openProject(url)
            }
        }
    }

    private func direction(_ value: GameDirection, symbol: String, label: String) -> some View {
        Button { game.move(x: value.x, z: value.z, seconds: 0.1) } label: {
            Image(systemName: symbol).frame(width: 42, height: 42)
        }
        .simultaneousGesture(DragGesture(minimumDistance: 0)
            .onChanged { _ in pressed.insert(value) }
            .onEnded { _ in pressed.remove(value) })
        .accessibilityLabel(label)
    }

    private func loadPreset(_ name: String) {
        pressed.removeAll(); notice = ""
        do {
            guard let url = Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "game-presets") else {
                throw NativeGameProjectError.invalid("The selected preset is unavailable.")
            }
            game.load(try NativeGameProject.decode(Data(contentsOf: url)))
        } catch { notice = error.localizedDescription }
    }

    private func openProject(_ url: URL) {
        pressed.removeAll(); notice = "Opening project…"
        Task {
            do {
                let project = try await Task.detached(priority: .userInitiated) {
                    let accessed = url.startAccessingSecurityScopedResource()
                    defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= NativeGameProject.maxProjectBytes else {
                        throw NativeGameProjectError.invalid("Project files must be 100 MB or smaller.")
                    }
                    return try NativeGameProject.decode(Data(contentsOf: url, options: .mappedIfSafe))
                }.value
                notice = ""; game.load(project)
            } catch let error as NativeGameProjectError { notice = error.localizedDescription }
            catch { notice = "Could not open the selected project." }
        }
    }
}

private enum GameDirection: Hashable {
    case left, right, forward, backward
    var x: Double { self == .left ? -1 : self == .right ? 1 : 0 }
    var z: Double { self == .forward ? 1 : self == .backward ? -1 : 0 }
}

private struct NativeSceneView: UIViewRepresentable {
    let scene: SCNScene
    let camera: SCNNode
    func makeUIView(context: Context) -> SCNView {
        let view = SCNView(); view.rendersContinuously = true; view.antialiasingMode = .multisampling4X
        view.backgroundColor = .black; return view
    }
    func updateUIView(_ view: SCNView, context: Context) {
        if view.scene !== scene { view.scene = scene }
        view.pointOfView = camera
    }
}

private struct GameOverlayButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.subheadline.weight(.semibold))
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(Color(red: 0.04, green: 0.18, blue: 0.17).opacity(configuration.isPressed ? 0.95 : 0.82), in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.white.opacity(0.25)))
    }
}
