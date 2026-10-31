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
    @State private var editHistory=NativeWorldLabEditHistory()
    @State private var projectData:Data?
    @State private var savedSnapshot:Data?
    @State private var confirmation=false
    @State private var pendingReplacement=""
    @State private var inventedName=""
    @State private var inventedDensity=""
    @State private var inventedModulus=""
    @State private var beamForce="1000"
    @State private var beamRun:NativeLabBeamBendingResult?
    @State private var deviceName=""
    @State private var deviceAssumption=""
    @State private var deviceResistance=""
    @State private var junctionName=""
    @State private var positiveWire="supply"
    @State private var negativeWire="ground"
    @State private var gridSpacing=0.5
    @State private var measureTargetId=""
    @State private var assemblyName="My invention"
    @State private var assemblySecondId=""
    @State private var digitalShowCases=false
    @State private var savedProjects:[NativeWorldLabProject]=[]
    @State private var chosenSavedId=""
    @State private var confirmingDelete=false
    @State private var digitalNewGateName="Invented device"
    @State private var digitalAssumption="User-assumed Boolean behavior"
    @State private var digitalSourceA="input_a"
    @State private var digitalSourceB=""
    @State private var problem=""
    @State private var project:NativeWorldLabProject?
    @State private var dcRun:NativeLabDcResult?
    @State private var selected=0
    @State private var chemicalRun:NativeChemicalThermalResult?
    @State private var chemicalTime=0.0
    @State private var chemicalPlaying=false
    @State private var reactionHeat=50000.0
    @State private var reactionFactor=0.5
    @State private var reactionHeater=0.0
    @State private var hydroRun:NativeLabHydroResult?
    @State private var fluidMotion:NativeLabFluidMotionRun?
    @State private var fluidTime=0.0
    @State private var fluidPlaying=false
    @State private var fluidSurfaceHeight=1.0
    @State private var fluidDrag=200.0
    @State private var fluidDensity=1000.0
    @State private var fluidFraction=0.5
    @State private var dropRun:NativeDropResult?
    @State private var dropEntityId:String?
    @State private var dropTime=0.0
    @State private var dropPlaying=false
    @State private var dropSpeed=1.0
    @State private var motorRun:NativeActuatorResult?
    @State private var wiredMotor:NativeLabNetworkMotorRun?
    @State private var digitalMotor:NativeDigitalMotorResult?
    @State private var motorAudit:NativeActuatorNumericalAudit?
    @State private var motorEntityId:String?
    @State private var motorTime=0.0
    @State private var motorPlaying=false
    @State private var motorThermalEnabled=false
    @State private var motorSpeed=1.0
    @State private var scene=SCNScene()
    @State private var lastTick=Date()
    private let timer=Timer.publish(every:0.04,on:.main,in:.common).autoconnect()
    private let localProjects=NativeWorldLabProjectStore()
    private var hasUnsavedWork:Bool { projectData != nil && savedSnapshot != projectData }
    private func newProject(){
        do {
            let data=try NativeWorldLabEditor.blank()
            project=try NativeWorldLabProject.decode(data)
            projectData=data;savedSnapshot=nil;selected=0;editHistory.clear();problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func refreshSavedProjects(){
        do {
            savedProjects=try localProjects.listProjects()
            if !savedProjects.contains(where:{$0.id==chosenSavedId}) {
                chosenSavedId=savedProjects.first?.id ?? ""
            }
        }catch {problem=error.localizedDescription}
    }
    private func openSelectedProject(){
        do {
            guard !chosenSavedId.isEmpty else {
                throw NativeWorldLabError.invalid("Choose a saved World Lab project.")
            }
            let result=try localProjects.read(chosenSavedId)
            projectData=result.0;project=result.1;savedSnapshot=result.0
            editHistory.clear();selected=0;problem="";redraw()
        }catch {problem=error.localizedDescription}
    }
    private func deleteSelectedProject(){
        do {
            let deletedId=chosenSavedId
            guard !deletedId.isEmpty else {return}
            try localProjects.delete(deletedId)
            if project?.id==deletedId {savedSnapshot=nil}
            problem="";refreshSavedProjects()
        }catch {problem=error.localizedDescription}
    }
    private func loadSavedProject(){
        do {
            guard let saved=try localProjects.loadLatest() else {
                problem="There is no saved World Lab project on this device."
                return
            }
            projectData=saved.0;project=saved.1;savedSnapshot=saved.0;editHistory.clear()
            selected=0;problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func askToReplace(_ action:String){
        if hasUnsavedWork {pendingReplacement=action;confirmation=true}
        else if action=="new" {newProject()}
        else if action=="open" {loadSavedProject()}
        else if action=="open-selected" {openSelectedProject()}
        else if action=="import" {importing=true}
    }
    private func saveLocally(){
        do {
            guard let data=projectData else {
                throw NativeWorldLabError.invalid("Create or import a project before saving.")
            }
            let baseline=try savedSnapshot.map{try NativeWorldLabProject.decode($0)}
            let current=try NativeWorldLabProject.decode(data)
            let expected=baseline?.id==current.id ? baseline?.revision : nil
            _ = try localProjects.save(data,expectedSavedRevision:expected)
            savedSnapshot=data;editHistory.clear();problem="";refreshSavedProjects()
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
            let validated=try NativeWorldLabProject.decode(data)
            try editHistory.record(before:old,after:data)
            project=validated
            projectData=data;dcRun=nil;wiredMotor=nil;digitalMotor=nil;hydroRun=nil;fluidPlaying=false;fluidMotion=nil;selected=min(selected,max(0,(project?.entities.count ?? 1)-1))
            problem="";redraw()
        }catch{problem=error.localizedDescription}
    }
    private func travelEdit(_ redo:Bool){
        do {
            guard let old=projectData else {
                throw NativeWorldLabError.invalid("Open a World Lab project first")
            }
            let next=try redo ? editHistory.redo(current:old) : editHistory.undo(current:old)
            guard let updated=next else {return}
            let restored=try NativeWorldLabProject.decode(updated)
            project=restored;projectData=updated
            dcRun=nil;wiredMotor=nil;digitalMotor=nil;hydroRun=nil
            fluidPlaying=false;fluidMotion=nil
            dropPlaying=false;dropRun=nil;motorPlaying=false;motorRun=nil
            selected=min(selected,max(0,restored.entities.count-1))
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
                if !savedProjects.isEmpty {
                    Picker("Saved World Lab projects",selection:$chosenSavedId){
                        ForEach(savedProjects,id:\.id){item in
                            Text(item.title+" · rev "+String(item.revision)).tag(item.id)
                        }
                    }.pickerStyle(.menu)
                    HStack {
                        Button("Open selected project"){askToReplace("open-selected")}
                            .buttonStyle(.bordered).disabled(chosenSavedId.isEmpty)
                        Button("Delete selected saved project",role:.destructive){
                            confirmingDelete=true
                        }.buttonStyle(.bordered).disabled(chosenSavedId.isEmpty)
                    }
                }
                if hasUnsavedWork {
                    Text("Unsaved on this device. Save locally or export JSON to preserve these changes.")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let project { projectContent(project) }
                if !problem.isEmpty {Text(problem).foregroundStyle(.red)}
                Text("Model 1.0.0 · computed with assumed parameters · not a safety assessment.")
                    .font(.caption2).foregroundStyle(.secondary)
            }.padding(14)
        }
        .onAppear{redraw();lastTick=Date();refreshSavedProjects()}
        .onChange(of:mode){_ in seconds=0;playing=false;redraw()}
        .onChange(of:seconds){_ in redraw()}
        .onChange(of:dropTime){_ in applyDropPosition()}
        .onChange(of:fluidTime){_ in applyFluidPosition()}
        .onChange(of:motorTime){_ in applyMotorPosition()}
        .onChange(of:seeInside){_ in redraw()}
        .onChange(of:mass){_ in redraw()}
        .onChange(of:resistance){_ in redraw()}
        .onChange(of:diffusivity){_ in redraw()}
        .onChange(of:reactionHeat){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:reactionFactor){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:reactionHeater){_ in
            chemicalPlaying=false;chemicalRun=nil;chemicalTime=0
        }
        .onChange(of:fluidDensity){_ in
            hydroRun=nil;fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidSurfaceHeight){_ in
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidDrag){_ in
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
        }
        .onChange(of:fluidFraction){_ in hydroRun=nil }
        .onChange(of:projectData){_ in
            // Never reuse a prior computed trajectory after geometry/material edits.
            fluidPlaying=false;fluidMotion=nil;fluidTime=0
            beamRun=nil
            dropPlaying=false;dropRun=nil;dropEntityId=nil;dropTime=0
            motorPlaying=false;motorRun=nil;digitalMotor=nil;motorEntityId=nil;motorTime=0;redraw()
        }
        .confirmationDialog("Delete selected saved World Lab project?",
            isPresented:$confirmingDelete,titleVisibility:.visible){
            Button("Delete saved project",role:.destructive){deleteSelectedProject()}
            Button("Cancel",role:.cancel){}
        }message:{
            Text("Only the selected local-device copy is deleted. Export JSON first if needed.")
        }
        .onReceive(timer){now in
            let dt=max(0,min(0.25,now.timeIntervalSince(lastTick)))
            lastTick=now
            if playing {seconds=min(12,seconds+dt*speed);if seconds>=12{playing=false}}
            if motorPlaying,let run=motorRun {
                motorTime=min(run.samples.last?.timeSeconds ?? 4,motorTime+dt*motorSpeed)
                if motorTime >= (run.samples.last?.timeSeconds ?? 4){motorPlaying=false}
            }
            if chemicalPlaying,let run=chemicalRun {
                chemicalTime=min(run.samples.last?.timeSeconds ?? 6,
                    chemicalTime+dt)
                if chemicalTime >= (run.samples.last?.timeSeconds ?? 6){
                    chemicalPlaying=false
                }
            }
            if fluidPlaying,let run=fluidMotion {
                fluidTime=min(run.samples.last?.timeSeconds ?? 4,fluidTime+dt)
                if fluidTime >= (run.samples.last?.timeSeconds ?? 4) {
                    fluidPlaying=false
                }
            }
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
                else if pendingReplacement=="open-selected" {openSelectedProject()}
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
                editHistory.clear()
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

    @ViewBuilder private func digitalContent(_ project:NativeWorldLabProject)->some View {
        Text("Invent digital logic").font(.headline)
        Text("Boolean truth tables from your assumptions, not measured chip behavior.")
            .font(.caption).foregroundStyle(.secondary)
        if let network=project.digitalNetworks?.first {
            ForEach(network.inputs,id:\.id){input in
                Toggle(input.label,isOn:Binding(
                    get:{input.value},
                    set:{newValue in
                        applyProject{try NativeWorldLabEditor.digitalSwitch(
                            $0,networkId:network.id,inputId:input.id,value:newValue)}
                    }))
            }
            ForEach(network.gates,id:\.id){gate in
                Text(gate.name+" · "+gate.assumption).font(.caption)
                ForEach(gate.truthTable.indices,id:\.self){index in
                    let bit=gate.truthTable[index]
                    HStack{
                        Text(String(repeating:"0",count:max(0,gate.inputNodeIds.count - String(index,radix:2).count)) + String(index,radix:2))
                        Spacer()
                        Button("Output "+String(bit)+" · toggle"){
                            applyProject{try NativeWorldLabEditor.digitalTruthBit(
                                $0,networkId:network.id,gateId:gate.id,
                                row:index,bit:1-bit)}
                        }.buttonStyle(.bordered)
                    }
                }
            }
            TextField("Name your invented digital gate",text:$digitalNewGateName)
                .textFieldStyle(.roundedBorder)
            TextField("Assumed Boolean behavior",text:$digitalAssumption)
                .textFieldStyle(.roundedBorder)
            Picker("First digital input",selection:$digitalSourceA){
                ForEach(network.inputs,id:\.id){node in Text(node.label).tag(node.id)}
                ForEach(network.gates,id:\.id){node in Text(node.name).tag(node.id)}
            }.pickerStyle(.menu)
            Picker("Optional second digital input",selection:$digitalSourceB){
                Text("None").tag("")
                ForEach(network.inputs,id:\.id){node in Text(node.label).tag(node.id)}
                ForEach(network.gates,id:\.id){node in Text(node.name).tag(node.id)}
            }.pickerStyle(.menu)
            let available=network.inputs.map(\.id)+network.gates.map(\.id)
            let ports=[digitalSourceA]+(digitalSourceB.isEmpty ? [] : [digitalSourceB])
            Button("Connect a new invented gate"){
                applyProject{try NativeWorldLabEditor.addDigitalGate(
                    $0,networkId:network.id,name:digitalNewGateName,
                    assumption:digitalAssumption,inputNodeIds:ports)}
            }.buttonStyle(.bordered)
                .disabled(digitalNewGateName.trimmingCharacters(
                    in:.whitespacesAndNewlines).isEmpty ||
                    digitalAssumption.trimmingCharacters(
                    in:.whitespacesAndNewlines).isEmpty ||
                    network.gates.count>=32 || Set(ports).count != ports.count ||
                    !ports.allSatisfy({available.contains($0)}))
            Text("Choose upstream signals, edit each truth-table row, and connect an indicator.")
                .font(.caption).foregroundStyle(.secondary)
            ForEach(network.outputs,id:\.id){output in
                Picker(output.label+" reads",selection:Binding<String>(
                    get:{output.sourceNodeId},
                    set:{newSource in
                        applyProject{try NativeWorldLabEditor.digitalOutputSource(
                            $0,networkId:network.id,outputId:output.id,
                            sourceNodeId:newSource)}
                    })){
                    ForEach(network.inputs,id:\.id){input in
                        Text(input.label).tag(input.id)
                    }
                    ForEach(network.gates,id:\.id){gate in
                        Text(gate.name).tag(gate.id)
                    }
                }.pickerStyle(.menu)
                    .accessibilityLabel("Wire "+output.label+" to digital node")
            }
            Button(digitalShowCases ? "Hide all logic cases":"Check every input combination"){
                digitalShowCases.toggle()
            }.buttonStyle(.bordered)
            if digitalShowCases {
                if let cases=try? NativeWorldLabDigitalLogic.truthTable(network) {
                    Text("Checked "+String(cases.count)+" assumed Boolean combinations.")
                        .font(.caption)
                    ForEach(0..<min(16,cases.count),id:\.self){index in
                        let indexBits=String(index,radix:2)
                        let label=String(repeating:"0",
                            count:max(0,network.inputs.count-indexBits.count)) + indexBits
                        let bits=network.outputs.map{String(cases[index][$0.id] ?? 0)}
                            .joined()
                        Text(label+" → "+bits).font(.caption.monospaced())
                    }
                    if cases.count>16 {
                        Text("First 16 shown. Full limit is 256 input cases.")
                            .font(.caption)
                    }
                }else {
                    Text("Exhaustive check supports at most eight switches.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let values=try? NativeWorldLabDigitalLogic.evaluate(network) {
                ForEach(network.outputs,id:\.id){output in
                    Text(output.label+": "+String(values[output.id] ?? 0))
                }
            }else {Text("Digital network could not be calculated.")}
        }else {
            Button("Start invented logic"){
                applyProject{try NativeWorldLabEditor.startDigitalInvention($0)}
            }.buttonStyle(.bordered)
        }
    }
    @ViewBuilder private func projectContent(_ project:NativeWorldLabProject)->some View {

                    Text(project.title+" · "+String(project.entities.count)+" solids")
                        .font(.headline)
                    digitalContent(project)
                    chemicalContent()
                    Text("Connected DC circuits").font(.headline)
                    if let circuit=project.networks?.first { circuitContent(circuit,project:project) }else {
                        Button("Build first circuit"){
                            applyProject{try NativeWorldLabEditor.starterCircuit($0)}
                        }.buttonStyle(.bordered)
                    }
                    HStack(spacing:8){
                        Button("Add cube"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"box")}}
                        Button("Add sphere"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"sphere")}}
                        Button("Add cylinder"){applyProject{try NativeWorldLabEditor.addSolid($0,shape:"cylinder")}}
                    }.buttonStyle(.bordered).disabled(project.entities.count>=200)
                    Text("Build from visual parts").font(.headline)
                    Text("Connect solid shapes for coordinated movement, not a calculated mechanical joint.")
                        .font(.caption).foregroundStyle(.secondary)
                    if let chosen=solid {
                        let available=project.entities.filter{candidate in
                            candidate.id != chosen.id &&
                            !(project.assemblies ?? []).contains(where:{
                                $0.entityIds.contains(candidate.id)
                            })
                        }
                        TextField("Assembly name",text:$assemblyName)
                            .textFieldStyle(.roundedBorder)
                        Picker("Second part",selection:$assemblySecondId){
                            Text("Choose a second solid").tag("")
                            ForEach(available,id:\.id){candidate in
                                Text(candidate.name).tag(candidate.id)
                            }
                        }.pickerStyle(.menu)
                        Button("Group these parts"){
                            applyProject{try NativeWorldLabEditor.createVisualAssembly(
                                $0,name:assemblyName,
                                entityIds:[chosen.id,assemblySecondId])}
                        }.buttonStyle(.bordered)
                            .disabled(assemblySecondId.isEmpty ||
                                !available.contains(where:{$0.id==assemblySecondId}) ||
                                assemblyName.isEmpty ||
                                (project.assemblies?.count ?? 0)>=50 ||
                                (project.assemblies ?? []).contains(where:{
                                    $0.entityIds.contains(chosen.id)
                                }))
                    }
                    ForEach(project.assemblies ?? [],id:\.id){group in
                        VStack(alignment:.leading,spacing:6){
                            Text(group.name+" · "+String(group.entityIds.count)+" parts")
                                .font(.subheadline)
                            HStack {
                                ForEach(0..<3,id:\.self){axis in
                                    Button("Move +"+["X","Y","Z"][axis]){
                                        var delta=[0.0,0.0,0.0]
                                        delta[axis]=0.5
                                        applyProject{try NativeWorldLabEditor.moveVisualAssembly(
                                            $0,id:group.id,deltaMeters:delta)}
                                    }
                                }
                            }.buttonStyle(.bordered)
                            Button("Ungroup safely"){
                                applyProject{try NativeWorldLabEditor.ungroupVisualAssembly(
                                    $0,id:group.id)}
                            }.buttonStyle(.bordered)
                        }
                    }
                    HStack {
                        Button("Undo"){travelEdit(false)}.disabled(!editHistory.canUndo)
                        Button("Redo"){travelEdit(true)}.disabled(!editHistory.canRedo)
                    }.buttonStyle(.bordered)
                    if let solid { solidContent(project:project,solid:solid) }
                    TextField("Invented material name",text:$inventedName)
                        .textFieldStyle(.roundedBorder)
                    TextField("Assumed density in kg/m³ (optional)",text:$inventedDensity)
                        .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
                    TextField("Assumed Young's modulus in Pa (optional)",text:$inventedModulus)
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
                            let modulus:Double?
                            if inventedModulus.trimmingCharacters(in:.whitespaces).isEmpty {
                                modulus=nil
                            }else if let value=Double(inventedModulus) {modulus=value}
                            else {throw NativeWorldLabError.invalid("Young's modulus must be numeric")}
                            let id=UUID().uuidString
                            applyProject {old in
                                let first=try NativeWorldLabEditor.addHypotheticalMaterial(
                                    old,name:inventedName,densityKgM3:density,
                                    youngModulusPa:modulus,id:id)
                                if let solid {
                                    return try NativeWorldLabEditor.assignMaterial(
                                        first,solidId:solid.id,materialId:id)
                                }
                                return first
                            }
                            if problem.isEmpty {
                                inventedName="";inventedDensity="";inventedModulus=""
                            }
                        }catch{problem=error.localizedDescription}
                    }.buttonStyle(.borderedProminent)
                    Text("An invented Young's modulus can power a bounded analytical beam model. Unknown strength, fractures and chemical behavior remain unverified.")
                        .font(.caption).foregroundStyle(.secondary)
                
    }
    @ViewBuilder private func chemicalContent()->some View {
Text("Invent chemical heat").font(.headline)
                    Text("Invent assumed reaction properties; the model cannot identify real chemicals.")
                        .font(.caption).foregroundStyle(.secondary)
                    value("Assumed heat released",reactionHeat,"J/mol")
                    Slider(value:$reactionHeat,in:-50000...100000)
                        .accessibilityLabel("Hypothetical reaction heat")
                    value("Assumed reaction factor",reactionFactor,"1/s")
                    Slider(value:$reactionFactor,in:0...5)
                        .accessibilityLabel("Hypothetical reaction factor")
                    value("External heater",reactionHeater,"W")
                    Slider(value:$reactionHeater,in:-200...200)
                        .accessibilityLabel("External reaction heater power")
                    Button("Calculate reaction temperature"){
                        do {
                            var input=NativeChemicalThermalInput()
                            input.reactionHeatReleasedJPerMol=reactionHeat
                            input.preExponentialPerS=reactionFactor
                            input.externalHeatingW=reactionHeater
                            chemicalRun=try NativeWorldLabChemicalThermal.evaluate(input)
                            chemicalTime=0;chemicalPlaying=true;problem=""
                        }catch{
                            chemicalRun=nil;chemicalPlaying=false
                            problem=error.localizedDescription
                        }
                    }.buttonStyle(.bordered)
                    if let chemical=chemicalRun,!chemical.samples.isEmpty {
                        let index=max(0,min(chemical.samples.count-1,
                            Int((chemicalTime/chemical.stepSeconds).rounded())))
                        let observation=chemical.samples[index]
                        value("Reaction time",observation.timeSeconds,"s")
                        value("Converted amount",observation.productFormedMol,"mol")
                        value("Computed temperature",observation.temperatureK,"K")
                        value("Reaction thermal power",observation.reactionPowerW,"W")
                        value("Energy residual",observation.energyResidualJ,"J")
                        Slider(value:$chemicalTime,
                            in:0...(chemical.samples.last?.timeSeconds ?? 6)) { editing in
                            if editing {chemicalPlaying=false}
                        }.accessibilityLabel("Explore chemical time")
                        HStack {
                            Button(chemicalPlaying ? "Pause reaction":"Play reaction"){
                                chemicalPlaying.toggle()
                            }
                            Button("Reset reaction"){chemicalPlaying=false;chemicalTime=0}
                            Button("Step reaction"){
                                chemicalPlaying=false
                                chemicalTime=min(
                                    chemical.samples.last?.timeSeconds ?? 6,
                                    chemicalTime+chemical.stepSeconds)
                            }
                        }.buttonStyle(.bordered)
                        Text(chemical.validity).font(.caption).foregroundStyle(.secondary)
                    }
                    
    }
    @ViewBuilder private func circuitContent(_ circuit:NativeLabCircuitNetwork,
        project:NativeWorldLabProject)->some View {

                        Text(circuit.name+" · "+String(circuit.components.count)+" wired parts")
                            .font(.caption)
                        HStack {
                            Button("Add parallel resistor") {
                                applyProject{try NativeWorldLabEditor.addParallelResistor($0)}
                            }.disabled(circuit.components.count>=48)
                            Button("Calculate circuit") {
                                do {
                                    dcRun=try NativeWorldLabDc.solve(circuit,project:project)
                                    problem=""
                                }catch {
                                    dcRun=nil;problem=error.localizedDescription
                                }
                            }
                        }.buttonStyle(.bordered)
                        TextField("Invented component name",text:$deviceName)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityLabel("Invented electrical component name")
                        TextField("Unverified behavior assumption",text:$deviceAssumption)
                            .textFieldStyle(.roundedBorder)
                        TextField("Optional equivalent resistance Ω",text:$deviceResistance)
                            .textFieldStyle(.roundedBorder)
                            .keyboardType(.decimalPad)
                        Button("Add hypothetical component"){
                            do {
                                let ohms:Double?
                                if deviceResistance.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty {
                                    ohms=nil
                                }else {
                                    guard let parsed=Double(deviceResistance) else {
                                        throw NativeWorldLabError.invalid("Assumed resistance must be numerical")
                                    }
                                    ohms=parsed
                                }
                                applyProject{try NativeWorldLabEditor.inventOhmicDevice(
                                    $0,name:deviceName,assumption:deviceAssumption,
                                    assumedResistanceOhm:ohms)}
                                deviceName="";deviceAssumption="";deviceResistance=""
                            }catch{problem=error.localizedDescription}
                        }.buttonStyle(.bordered)
                            .disabled(deviceName.isEmpty || deviceAssumption.isEmpty ||
                                circuit.components.count>=48)
                        Text("Unverified inventions require explicit assumed electrical behavior.")
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(circuit.components.filter{$0.kind=="hypothetical-device"},id:\.id){part in
                            Text(part.name ?? "Unknown component")
                                .font(.caption)
                            Text(part.assumedResistanceOhm.map{
                                "Equivalent resistance assumed: "+String($0)+" Ω"
                            } ?? "No supported electrical law")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Text("Connect more parts and wire junctions").font(.headline)
                        HStack {
                            TextField("New junction name",text:$junctionName)
                                .textFieldStyle(.roundedBorder)
                            Button("Add junction"){
                                applyProject{try NativeWorldLabEditor.addCircuitNode(
                                    $0,label:junctionName)}
                                junctionName=""
                            }.disabled(junctionName.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty ||
                                circuit.nodes.count>=24)
                        }.buttonStyle(.bordered)
                        ForEach(circuit.nodes,id:\.id){node in
                            HStack {
                                Text(node.label).font(.caption)
                                Spacer()
                                Button("Remove unused"){
                                    applyProject{try NativeWorldLabEditor.removeUnusedCircuitNode(
                                        $0,id:node.id)}
                                }.disabled(node.id==circuit.groundNodeId ||
                                    circuit.nodes.count<=2 ||
                                    circuit.components.contains(where:{
                                        $0.positiveNodeId==node.id || $0.negativeNodeId==node.id
                                    }))
                            }.buttonStyle(.bordered)
                        }
                        HStack {
                            Picker("From node",selection:$positiveWire){
                                ForEach(circuit.nodes,id:\.id){node in
                                    Text(node.label).tag(node.id)
                                }
                            }.pickerStyle(.menu)
                            Picker("To node",selection:$negativeWire){
                                ForEach(circuit.nodes,id:\.id){node in
                                    Text(node.label).tag(node.id)
                                }
                            }.pickerStyle(.menu)
                        }
                        Button("Connect 200 Ω resistor"){
                            applyProject{try NativeWorldLabEditor.addCircuitResistor(
                                $0,positive:positiveWire,negative:negativeWire)}
                        }.buttonStyle(.bordered)
                            .disabled(positiveWire==negativeWire ||
                                circuit.components.count>=48 ||
                                !circuit.nodes.contains(where:{$0.id==positiveWire}) ||
                                !circuit.nodes.contains(where:{$0.id==negativeWire}))
                        Text("Edit existing component terminals").font(.subheadline)
                        ForEach(circuit.components,id:\.id){part in
                            Text(part.kind=="hypothetical-device"
                                ? part.name ?? "Unknown invention" : part.kind)
                                .font(.caption)
                            HStack {
                                Picker("Positive terminal",
                                    selection:Binding<String>(
                                        get:{part.positiveNodeId},
                                        set:{value in
                                            applyProject{try NativeWorldLabEditor.rewireCircuitPart(
                                                $0,id:part.id,positive:value,
                                                negative:part.negativeNodeId)}
                                        })){
                                    ForEach(circuit.nodes,id:\.id){node in
                                        Text(node.label).tag(node.id)
                                    }
                                }.pickerStyle(.menu)
                                Picker("Negative terminal",
                                    selection:Binding<String>(
                                        get:{part.negativeNodeId},
                                        set:{value in
                                            applyProject{try NativeWorldLabEditor.rewireCircuitPart(
                                                $0,id:part.id,positive:part.positiveNodeId,
                                                negative:value)}
                                        })){
                                    ForEach(circuit.nodes,id:\.id){node in
                                        Text(node.label).tag(node.id)
                                    }
                                }.pickerStyle(.menu)
                            }
                        }
                        Text("Only real shared circuit node IDs create connections; no measured wiring geometry is claimed.")
                            .font(.caption).foregroundStyle(.secondary)
                        ForEach(circuit.components.filter{$0.kind=="dc-source"||$0.kind=="resistor"},
                            id:\.id){part in
                            HStack {
                                let isSource=part.kind=="dc-source"
                                let value=part.voltageV ?? part.resistanceOhm ?? 0
                                Text(String(format:"%.2f",value)+(isSource ? " V" : " Ω"))
                                Button("−"){
                                    applyProject{try NativeWorldLabEditor.adjustCircuitComponent(
                                        $0,id:part.id,delta:isSource ? -1 : -10)}
                                }
                                Button("+"){
                                    applyProject{try NativeWorldLabEditor.adjustCircuitComponent(
                                        $0,id:part.id,delta:isSource ? 1 : 10)}
                                }
                                if !isSource {
                                    Button("Remove"){
                                        applyProject{try NativeWorldLabEditor.removeCircuitComponent($0,id:part.id)}
                                    }
                                }
                            }.buttonStyle(.bordered)
                        }
                        if let run=dcRun,run.projectId==project.id,
                           run.projectRevision==project.revision,run.networkId==circuit.id {
                            value("Power delivered",run.deliveredPowerW,"W")
                            value("Resistor heating",run.resistorHeatW,"W")
                            value("Power residual",run.powerResidualW,"W")
                            ForEach(run.branchCurrentsA.keys.sorted(),id:\.self){id in
                                value(id+" current",run.branchCurrentsA[id],"A")
                            }
                            Text(run.validity).font(.caption).foregroundStyle(.secondary)
                        }
                    
    }
    @ViewBuilder private func solidContent(project:NativeWorldLabProject,
        solid:NativeLabSolid)->some View {
        solidPlacementContent(project:project,solid:solid)
        solidBeamContent(project:project,solid:solid)
        Text("Material: "+(material?.name ?? "Unknown")+" (hypothetical)")
                                value("Assumed mass",assumedMass,"kg")
        solidFluidContent(project:project,solid:solid)
        solidHydroContent(project:project,solid:solid)
        if let derived=assumedMass,derived>=0.001,derived<=10000 {
            solidEnergyControlsContent(project:project,solid:solid,derived:derived)
            solidMotorReadoutContent(project:project,solid:solid)
            solidDropReadoutContent(project:project,solid:solid)
        }
    }

    @ViewBuilder private func solidBeamContent(
        project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
        let chosen=project.materials.first(where:{$0.id==solid.materialId})
        Text("Test hypothetical elastic beam bending").font(.headline)
        Text("Assume a rectangular cantilever: X length, Y vertical depth, Z width, fixed at one end, with a static downward force at the free end.")
            .font(.caption).foregroundStyle(.secondary)
        value("Assumed Young's modulus",chosen?.youngModulusPa,"Pa")
        TextField("Downward beam tip load in newtons",text:$beamForce)
            .keyboardType(.decimalPad).textFieldStyle(.roundedBorder)
        Button("Calculate elastic bending"){
            do {
                guard let load=Double(beamForce) else {
                    throw NativeWorldLabError.invalid("Tip load must be a finite number")
                }
                beamRun=try NativeWorldLabStructural.bending(project,
                    entityId:solid.id,forceN:load)
                problem=""
            }catch {beamRun=nil;problem=error.localizedDescription}
        }.buttonStyle(.bordered)
            .disabled(solid.shape != "box" || (chosen?.youngModulusPa ?? 0)<=0)
        if let run=beamRun,run.projectId==project.id,
           run.projectRevision==project.revision,run.entityId==solid.id,
           run.forceN==Double(beamForce) {
            value("Free-end deflection",run.tipDeflectionM,"m")
            value("Maximum bending stress",run.maximumStressPa,"Pa")
            value("Maximum surface strain",run.surfaceStrain,"")
            Text(run.validity).font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func solidPlacementContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
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
                        Text("Position and measure").font(.headline)
                        HStack {
                            Picker("Grid spacing",selection:$gridSpacing) {
                                Text("0.1 m").tag(0.1)
                                Text("0.5 m").tag(0.5)
                                Text("1 m").tag(1.0)
                                Text("5 m").tag(5.0)
                            }.pickerStyle(.menu).accessibilityLabel("Grid snap spacing")
                            Button("Snap center"){
                                applyProject{try NativeWorldLabEditor.snapSolid(
                                    $0,id:solid.id,gridMeters:gridSpacing)}
                            }.buttonStyle(.bordered)
                        }
                        let others=project.entities.filter{$0.id != solid.id}
                        if !others.isEmpty {
                            Picker("Measure to",selection:$measureTargetId){
                                Text("Choose another solid").tag("")
                                ForEach(others,id:\.id){candidate in
                                    Text(candidate.name).tag(candidate.id)
                                }
                            }.pickerStyle(.menu)
                                .accessibilityLabel("Measure distance to solid")
                            if let other=others.first(where:{$0.id==measureTargetId}),
                               let measurement=try? NativeWorldLabEditor.measureCenters(
                                  project,fromId:solid.id,toId:other.id) {
                                value("Center distance",measurement.centerDistanceM,"m")
                                value("Horizontal distance",measurement.horizontalDistanceM,"m")
                                value("X offset",measurement.offsetXM,"m")
                                value("Y offset",measurement.offsetYM,"m")
                                value("Z offset",measurement.offsetZM,"m")
                                if let clearance=try? NativeWorldLabSpatial.inspect(solid,other) {
                                    value("Bounding-box clearance lower bound",
                                        clearance.gapLowerBoundMeters,"m")
                                    Text("Bounds: "+clearance.status.replacingOccurrences(
                                        of:"-",with:" "))
                                    if clearance.status=="box-intersection" {
                                        let overlapText=clearance.overlapDepthMeters
                                            .map { String(format:"%.4f",$0) }
                                            .joined(separator:" / ")
                                        Text("Box overlap X/Y/Z: \(overlapText) m")
                                    }
                                    Text(clearance.validity)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }

    }

    @ViewBuilder private func solidFluidContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                        Text("Try floating your invention").font(.headline)
                        value("Liquid surface height",fluidSurfaceHeight,"m")
                        Slider(value:$fluidSurfaceHeight,in:0...5) { editing in
                            if editing {fluidPlaying=false;fluidMotion=nil}
                        }.accessibilityLabel("Liquid surface above ground")
                        value("Assumed fluid drag",fluidDrag,"N·s/m")
                        Slider(value:$fluidDrag,in:0...1000) { editing in
                            if editing {fluidPlaying=false;fluidMotion=nil}
                        }.accessibilityLabel("Assumed viscous damping")
                        Button("Simulate floating or sinking"){
                            do {
                                let startingHeight=max(0,
                                    solid.positionMeters[1]-solid.dimensionsMeters[1]/2)
                                let input=NativeLabFluidMotionInput(
                                    fluidDensityKgM3:fluidDensity,
                                    waterSurfaceHeightM:fluidSurfaceHeight,
                                    startingBottomHeightM:startingHeight,
                                    linearDragNsPerM:fluidDrag)
                                fluidMotion=try NativeWorldLabFluidMotion.evaluate(
                                    project,entityId:solid.id,input:input)
                                fluidTime=0;fluidPlaying=true;problem=""
                                scene.rootNode.childNode(withName:"world-lab-fluid-plane",
                                    recursively:false)?.removeFromParentNode()
                                let plane=SCNPlane(width:12,height:12)
                                plane.firstMaterial?.diffuse.contents=UIColor.systemBlue
                                plane.firstMaterial?.transparency=0.25
                                plane.firstMaterial?.isDoubleSided=true
                                let water=SCNNode(geometry:plane)
                                water.name="world-lab-fluid-plane"
                                water.eulerAngles.x = -Float.pi/2
                                water.position.y=Float(fluidSurfaceHeight)
                                scene.rootNode.addChildNode(water)
                                applyFluidPosition()
                            }catch{
                                fluidPlaying=false;fluidMotion=nil
                                problem=error.localizedDescription
                            }
                        }.buttonStyle(.bordered)
                        if let run=fluidMotion,run.projectId==project.id,
                           run.projectRevision==project.revision,run.entityId==solid.id,
                           !run.samples.isEmpty {
                            let index=max(0,min(run.samples.count-1,
                                Int((fluidTime/run.stepSeconds).rounded())))
                            let observation=run.samples[index]
                            value("Simulated fluid time",observation.timeSeconds,"s")
                            value("Bottom height",observation.bottomHeightM,"m")
                            value("Vertical velocity",observation.velocityMps,"m/s")
                            value("Submerged depth",observation.immersionDepthM,"m")
                            value("Calculated buoyancy",observation.buoyancyForceN,"N")
                            value("Energy residual",observation.energyResidualJ,"J")
                            Slider(value:$fluidTime,
                                in:0...(run.samples.last?.timeSeconds ?? 4)) { editing in
                                if editing {fluidPlaying=false}
                            }.accessibilityLabel("Explore fluid motion time")
                            HStack {
                                Button(fluidPlaying ? "Pause fluid":"Play fluid"){
                                    fluidPlaying.toggle()
                                }
                                Button("Reset fluid"){fluidPlaying=false;fluidTime=0}
                                Button("Step fluid"){
                                    fluidPlaying=false
                                    fluidTime=min(run.samples.last?.timeSeconds ?? 4,
                                        fluidTime+run.stepSeconds)
                                }
                            }.buttonStyle(.bordered)
                            Text(run.validity).font(.caption).foregroundStyle(.secondary)
                            Text("Blue 3D plane is an assumed flat fluid surface, not measured water.")
                                .font(.caption).foregroundStyle(.secondary)
                        }

    }

    @ViewBuilder private func solidHydroContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                        value("Assumed fluid density",fluidDensity,"kg/m³")
                        Slider(value:$fluidDensity,in:100...2500) { editing in
                            if editing {hydroRun=nil}
                        }.accessibilityLabel("Fluid density")
                        Text("Immersion depth: \(Int(fluidFraction*100))% of height")
                            .font(.caption)
                        Slider(value:$fluidFraction,in:0...1) { editing in
                            if editing {hydroRun=nil}
                        }.accessibilityLabel("Fraction of solid submerged")
                        Button("Calculate buoyancy"){
                            do {
                                hydroRun=try NativeWorldLabHydrostatics.evaluate(
                                    project,entityId:solid.id,fluidDensityKgM3:fluidDensity,
                                    immersionDepthM:solid.dimensionsMeters[1]*fluidFraction)
                                problem=""
                            }catch {hydroRun=nil;problem=error.localizedDescription}
                        }.buttonStyle(.bordered)
                        if let liquid=hydroRun,liquid.projectId==project.id,
                           liquid.projectRevision==project.revision,liquid.entityId==solid.id {
                            value("Displaced fluid",liquid.displacedVolumeM3,"m³")
                            value("Upward buoyancy",liquid.buoyancyForceN,"N")
                            value("Bottom gauge pressure",liquid.bottomGaugePressurePa,"Pa")
                            Text("Floating status: "+liquid.status)
                            value("Net upward force",liquid.netUpwardForceN,"N")
                            value("Equilibrium draft",liquid.equilibriumDraftM,"m")
                            Text(liquid.validity).font(.caption).foregroundStyle(.secondary)
                        }

    }

    @ViewBuilder private func solidEnergyControlsContent(project:NativeWorldLabProject,solid:NativeLabSolid,derived:Double)->some View {
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
                            Button(motorThermalEnabled ? "Coil heating: on" : "Coil heating: off"){
                                motorThermalEnabled.toggle()
                                motorRun=nil;motorAudit=nil;motorPlaying=false
                            }.buttonStyle(.bordered)
                            Button("Power this solid"){
                                do {
                                    var input=NativeActuatorInput(massKg:derived)
                                    if motorThermalEnabled {input.thermal=NativeActuatorThermalInput()}
                                    let result=try NativeWorldLabActuator.evaluate(input)
                                    motorAudit=try NativeWorldLabActuator.numericalAudit(input,result)
                                    motorRun=result;wiredMotor=nil;digitalMotor=nil
                                    motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                    dropPlaying=false;playing=false;problem=""
                                    applyMotorPosition()
                                }catch{problem=error.localizedDescription}
                            }.buttonStyle(.bordered)
                            if let circuit=project.networks?.first {
                                Button("Wire motor to circuit"){
                                    do {
                                        let linked=try NativeWorldLabNetworkMotor.evaluate(
                                            project,network:circuit,entityId:solid.id,
                                            massKg:derived,thermal:motorThermalEnabled)
                                        guard let supply=circuit.components.first(where:{$0.kind=="dc-source"})?.voltageV else {
                                            throw NativeWorldLabError.invalid("Circuit source voltage is missing")
                                        }
                                        var input=NativeActuatorInput(massKg:derived)
                                        input.supplyVoltageV=supply
                                        if motorThermalEnabled {
                                            input.thermal=NativeActuatorThermalInput()
                                        }
                                        motorAudit=try NativeWorldLabActuator.numericalAudit(
                                            input,linked.motor)
                                        wiredMotor=linked;digitalMotor=nil;motorRun=linked.motor
                                        motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                        dropPlaying=false;playing=false;problem=""
                                        applyMotorPosition()
                                    }catch{problem=error.localizedDescription}
                                }.buttonStyle(.bordered)
                            }

                            if let logic=project.digitalNetworks?.first {
                                ForEach(logic.outputs,id:\.id){output in
                                    Button("Drive with invented logic: "+output.label){
                                        do {
                                            let linked=try NativeWorldLabDigitalMotor.evaluate(
                                                project,networkId:logic.id,outputId:output.id,
                                                entityId:solid.id,massKg:derived,
                                                thermal:motorThermalEnabled)
                                            let verified=try NativeWorldLabActuator.numericalAudit(
                                                linked.input,linked.motor)
                                            digitalMotor=linked;wiredMotor=nil
                                            motorRun=linked.motor;motorAudit=verified
                                            motorEntityId=solid.id;motorTime=0;motorPlaying=true
                                            dropPlaying=false;playing=false;problem=""
                                            applyMotorPosition()
                                        }catch {digitalMotor=nil;problem=error.localizedDescription}
                                    }.buttonStyle(.bordered)
                                }
                            }


    }

    @ViewBuilder private func solidMotorReadoutContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
                            if let run=motorRun,motorEntityId==solid.id {
                                let index=max(0,min(run.samples.count-1,
                                    Int((motorTime/run.stepSeconds).rounded())))
                                let sample=run.samples[index]
                                if let linked=digitalMotor,
                                    linked.projectId==project.id,
                                    linked.projectRevision==project.revision,
                                    linked.entityId==solid.id {
                                    Text("Invented digital output: "+String(linked.logicBit))
                                    value("Applied ideal voltage",linked.input.supplyVoltageV,"V")
                                    Text(linked.validity).font(.caption).foregroundStyle(.secondary)
                                }
                                value("Computed powered height",sample.heightM,"m")
                                value("Coil current",sample.currentA,"A")
                                value("Upward force",sample.motorForceN,"N")
                                value("Back-EMF",sample.backEmfV,"V")
                                value("Resistance heating",sample.resistiveHeatW,"W")
                                if let temperature=sample.coilTemperatureK,
                                    let r=sample.coilResistanceOhm {
                                    value("Coil temperature",temperature,"K")
                                    value("Hot coil resistance",r,"Ω")
                                    value("Stored coil heat",sample.thermalEnergyJ,"J")
                                    value("Cooling loss",sample.coolingPowerW,"W")
                                }
                                value("Energy balance residual",sample.energyResidualJ,"J")
                                if let wired=wiredMotor,wired.projectId==project.id,
                                   wired.projectRevision==project.revision,wired.entityId==solid.id {
                                    let observation=wired.samples[index]
                                    value("Total source current",observation.totalSourceCurrentA,"A")
                                    value("Parallel resistor heat",observation.passiveResistorHeatW,"W")
                                    value("Combined energy residual",observation.combinedEnergyResidualJ,"J")
                                    Text(wired.validity).font(.caption).foregroundStyle(.secondary)
                                }
                                if let audit=motorAudit {
                                    Text("Numerical self-check: \(audit.status). \(audit.explanation)")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Slider(value:$motorTime,in:0...(run.samples.last?.timeSeconds ?? 4))
                                    .accessibilityLabel("Motor simulated time")
                                HStack {
                                    Button(motorPlaying ? "Pause motor":"Play motor"){motorPlaying.toggle()}
                                    Button("Reset motor"){motorPlaying=false;motorTime=0}
                                }.buttonStyle(.bordered)
                                Text("Electricity and physical motion are coupled in one 1D solver. Material and actuator parameters are hypothetical, not measurements.")
                                    .font(.caption).foregroundStyle(.secondary)
                            }

    }

    @ViewBuilder private func solidDropReadoutContent(project:NativeWorldLabProject,solid:NativeLabSolid)->some View {
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

    private func applyMotorPosition(){
        guard let run=motorRun,let id=motorEntityId,
              let solid=project?.entities.first(where:{$0.id==id}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+id,recursively:false),
              !run.samples.isEmpty else{return}
        let index=max(0,min(run.samples.count-1,Int((motorTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2+run.samples[index].heightM)
    }
    private func applyFluidPosition() {
        guard let run=fluidMotion,
              let solid=project?.entities.first(where:{$0.id==run.entityId}),
              let node=scene.rootNode.childNode(withName:"lab-solid-"+run.entityId,
                recursively:false),!run.samples.isEmpty else {return}
        let index=max(0,min(run.samples.count-1,
            Int((fluidTime/run.stepSeconds).rounded())))
        node.position.y=Float(solid.dimensionsMeters[1]/2 + run.samples[index].bottomHeightM)
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
        applyMotorPosition()
    }
}
