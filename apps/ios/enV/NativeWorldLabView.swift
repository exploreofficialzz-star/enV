import SwiftUI
import SceneKit
import UniformTypeIdentifiers

private struct NativeWorldLabJsonFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var content: Data
    init(content: Data){self.content=content}
    init(configuration: ReadConfiguration) throws {
        let bytes=configuration.file.regularFileContents ?? Data()
        guard bytes.count <= NativeWorldLabProject.maxBytes else {
            throw NativeWorldLabError.invalid("World Lab JSON must be 1 MB or smaller")
        }
        content=bytes
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper {
        FileWrapper(regularFileWithContents:content)
    }
}

/// Native 3D *illustrative* scene with real, bounded local reference solvers.
/// Imported solids are never silently coupled to the scientific equations.
struct NativeWorldLabView:View {
    @State private var mode=0
    @State private var seconds=0.0
    @State private var speed=1.0
    @State private var playing=false
    @State private var mass=1.0
    @State private var resistance=1000.0
    @State private var diffusivity=0.02
    @State private var seeInside=false
    @State private var importing=false
    @State private var exporting=false
    @State private var projectData:Data?
    @State private var savedSnapshot:Data?
    @State private var confirmation=false
    @State private var pendingReplacement=""
    @State private var inventedName=""
    @State private var inventedDensity=""
    @State private var problem=""
    @State private var project:NativeWorldLabProject?
    @State private var selected=0
    @State private var dropRun:NativeDropResult?
    @State private var dropEntityId:String?
    @State private var dropTime=0.0
    @State private var dropPlaying=false
    @State private var dropSpeed=1.0
    @State private var scene=SCNScene()
    @State private var lastTick=Date()
    private let timer=Timer.publish(every:0.04,on:.main,in:.common).autoconnect()
    private let localProjects=NativeWorldLabProjectStore()
    private var hasUnsavedWork:Bool { projectData != nil && savedSnapshot != projectData }
    private func newProject(){
        do {
            let data=try NativeWorldLabEditor.blank()
            project=try NativeWorldLabProject.decode(data)
            projectData=data;savedSnapshot=nil;selected=0;problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func loadSavedProject(){
        do {
            guard let saved=try localProjects.loadLatest() else {
                problem="There is no saved World Lab project on this device."
                return
            }
            projectData=saved.0;project=saved.1;savedSnapshot=saved.0
            selected=0;problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func askToReplace(_ action:String){
        if hasUnsavedWork {pendingReplacement=action;confirmation=true}
        else if action=="new" {newProject()}
        else if action=="open" {loadSavedProject()}
        else if action=="import" {importing=true}
    }
    private func saveLocally(){
        do {
            guard let data=projectData else {
                throw NativeWorldLabError.invalid("Create or import a project before saving.")
            }
            _ = try localProjects.save(data)
            savedSnapshot=data;problem=""
        }catch{problem=error.localizedDescription}
    }
    private var input:NativeLabInput {
        if mode==0 {return .spring(massKg:mass)}
        if mode==1 {return .rc(resistanceOhm:resistance)}
        return .heat(diffusivityM2S:diffusivity)
    }
    private var values:NativeLabResult? {
        try? NativeWorldLabScience.evaluate(input,atSeconds:seconds)
    }
    private var solid:NativeLabSolid? {
        guard let project,project.entities.indices.contains(selected) else{return nil}
        return project.entities[selected]
    }
    private var material:NativeLabMaterial? {
        guard let solid else{return nil}
        return project?.materials.first(where:{$0.id==solid.materialId})
    }
    private var assumedMass:Double? {
        guard let solid,let density=material?.densityKgM3 else{return nil}
        return solid.volumeMetersCubed*density
    }
    private func applyProject(_ work:(Data)throws->Data){
        do {
            guard let old=projectData else {
                throw NativeWorldLabError.invalid("Create or import a project first.")
            }
            let data=try work(old)
            project=try NativeWorldLabProject.decode(data)
            projectData=data;selected=min(selected,max(0,(project?.entities.count ?? 1)-1))
            problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    var body:some View {
        ScrollView{
            VStack(alignment:.leading,spacing:12) {
                Text("The World Lab").font(.title2.bold())
                Text("Real bounded science models in a representative 3D scene. Not measured or certified.")
                    .font(.footnote).foregroundStyle(.secondary)
                SceneView(scene:scene,options:[.allowsCameraControl,.autoenablesDefaultLighting])
                    .frame(height:260).clipShape(RoundedRectangle(cornerRadius:12))
                    .accessibilityLabel("Illustrative 3D scene; model values are displayed below.")
                Picker("Experiment",selection:$mode){
                    Text("Spring").tag(0);Text("Circuit").tag(1);Text("Heat").tag(2)
                }.pickerStyle(.segmented)
                HStack{
                    Button(playing ? "Pause":"Play"){playing.toggle()}
                        .buttonStyle(.borderedProminent)
                    Button("Reset"){playing=false;seconds=0}.buttonStyle(.bordered)
                    Button("Step"){playing=false;seconds=min(12,seconds+1.0/240)}
                        .buttonStyle(.bordered)
                    Toggle("See inside",isOn:$seeInside).labelsHidden()
                    Text("See inside").font(.caption)
                }
                Text("Simulated time: "+String(format:"%.2f",seconds)+" s")
                Slider(value:$seconds,in:0...12,onEditingChanged:{ editing in
                    if editing{playing=false}
                }).accessibilityLabel("Simulated elapsed time")
                Picker("Playback speed",selection:$speed){
                    Text("0.1×").tag(0.1);Text("1×").tag(1.0);Text("10×").tag(10.0)
                }.pickerStyle(.segmented)
                if mode==0 {
                    Text("Assumed mass: "+String(format:"%.2f",mass)+" kg")
                    Slider(value:$mass,in:0.1...100)
                }else if mode==1 {
                    Text("Resistance: "+String(format:"%.0f",resistance)+" Ω")
                    Slider(value:$resistance,in:100...10000)
                }else{
                    Text("Thermal diffusivity: "+String(format:"%.4f",diffusivity)+" m²/s")
                    Slider(value:$diffusivity,in:0.001...0.08)
                }
                Text("Computed observations").font(.headline)
                if let reading=values {
                    if mode==0 {
                        value("Position",reading.xMeters,"m")
                        value("Velocity",reading.velocityMPerS,"m/s")
                        value("Mechanical energy",reading.mechanicalEnergyJ,"J")
                    }else if mode==1 {
                        value("Capacitor voltage",reading.voltageV,"V")
                        value("Current",reading.currentA,"A")
                        value("Resistor heating",reading.resistorHeatW,"W")
                    }else{
                        value("Mean temperature",reading.meanTemperatureK,"K")
                        value("Hottest cell",reading.peakTemperatureK,"K")
                        if seeInside,let temps=reading.temperatureK {
                            Text("21 computed internal temperatures in kelvin:")
                                .font(.caption)
                            Text(temps.map{String(format:"%.1f",$0)}.joined(separator:", "))
                                .font(.caption.monospaced()).textSelection(.enabled)
                        }
                    }
                }else{Text("Model exceeds its supported numerical limits.").foregroundStyle(.red)}
                if seeInside && mode != 2 {
                    Text("See inside is visual transparency, not an X-ray or molecular measurement.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Divider()
                HStack {
                    Button("New project"){askToReplace("new")}.buttonStyle(.borderedProminent)
                    Button("Export JSON"){exporting=true}
                        .buttonStyle(.bordered).disabled(projectData==nil)
                }
                Button("Import World Lab project JSON"){askToReplace("import")}.buttonStyle(.bordered)
                HStack {
                    Button("Save locally"){saveLocally()}
                        .buttonStyle(.borderedProminent).disabled(projectData==nil)
                    Button("Open last saved"){askToReplace("open")}.buttonStyle(.bordered)
                }
                if hasUnsavedWork {
                    Text("Unsaved on this device. Save locally or export JSON to preserve these changes.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let project {
                    Text(project.title+" · "+String(project.entities.count)+" solids")
                        .font(.headline)
                    HStack(spacing:8){
                        Button("Add cube"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"box")}}
                        Button("Add sphere"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"sphere")}}
                        Button("Add cylinder"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"cylinder")}}
                    }.buttonStyle(.bordered).disabled(project.entities.count>=200)
                    if let solid {
                        HStack {
                            Button("Previous"){selected=max(0,selected-1)}.disabled(selected==0)
                            Spacer()
                            Text(String(selected+1)+" / "+String(project.entities.count))
                            Spacer()
                            Button("Next"){selected=min(project.entities.count-1,selected+1)}
                                .disabled(selected==project.entities.count-1)
                        }
                        Text("Selected: "+solid.name+" ("+solid.shape+")")
                        value("Ideal volume",solid.volumeMetersCubed,"m³")
                        HStack {
                            Button("Smaller"){
                                let scaled=solid.dimensionsMeters.map{max(0.001,$0*0.9)}
                                applyProject{try NativeWorldLabEditor.resizeSolid(
                                    $0,id:solid.id,dimensionsMeters:scaled)}
                            }
                            Button("Larger"){
                                let scaled=solid.dimensionsMeters.map{min(10000,$0*1.1)}
                                applyProject{try NativeWorldLabEditor.resizeSolid(
                                    $0,id:solid.id,dimensionsMeters:scaled)}
                            }
                        }.buttonStyle(.bordered)
                        Text("Material: "+(material?.name ?? "Unknown")+" (hypothetical)")
                        value("Assumed mass",assumedMass,"kg")
                        if let derived=assumedMass,derived>=0.001,derived<=10000 {
                            Button("Test assumed mass in spring model"){
                                mass=derived;mode=0;seconds=0;playing=false
                            }.buttonStyle(.borderedProminent)
                            Button("Drop this solid"){
                                do {
                                    let d=solid.dimensionsMeters
                                    let area=solid.shape=="box" ? d[0]*d[2] : Double.pi*d[0]*d[2]/4
                                    var input=NativeDropInput(massKg:derived,
                                        supportingHalfHeightM:d[1]/2,projectedAreaM2:area)
                                    input.dragCoefficient=solid.shape=="sphere" ? 0.47 : 1.05
                                    dropRun=try NativeWorldLabDropScience.evaluate(input)
                                    dropEntityId=solid.id;dropTime=0;dropPlaying=true;playing=false
                                    problem="";applyDropPosition()
                                }catch{problem=error.localizedDescription}
                            }.buttonStyle(.bordered)
                            if let run=dropRun,dropEntityId==solid.id {
                                let index=max(0,min(run.samples.count-1,Int((dropTime/run.stepSeconds).rounded())))
                                let sample=run.samples[index]
                                value("Computed drop height",sample.heightAboveGroundM,"m")
                                value("Computed vertical speed",abs(sample.velocityMps),"m/s")
                                Text("Estimated surface impacts: \(run.impactCount)").font(.caption)
                                Slider(value:$dropTime,in:0...(run.samples.last?.timeSeconds ?? 6))
                                    .accessibilityLabel("Drop simulated time")
                                HStack {
                                    Button(dropPlaying ? "Pause drop":"Play drop"){dropPlaying.toggle()}
                                    Button("Reset drop"){dropPlaying=false;dropTime=0}
                                }.buttonStyle(.bordered)
                                Text("Gravity, drag and contact are simplified. Invented material density is an assumption, not verified strength.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    TextField("Invented material name",text:$inventedName)
                        .textFieldStyle(.roundedBorder)
                    TextField("Assumed density in kg/m³ (optional)",text:$inventedDensity)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    Button("Save invented material") {
                        do {
                            guard !inventedName.trimmingCharacters(in:.whitespaces).isEmpty else{
                                throw NativeWorldLabError.invalid("Name your invented material.")
                            }
                            let density:Double?
                            if inventedDensity.trimmingCharacters(in:.whitespaces).isEmpty{
                                density=nil
                            }else if let number=Double(inventedDensity){density=number}
                            else {throw NativeWorldLabError.invalid("Density must be a finite number.")}
                            let id=UUID().uuidString
                            applyProject {old in
                                let first=try NativeWorldLabEditor.addHypotheticalMaterial(
                                    old,name:inventedName,densityKgM3:density,id:id)
                                if let solid {
                                    return try NativeWorldLabEditor.assignMaterial(
                                        first,solidId:solid.id,materialId:id)
                                }
                                return first
                            }
                            if problem.isEmpty {inventedName="";inventedDensity=""}
                        }catch{problem=error.localizedDescription}
                    }.buttonStyle(.borderedProminent)
                    Text("Imported geometry is not structurally or chemically simulated. The spring uses only a separately assumed lumped mass.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if !problem.isEmpty {Text(problem).foregroundStyle(.red)}
                Text("Model 1.0.0 · computed with assumed parameters · not a safety assessment.")
                    .font(.caption2).foregroundStyle(.secondary)
            }.padding(14)
        }
        .onAppear{redraw();lastTick=Date()}
        .onChange(of:mode){_ in seconds=0;playing=false;redraw()}
        .onChange(of:seconds){_ in redraw()}
        .onChange(of:dropTime){_ in applyDropPosition()}
        .onChange(of:seeInside){_ in redraw()}
        .onChange(of:mass){_ in redraw()}
        .onChange(of:resistance){_ in redraw()}
        .onChange(of:diffusivity){_ in redraw()}
        .onChange(of:projectData){_ in
            // Never reuse a prior computed trajectory after geometry/material edits.
            dropPlaying=false;dropRun=nil;dropEntityId=nil;dropTime=0;redraw()
        }
        .onReceive(timer){now in
            let dt=max(0,min(0.25,now.timeIntervalSince(lastTick)))
            lastTick=now
            if playing {seconds=min(12,seconds+dt*speed);if seconds>=12{playing=false}}
            if dropPlaying,let run=dropRun {
                dropTime=min(run.samples.last?.timeSeconds ?? 6,dropTime+dt*dropSpeed)
                if dropTime >= (run.samples.last?.timeSeconds ?? 6){dropPlaying=false}
            }
        }
        .confirmationDialog("Discard unsaved changes?",isPresented:$confirmation,
                            titleVisibility:.visible) {
            Button("Discard and continue",role:.destructive){
                if pendingReplacement=="new" {newProject()}
                else if pendingReplacement=="open" {loadSavedProject()}
                else if pendingReplacement=="import" {importing=true}
                pendingReplacement=""
            }
            Button("Keep editing",role:.cancel){pendingReplacement=""}
        } message: {
            Text("Save locally or export JSON first if you want to keep the current changes.")
        }
        .fileExporter(isPresented:$exporting,
            document:projectData.map{NativeWorldLabJsonFile(content:$0)},
            contentType:.json,defaultFilename:"world-lab-project"){result in
                if case .failure(let error)=result {problem=error.localizedDescription}
            }
        .fileImporter(isPresented:$importing,allowedContentTypes:[.json]){response in
            do {
                let url=try response.get()
                let accessed=url.startAccessingSecurityScopedResource()
                defer{if accessed{url.stopAccessingSecurityScopedResource()}}
                // File-size metadata must be available and bounded before
                // allocating memory for untrusted imported project contents.
                let attributes=try FileManager.default.attributesOfItem(atPath:url.path)
                guard let length=(attributes[.size] as? NSNumber)?.intValue,
                      length<=NativeWorldLabProject.maxBytes else {
                    throw NativeWorldLabError.invalid("Project files must be 1 MB or smaller.")
                }
                let data=try Data(contentsOf:url)
                project=try NativeWorldLabProject.decode(data)
                projectData=data
                savedSnapshot=nil
                selected=0;problem="";redraw()
            }catch{problem=error.localizedDescription}
        }
    }
    private func value(_ name: String, _ amount: Double?, _ unit: String) -> some View {
        let displayed: String
        if let amount = amount {
            displayed = String(format: "%.5g", amount)
        } else {
            displayed = "Unknown"
        }
        let caption = name + ": " + displayed + " " + unit
        return Text(verbatim: caption).font(.subheadline)
    }
    private func applyDropPosition() {
        guard let run=dropRun,let id=dropEntityId,
              let solid=project?.entities.first(where:{$0.id==id}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+id,recursively:false),
              !run.samples.isEmpty else{return}
        let index=max(0,min(run.samples.count-1,Int((dropTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2+run.samples[index].heightAboveGroundM)
    }
    private func redraw(){
        let next=SCNScene()
        let floor=SCNNode(geometry:SCNFloor())
        floor.geometry?.firstMaterial?.diffuse.contents=UIColor.systemGreen
        next.rootNode.addChildNode(floor)
        if let project {
            for item in project.entities.prefix(200){
                let xyz=item.dimensionsMeters
                let geometry:SCNGeometry
                switch item.shape{
                case "sphere":geometry=SCNSphere(radius:CGFloat(xyz[0]/2))
                case "cylinder":geometry=SCNCylinder(radius:CGFloat(xyz[0]/2),height:CGFloat(xyz[1]))
                default:geometry=SCNBox(width:CGFloat(xyz[0]),height:CGFloat(xyz[1]),
                                         length:CGFloat(xyz[2]),chamferRadius:0)
                }
                let node=SCNNode(geometry:geometry)
                node.name="lab-solid-"+item.id
                node.position=SCNVector3(Float(item.positionMeters[0]),
                    Float(item.positionMeters[1]),Float(item.positionMeters[2]))
                if let hex=UInt64(item.color.dropFirst(),radix:16){
                    geometry.firstMaterial?.diffuse.contents=UIColor(
                        red:CGFloat((hex>>16)&255)/255,
                        green:CGFloat((hex>>8)&255)/255,
                        blue:CGFloat(hex&255)/255,alpha:1)
                }
                geometry.firstMaterial?.transparency=(seeInside ? 0.4:1)*CGFloat(item.opacity)
                next.rootNode.addChildNode(node)
            }
        }
        if mode==0 {
            let orb=SCNNode(geometry:SCNSphere(radius:0.4))
            orb.geometry?.firstMaterial?.diffuse.contents=UIColor.systemOrange
            orb.position=SCNVector3(Float((values?.xMeters ?? 0)*1.5),1.2,0)
            next.rootNode.addChildNode(orb)
        }else if mode==1 {
            let box=SCNNode(geometry:SCNBox(width:1.2,height:1,length:0.5,chamferRadius:0))
            box.position=SCNVector3(0,1,0)
            box.geometry?.firstMaterial?.diffuse.contents=UIColor.cyan
            next.rootNode.addChildNode(box)
        }else if let field=values?.temperatureK{
            for (i,kelvin) in field.enumerated(){
                let cell=SCNNode(geometry:SCNBox(width:0.115,height:0.36,
                                                 length:0.5,chamferRadius:0))
                let t=max(0,min(1,(kelvin-293.15)/80))
                cell.geometry?.firstMaterial?.diffuse.contents=UIColor(
                    red:0.2+0.8*t,green:0.3+0.55*t,blue:0.55,alpha:1)
                cell.position=SCNVector3(Float((Double(i)-10)*0.116),1.05,0)
                next.rootNode.addChildNode(cell)
            }
        }
        let camera=SCNNode()
        camera.camera=SCNCamera()
        camera.position=SCNVector3(0,3,-8)
        camera.look(at:SCNVector3(0,1,0))
        next.rootNode.addChildNode(camera)
        scene=next
        applyDropPosition()
    }
}
